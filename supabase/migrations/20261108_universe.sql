-- Business Owners MCP: universe tables (whole public files -> company + owner rows) and the client_pe schema.
-- Run in campaignintelligence (azpapwtnrbzywlnxxecz) after 20261028_table_jobs.sql. Re-runnable.
--
-- Same guard rails as table jobs: token-checked RPCs in public (bo_uv_*), RLS on, no grants on tables,
-- identifiers validated, values only through %L / jsonb_to_recordset. Writes are upserts keyed on
-- (source, source_record_id). Nothing here truncates, drops or deletes rows.

create schema if not exists client_pe;
revoke all on schema client_pe from public, anon, authenticated;

insert into bo_jobs.allowed_schema (schema_name, can_read, can_write) values ('client_pe', true, true)
on conflict (schema_name) do update set can_read = true, can_write = true;

-- Fixed shape, created only by bo_uv_prepare.
create or replace function public.bo_uv_prepare(tok text, dest_table text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs as $$
declare sch text; tbl text; r regclass; created boolean := false;
begin
  perform bo_jobs.chk(tok);
  perform bo_jobs.rel_name_ok(dest_table);
  sch := split_part(dest_table, '.', 1); tbl := split_part(dest_table, '.', 2);
  r := to_regclass(format('%I.%I', sch, tbl));
  if r is null then
    execute format($f$create table %I.%I (
      source text not null, source_record_id text not null,
      legal_name text not null, dba text, address text, city text, state text, zip text, phone text,
      ein text, npi text, ccn text, usdot text,
      owner_first text, owner_last text, owner_title text, ownership_pct numeric,
      pe_flag boolean, reit_flag boolean, org_owners text[],
      size_employees integer, size_participants integer, size_power_units integer, size_drivers integer,
      business_code text, as_of date, confidence text, waterfall_ready boolean not null default false,
      name_key text, dba_key text, zip5 text,
      first_seen_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      primary key (source, source_record_id))$f$, sch, tbl);
    execute format('create index on %I.%I (ein) where ein is not null', sch, tbl);
    execute format('create index on %I.%I (name_key, zip5)', sch, tbl);
    execute format('create index on %I.%I (dba_key, zip5) where dba_key is not null', sch, tbl);
    execute format('create index on %I.%I (phone) where phone is not null', sch, tbl);
    execute format('create index on %I.%I (state, source)', sch, tbl);
    execute format('alter table %I.%I enable row level security', sch, tbl);
    execute format('revoke all on %I.%I from public, anon, authenticated', sch, tbl);
    created := true;
  else
    r := bo_jobs.rel(dest_table, true);
    if not exists (select 1 from pg_attribute a where a.attrelid = r and a.attname = 'source_record_id' and a.attnum > 0 and not a.attisdropped) then
      raise exception 'dest_table_shape_mismatch: % is not a universe table', dest_table;
    end if;
  end if;
  return jsonb_build_object('dest_table', dest_table, 'created', created);
end $$;

-- Upsert up to 1000 rows. A later run refreshes every field; first_seen_at is kept.
create or replace function public.bo_uv_upsert(tok text, dest_table text, rows jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, bo_jobs set statement_timeout = '120s' as $$
declare r regclass; n integer;
begin
  perform bo_jobs.chk(tok);
  perform bo_jobs.rel_name_ok(dest_table);
  r := bo_jobs.rel(dest_table, true);
  if rows is null or jsonb_typeof(rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(rows) > 1000 then raise exception 'at most 1000 rows per call'; end if;
  execute format($f$
    insert into %1$s as d (source, source_record_id, legal_name, dba, address, city, state, zip, phone, ein, npi, ccn, usdot,
      owner_first, owner_last, owner_title, ownership_pct, pe_flag, reit_flag, org_owners,
      size_employees, size_participants, size_power_units, size_drivers, business_code, as_of, confidence, waterfall_ready,
      name_key, dba_key, zip5, updated_at)
    select x.source, x.source_record_id, x.legal_name, x.dba, x.address, x.city, x.state, x.zip, x.phone, x.ein, x.npi, x.ccn, x.usdot,
      x.owner_first, x.owner_last, x.owner_title, x.ownership_pct, x.pe_flag, x.reit_flag, x.org_owners,
      x.size_employees, x.size_participants, x.size_power_units, x.size_drivers, x.business_code, x.as_of, x.confidence,
      coalesce(x.waterfall_ready, false), x.name_key, x.dba_key, x.zip5, now()
      from jsonb_to_recordset($1) as x(source text, source_record_id text, legal_name text, dba text, address text, city text, state text,
        zip text, phone text, ein text, npi text, ccn text, usdot text, owner_first text, owner_last text, owner_title text,
        ownership_pct numeric, pe_flag boolean, reit_flag boolean, org_owners text[], size_employees integer, size_participants integer,
        size_power_units integer, size_drivers integer, business_code text, as_of date, confidence text, waterfall_ready boolean,
        name_key text, dba_key text, zip5 text)
     where x.source is not null and x.source_record_id is not null and x.legal_name is not null
    on conflict (source, source_record_id) do update set
      legal_name = excluded.legal_name, dba = excluded.dba, address = excluded.address, city = excluded.city, state = excluded.state,
      zip = excluded.zip, phone = excluded.phone, ein = excluded.ein, npi = excluded.npi, ccn = excluded.ccn, usdot = excluded.usdot,
      owner_first = excluded.owner_first, owner_last = excluded.owner_last, owner_title = excluded.owner_title,
      ownership_pct = excluded.ownership_pct, pe_flag = excluded.pe_flag, reit_flag = excluded.reit_flag, org_owners = excluded.org_owners,
      size_employees = excluded.size_employees, size_participants = excluded.size_participants,
      size_power_units = excluded.size_power_units, size_drivers = excluded.size_drivers, business_code = excluded.business_code,
      as_of = excluded.as_of, confidence = excluded.confidence, waterfall_ready = excluded.waterfall_ready,
      name_key = excluded.name_key, dba_key = excluded.dba_key, zip5 = excluded.zip5, updated_at = now()$f$, bo_jobs.qname(r))
  using rows;
  get diagnostics n = row_count;
  return n;
end $$;

-- Overlay lookup: EIN first, then name key (legal or DBA) + ZIP, then phone. At most 20 rows, one source.
create or replace function public.bo_uv_lookup(tok text, dest_table text, src text, ein text, name_key text, zip5 text, phone text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs set statement_timeout = '20s' as $$
declare r regclass; res jsonb;
begin
  perform bo_jobs.chk(tok);
  r := bo_jobs.rel(dest_table, false);
  execute format($f$
    select coalesce(jsonb_agg(to_jsonb(u) - 'first_seen_at'), '[]'::jsonb) from (
      select * from %1$s u
       where u.source = $1 and (
             ($2 is not null and u.ein = $2)
          or ($3 is not null and $4 is not null and (u.name_key = $3 or u.dba_key = $3) and u.zip5 = $4)
          or ($5 is not null and u.phone = $5))
       limit 20) u$f$, bo_jobs.qname(r))
    into res using src, nullif(ein, ''), nullif(name_key, ''), nullif(zip5, ''), nullif(phone, '');
  return res;
end $$;

-- Counts only: rows, named, waterfall-ready, by source and state.
create or replace function public.bo_uv_counts(tok text, dest_table text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, bo_jobs set statement_timeout = '120s' as $$
declare r regclass; res jsonb;
begin
  perform bo_jobs.chk(tok);
  r := bo_jobs.rel(dest_table, false);
  execute format($f$
    select coalesce(jsonb_object_agg(source, j), '{}'::jsonb) from (
      select source, jsonb_build_object('rows', count(*), 'named', count(*) filter (where owner_last is not null),
             'waterfall_ready', count(*) filter (where waterfall_ready), 'states', count(distinct state)) j
        from %1$s group by source) s$f$, bo_jobs.qname(r)) into res;
  return res;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'bo\_uv\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end $$;
