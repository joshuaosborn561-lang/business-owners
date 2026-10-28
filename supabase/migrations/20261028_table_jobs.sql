-- Business Owners MCP: table-driven jobs.
-- Run in the Supabase project that holds the lead tables (campaignintelligence, azpapwtnrbzywlnxxecz).
-- Nothing here runs by itself: the service calls token-checked RPCs in `public` (bo_tj_*) with the publishable key + a
-- service token whose sha256 is stored in bo_jobs.api_token. The tables have RLS on and no grants.
--
-- Guard rails enforced HERE (the service enforces the same rules again):
--   * identifiers must be lowercase [a-z_][a-z0-9_]{0,62}; they are only ever used through %I / %L / catalog lookups
--   * source tables must live in a schema with can_read = true, destination tables in one with can_write = true
--   * destination table names must start with bo_ and are created by bo_tj_prepare_dest only (fixed shape)
--   * filters are structured JSON (column, op, value), never raw SQL
-- Re-runnable.

create schema if not exists bo_jobs;
revoke all on schema bo_jobs from public, anon, authenticated;

create table if not exists bo_jobs.api_token (
  token_sha256 text primary key,
  label        text,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

create table if not exists bo_jobs.allowed_schema (
  schema_name text primary key,
  can_read    boolean not null default false,
  can_write   boolean not null default false
);

insert into bo_jobs.allowed_schema (schema_name, can_read, can_write) values
  ('scratch',            true, true),
  ('client_emcor',       true, true),
  ('client_salesglider', true, true),
  ('client_peterson',    true, true),
  ('client_techevo',     true, true),
  ('lp',                 true, false),
  ('public',             true, false)
on conflict (schema_name) do nothing;

create table if not exists bo_jobs.job (
  job_id       text primary key,
  status       text not null default 'queued'
               check (status in ('queued','running','completed','capped','failed','cancelled')),
  source_table text not null,
  id_column    text not null,
  dest_table   text not null,
  column_map   jsonb not null default '{}'::jsonb,
  filters      jsonb not null default '[]'::jsonb,
  row_limit    integer,
  max_usd      numeric not null,
  client_tag   text,
  options      jsonb not null default '{}'::jsonb,
  estimate     jsonb,
  total        integer not null default 0,
  processed    integer not null default 0,
  named        integer not null default 0,
  missed       integer not null default 0,
  errors       integer not null default 0,
  spend_usd    numeric not null default 0,
  by_state     jsonb not null default '{}'::jsonb,
  error        text,
  runner_id    text,
  heartbeat_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

alter table bo_jobs.api_token      enable row level security;
alter table bo_jobs.allowed_schema enable row level security;
alter table bo_jobs.job            enable row level security;
revoke all on all tables in schema bo_jobs from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers (not exposed)

create or replace function bo_jobs.chk(tok text) returns void
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
begin
  if tok is null or not exists (
    select 1 from bo_jobs.api_token
     where token_sha256 = encode(sha256(convert_to(tok, 'utf8')), 'hex') and revoked_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- 'schema.table' -> regclass, only for allowlisted schemas.
create or replace function bo_jobs.rel(spec text, want_write boolean) returns regclass
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare parts text[]; sch text; tbl text; r regclass; k "char";
begin
  if spec is null then raise exception 'table required'; end if;
  parts := string_to_array(spec, '.');
  if array_length(parts, 1) is distinct from 2 then raise exception 'table must be schema.table'; end if;
  sch := parts[1]; tbl := parts[2];
  if sch !~ '^[a-z_][a-z0-9_]{0,62}$' or tbl !~ '^[a-z_][a-z0-9_]{0,62}$' then
    raise exception 'invalid identifier';
  end if;
  if not exists (select 1 from bo_jobs.allowed_schema a
                  where a.schema_name = sch and (case when want_write then a.can_write else a.can_read end)) then
    raise exception 'schema % is not allowed for %', sch, case when want_write then 'writes' else 'reads' end;
  end if;
  r := to_regclass(format('%I.%I', sch, tbl));
  if r is null then raise exception 'table not found: %.%', sch, tbl; end if;
  select c.relkind into k from pg_class c where c.oid = r;
  if want_write and k not in ('r','p') then raise exception 'destination must be a plain table'; end if;
  if not want_write and k not in ('r','p','v','m') then raise exception 'unsupported source relation'; end if;
  return r;
end $$;

create or replace function bo_jobs.qname(r regclass) returns text
language sql stable security definer set search_path = pg_catalog, bo_jobs as $$
  select format('%I.%I', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = r
$$;

-- validated column name (must exist on the relation)
create or replace function bo_jobs.col(r regclass, name text) returns text
language plpgsql stable security definer set search_path = pg_catalog, bo_jobs as $$
begin
  if name is null or name !~ '^[a-z_][a-z0-9_]{0,62}$' then raise exception 'invalid column name'; end if;
  if not exists (select 1 from pg_attribute a where a.attrelid = r and a.attname = name and a.attnum > 0 and not a.attisdropped) then
    raise exception 'column not found: %', name;
  end if;
  return name;
end $$;

-- structured filters -> WHERE fragment. Values are only ever inserted through %L.
create or replace function bo_jobs.where_sql(r regclass, alias text, filters jsonb) returns text
language plpgsql stable security definer set search_path = pg_catalog, bo_jobs as $$
declare f jsonb; c text; op text; typ text; ref text; parts text[] := '{}'; vals text; n int;
begin
  if filters is null or jsonb_typeof(filters) = 'null' then return 'true'; end if;
  if jsonb_typeof(filters) <> 'array' then raise exception 'filters must be an array'; end if;
  if jsonb_array_length(filters) > 20 then raise exception 'too many filters'; end if;
  for f in select value from jsonb_array_elements(filters) loop
    c := bo_jobs.col(r, f->>'column');
    select format_type(a.atttypid, a.atttypmod) into typ
      from pg_attribute a where a.attrelid = r and a.attname = c and a.attnum > 0 and not a.attisdropped;
    op := lower(coalesce(f->>'op', 'eq'));
    ref := format('%s.%I', alias, c);
    if op in ('eq','neq','gt','gte','lt','lte') then
      if f->>'value' is null then raise exception 'filter % needs a value', op; end if;
      parts := parts || format('%s %s %L::%s',
        ref, case op when 'eq' then '=' when 'neq' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end,
        f->>'value', typ);
    elsif op in ('like','ilike') then
      if f->>'value' is null then raise exception 'filter % needs a value', op; end if;
      parts := parts || format('%s::text %s %L escape %L', ref, op, f->>'value', '');
    elsif op in ('in','not_in') then
      if jsonb_typeof(f->'values') <> 'array' then raise exception 'filter % needs values[]', op; end if;
      n := jsonb_array_length(f->'values');
      if n = 0 or n > 1000 then raise exception 'filter % needs 1..1000 values', op; end if;
      select string_agg(format('%L::%s', x, typ), ',') into vals from jsonb_array_elements_text(f->'values') x;
      parts := parts || format('%s %s (%s)', ref, case op when 'in' then 'in' else 'not in' end, vals);
    elsif op = 'is_null' then parts := parts || format('%s is null', ref);
    elsif op = 'not_null' then parts := parts || format('%s is not null', ref);
    else raise exception 'unsupported filter op: %', op;
    end if;
  end loop;
  if array_length(parts, 1) is null then return 'true'; end if;
  return array_to_string(parts, ' and ');
end $$;

-- column_map jsonb {company_name: col, state: col, ...} -> validated (target, column) pairs as jsonb
create or replace function bo_jobs.cmap(r regclass, m jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bo_jobs as $$
declare k text; out jsonb := '{}'::jsonb;
begin
  if m is null or jsonb_typeof(m) <> 'object' then raise exception 'column_map must be an object'; end if;
  for k in select jsonb_object_keys(m) loop
    if k not in ('company_name','city','state','phone','domain','website','address','mailing_address') then
      raise exception 'unsupported column_map key: %', k;
    end if;
    out := out || jsonb_build_object(k, bo_jobs.col(r, m->>k));
  end loop;
  if not (out ? 'company_name') then raise exception 'column_map.company_name required'; end if;
  return out;
end $$;

-- base predicate: filters + non-blank company + not already done in dest
create or replace function bo_jobs.base_where(src regclass, dst regclass, cm jsonb, filters jsonb, idc text, retry_errors boolean) returns text
language plpgsql stable security definer set search_path = pg_catalog, bo_jobs as $$
declare w text;
begin
  w := bo_jobs.where_sql(src, 's', filters)
       || format(' and nullif(btrim(s.%I::text), '''') is not null', cm->>'company_name');
  if dst is not null then
    w := w || format(' and not exists (select 1 from %s d where d.source_id = s.%I::text and not (d.status = ''error'' and %L::boolean and d.attempts < 3))',
                     bo_jobs.qname(dst), idc, retry_errors);
  end if;
  return w;
end $$;

-- ---------------------------------------------------------------- RPCs (token-checked)

create or replace function public.bo_tj_columns(tok text, source_table text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare r regclass;
begin
  perform bo_jobs.chk(tok);
  r := bo_jobs.rel(source_table, false);
  return (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb)
            from pg_attribute a where a.attrelid = r and a.attnum > 0 and not a.attisdropped);
end $$;

create or replace function public.bo_tj_plan(
  tok text, source_table text, id_column text, column_map jsonb, filters jsonb,
  dest_table text, lim integer, retry_errors boolean default true) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs set statement_timeout = '120s' as $$
declare src regclass; dst regclass; cm jsonb; idc text; w text; wo_done text;
        total bigint; remaining bigint; selected bigint; blank bigint; dup bigint; by_state jsonb := '{}'::jsonb;
        sc text; q text;
begin
  perform bo_jobs.chk(tok);
  src := bo_jobs.rel(source_table, false);
  idc := bo_jobs.col(src, id_column);
  cm := bo_jobs.cmap(src, column_map);
  if dest_table is not null then
    perform bo_jobs.rel_name_ok(dest_table);
    dst := to_regclass(format('%I.%I', split_part(dest_table, '.', 1), split_part(dest_table, '.', 2)));
    if dst is not null then dst := bo_jobs.rel(dest_table, true); end if;
  end if;
  lim := greatest(1, least(coalesce(lim, 100000), 100000));

  execute format('select count(*), count(*) filter (where nullif(btrim(s.%I::text), '''') is null), count(*) - count(distinct s.%I::text) from %s s where %s',
                 cm->>'company_name', idc, bo_jobs.qname(src), bo_jobs.where_sql(src, 's', filters))
     into total, blank, dup;
  if dup > 0 then raise exception 'id_column_not_unique: % duplicate ids among matching rows', dup; end if;

  w := bo_jobs.base_where(src, dst, cm, filters, idc, retry_errors);
  execute format('select count(*) from %s s where %s', bo_jobs.qname(src), w) into remaining;
  selected := least(remaining, lim);

  if cm ? 'state' then
    sc := cm->>'state';
    q := format('select coalesce(jsonb_object_agg(st, n), ''{}''::jsonb) from (select upper(btrim(coalesce(x.st,''''))) st, count(*) n from (select s.%I::text st from %s s where %s order by s.%I::text limit %s) x group by 1) g',
                sc, bo_jobs.qname(src), w, idc, lim);
    execute q into by_state;
  end if;

  return jsonb_build_object(
    'total_matching', total - blank,
    'blank_company', blank,
    'remaining', remaining,
    'already_done', (total - blank) - remaining,
    'selected', selected,
    'by_state', by_state,
    'dest_exists', dst is not null,
    'column_map', cm
  );
end $$;

-- destination name sanity (table need not exist yet)
create or replace function bo_jobs.rel_name_ok(spec text) returns void
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare parts text[];
begin
  parts := string_to_array(spec, '.');
  if array_length(parts, 1) is distinct from 2 or parts[1] !~ '^[a-z_][a-z0-9_]{0,62}$' or parts[2] !~ '^bo_[a-z0-9_]{1,60}$' then
    raise exception 'destination must be schema.bo_<name> (lowercase)';
  end if;
  if not exists (select 1 from bo_jobs.allowed_schema a where a.schema_name = parts[1] and a.can_write) then
    raise exception 'schema % is not allowed for writes', parts[1];
  end if;
end $$;

create or replace function public.bo_tj_fetch(
  tok text, source_table text, id_column text, column_map jsonb, filters jsonb,
  dest_table text, after text, lim integer, retry_errors boolean default true) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs set statement_timeout = '120s' as $$
declare src regclass; dst regclass; cm jsonb; idc text; w text; sel text := ''; k text; res jsonb;
begin
  perform bo_jobs.chk(tok);
  src := bo_jobs.rel(source_table, false);
  idc := bo_jobs.col(src, id_column);
  cm := bo_jobs.cmap(src, column_map);
  perform bo_jobs.rel_name_ok(dest_table);
  dst := to_regclass(format('%I.%I', split_part(dest_table, '.', 1), split_part(dest_table, '.', 2)));
  if dst is not null then dst := bo_jobs.rel(dest_table, true); end if;
  lim := greatest(1, least(coalesce(lim, 100), 500));
  w := bo_jobs.base_where(src, dst, cm, filters, idc, retry_errors);
  if after is not null then w := w || format(' and s.%I::text > %L', idc, after); end if;
  for k in select key from jsonb_each_text(cm) loop
    sel := sel || format(', %L, s.%I::text', k, cm->>k);
  end loop;
  execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select jsonb_build_object(''id'', s.%I::text%s) r from %s s where %s order by s.%I::text limit %s) t',
                 idc, sel, bo_jobs.qname(src), w, idc, lim) into res;
  return res;
end $$;

create or replace function public.bo_tj_prepare_dest(tok text, dest_table text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare r regclass; q text; need text[] := array['source_id','job_id','status','legal_name','owner_first','owner_last','owner_title','owner_role',
  'owner_email','owner_phone','source','source_url','confidence','confidence_score','waterfall_ready','coverage_reason','cost_usd','attempts','error','processed_at'];
        c text; created boolean := false;
begin
  perform bo_jobs.chk(tok);
  perform bo_jobs.rel_name_ok(dest_table);
  r := to_regclass(format('%I.%I', split_part(dest_table, '.', 1), split_part(dest_table, '.', 2)));
  if r is null then
    execute format($f$create table %I.%I (
      source_id text primary key, job_id text, status text not null check (status in ('named','miss','error')),
      legal_name text, owner_first text, owner_last text, owner_title text, owner_role text, owner_email text, owner_phone text,
      source text, source_url text, confidence text, confidence_score numeric, waterfall_ready boolean not null default false,
      coverage_reason text, cost_usd numeric not null default 0, attempts integer not null default 1, error text,
      processed_at timestamptz not null default now())$f$, split_part(dest_table, '.', 1), split_part(dest_table, '.', 2));
    execute format('alter table %I.%I enable row level security', split_part(dest_table, '.', 1), split_part(dest_table, '.', 2));
    execute format('revoke all on %I.%I from public, anon, authenticated', split_part(dest_table, '.', 1), split_part(dest_table, '.', 2));
    created := true;
    r := bo_jobs.rel(dest_table, true);
  else
    r := bo_jobs.rel(dest_table, true);
    foreach c in array need loop
      if not exists (select 1 from pg_attribute a where a.attrelid = r and a.attname = c and a.attnum > 0 and not a.attisdropped) then
        raise exception 'dest_table_shape_mismatch: missing column %', c;
      end if;
    end loop;
  end if;
  return jsonb_build_object('dest_table', dest_table, 'created', created);
end $$;

create or replace function public.bo_tj_write(tok text, dest_table text, job_id text, rows jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, bo_jobs set statement_timeout = '120s' as $$
declare r regclass; n integer;
begin
  perform bo_jobs.chk(tok);
  perform bo_jobs.rel_name_ok(dest_table);
  r := bo_jobs.rel(dest_table, true);
  if rows is null or jsonb_typeof(rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(rows) > 1000 then raise exception 'at most 1000 rows per call'; end if;
  execute format($f$
    insert into %1$s as d (source_id, job_id, status, legal_name, owner_first, owner_last, owner_title, owner_role, owner_email, owner_phone,
                           source, source_url, confidence, confidence_score, waterfall_ready, coverage_reason, cost_usd, attempts, error, processed_at)
    select x.source_id, %2$L, x.status, x.legal_name, x.owner_first, x.owner_last, x.owner_title, x.owner_role, x.owner_email, x.owner_phone,
           x.source, x.source_url, x.confidence, x.confidence_score, coalesce(x.waterfall_ready, false), x.coverage_reason,
           coalesce(x.cost_usd, 0), 1, x.error, now()
      from jsonb_to_recordset($1) as x(source_id text, status text, legal_name text, owner_first text, owner_last text, owner_title text,
           owner_role text, owner_email text, owner_phone text, source text, source_url text, confidence text, confidence_score numeric,
           waterfall_ready boolean, coverage_reason text, cost_usd numeric, error text)
    on conflict (source_id) do update set
      job_id = excluded.job_id, status = excluded.status, legal_name = excluded.legal_name, owner_first = excluded.owner_first,
      owner_last = excluded.owner_last, owner_title = excluded.owner_title, owner_role = excluded.owner_role,
      owner_email = excluded.owner_email, owner_phone = excluded.owner_phone, source = excluded.source, source_url = excluded.source_url,
      confidence = excluded.confidence, confidence_score = excluded.confidence_score, waterfall_ready = excluded.waterfall_ready,
      coverage_reason = excluded.coverage_reason, cost_usd = d.cost_usd + excluded.cost_usd, attempts = d.attempts + 1,
      error = excluded.error, processed_at = now()
    where d.status <> 'named' or excluded.status = 'named'$f$, bo_jobs.qname(r), job_id) using rows;
  get diagnostics n = row_count;
  return n;
end $$;

-- counts only, never rows
create or replace function public.bo_tj_summary(tok text, dest_table text, job_id text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare r regclass; res jsonb; w text := 'true';
begin
  perform bo_jobs.chk(tok);
  perform bo_jobs.rel_name_ok(dest_table);
  r := bo_jobs.rel(dest_table, true);
  if job_id is not null then w := format('job_id = %L', job_id); end if;
  execute format($f$
    with d as (select * from %1$s where %2$s)
    select jsonb_build_object(
      'rows', count(*),
      'named', count(*) filter (where status = 'named'),
      'waterfall_ready', count(*) filter (where waterfall_ready),
      'miss', count(*) filter (where status = 'miss'),
      'error', count(*) filter (where status = 'error'),
      'with_email', count(*) filter (where owner_email is not null),
      'with_phone', count(*) filter (where owner_phone is not null),
      'cost_usd', coalesce(round(sum(cost_usd), 4), 0),
      'by_source', coalesce((select jsonb_object_agg(coalesce(s, 'none'), n) from (select source s, count(*) n from d group by 1) g), '{}'::jsonb),
      'by_confidence', coalesce((select jsonb_object_agg(coalesce(c, 'none'), n) from (select confidence c, count(*) n from d where status = 'named' group by 1) g), '{}'::jsonb),
      'by_coverage', coalesce((select jsonb_object_agg(coalesce(c, 'none'), n) from (select coverage_reason c, count(*) n from d where status <> 'named' group by 1) g), '{}'::jsonb)
    ) from d$f$, bo_jobs.qname(r), w) into res;
  return res;
end $$;

create or replace function public.bo_tj_job_create(tok text, j jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare row_ bo_jobs.job;
begin
  perform bo_jobs.chk(tok);
  perform bo_jobs.rel(j->>'source_table', false);
  perform bo_jobs.rel_name_ok(j->>'dest_table');
  insert into bo_jobs.job (job_id, status, source_table, id_column, dest_table, column_map, filters, row_limit, max_usd, client_tag, options, estimate, total)
  values (j->>'job_id', 'queued', j->>'source_table', j->>'id_column', j->>'dest_table',
          coalesce(j->'column_map', '{}'::jsonb), coalesce(j->'filters', '[]'::jsonb), nullif(j->>'row_limit','')::int,
          (j->>'max_usd')::numeric, j->>'client_tag', coalesce(j->'options', '{}'::jsonb), j->'estimate', coalesce((j->>'total')::int, 0))
  on conflict (job_id) do nothing;
  select * into row_ from bo_jobs.job where job_id = j->>'job_id';
  return to_jsonb(row_);
end $$;

create or replace function public.bo_tj_job_get(tok text, id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare row_ bo_jobs.job;
begin
  perform bo_jobs.chk(tok);
  select * into row_ from bo_jobs.job where job_id = id;
  return case when row_.job_id is null then null else to_jsonb(row_) end;
end $$;

create or replace function public.bo_tj_job_list(tok text, statuses text[] default null, lim integer default 50) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
begin
  perform bo_jobs.chk(tok);
  return (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at desc), '[]'::jsonb)
            from (select * from bo_jobs.job where statuses is null or status = any(statuses)
                   order by created_at desc limit greatest(1, least(coalesce(lim, 50), 200))) j);
end $$;

-- Claim the right to run a job: free, or the previous runner's heartbeat is older than stale_seconds.
create or replace function public.bo_tj_job_claim(tok text, id text, runner text, stale_seconds integer default 120) returns boolean
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare n integer;
begin
  perform bo_jobs.chk(tok);
  update bo_jobs.job set runner_id = runner, heartbeat_at = now(), updated_at = now(),
         status = case when status in ('queued','running','capped','failed') then 'running' else status end,
         started_at = coalesce(started_at, now()), error = null
   where job_id = id and status in ('queued','running','capped','failed')
     and (runner_id is null or runner_id = runner or heartbeat_at is null or heartbeat_at < now() - make_interval(secs => stale_seconds));
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Patch a job. A runner passes its runner_id; if another runner owns the job the call is ignored (returns false).
-- A cancelled job stays cancelled.
create or replace function public.bo_tj_job_update(tok text, id text, patch jsonb, runner text default null) returns boolean
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare n integer;
begin
  perform bo_jobs.chk(tok);
  update bo_jobs.job j set
    status      = case when j.status = 'cancelled' then j.status when patch ? 'status' then patch->>'status' else j.status end,
    total       = case when patch ? 'total' then (patch->>'total')::int else j.total end,
    processed   = case when patch ? 'processed' then (patch->>'processed')::int else j.processed end,
    named       = case when patch ? 'named' then (patch->>'named')::int else j.named end,
    missed      = case when patch ? 'missed' then (patch->>'missed')::int else j.missed end,
    errors      = case when patch ? 'errors' then (patch->>'errors')::int else j.errors end,
    spend_usd   = case when patch ? 'spend_usd' then (patch->>'spend_usd')::numeric else j.spend_usd end,
    max_usd     = case when patch ? 'max_usd' then (patch->>'max_usd')::numeric else j.max_usd end,
    by_state    = case when patch ? 'by_state' then patch->'by_state' else j.by_state end,
    error       = case when patch ? 'error' then patch->>'error' else j.error end,
    finished_at = case when patch ? 'finished_at' then (patch->>'finished_at')::timestamptz else j.finished_at end,
    runner_id   = case when patch ? 'release' then null when runner is not null then runner else j.runner_id end,
    heartbeat_at = case when runner is not null then now() else j.heartbeat_at end,
    updated_at  = now()
   where j.job_id = id and (runner is null or j.runner_id is null or j.runner_id = runner);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------- grants: callable with the publishable key, token required
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'bo\_tj\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'bo_jobs' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Create the service token once (run by a human, value never committed):
--   insert into bo_jobs.api_token (token_sha256, label)
--   values (encode(sha256(convert_to('<random token>', 'utf8')), 'hex'), 'business-owners railway');
