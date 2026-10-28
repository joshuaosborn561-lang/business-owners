/**
 * Runs the real SQL (supabase/migrations/20261028_table_jobs.sql) through the real RpcStore.
 * Skipped unless a throwaway Postgres + PostgREST is available:
 *   TJ_TEST_URL=http://localhost:3099  TJ_TEST_KEY=<anon/publishable>  TJ_TEST_TOKEN=<token whose sha256 is in bo_jobs.api_token>
 *   TJ_TEST_PSQL=postgres://postgres:pw@localhost:54329/postgres   (to create fixture tables)
 * Never point this at production.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { describe, it, before } from 'node:test';
import { RpcStore, type SourceSpec } from './store.js';
import { startTableJob, getTableJobStatus, exportTableJobSummary, waitForTableJob, resumeTableJob, type TableJobDeps } from '../../services/tableJobs.js';
import type { NameLookupInput, NameLookupResult } from '../stateOwners/sos/types.js';
import type { LookupContext } from '../stateOwners/sos/context.js';

const URL_ = process.env.TJ_TEST_URL;
const KEY = process.env.TJ_TEST_KEY;
const TOKEN = process.env.TJ_TEST_TOKEN;
const PSQL = process.env.TJ_TEST_PSQL;
const enabled = Boolean(URL_ && KEY && TOKEN && PSQL);

const sql = (q: string) => execFileSync('psql', [PSQL as string, '-v', 'ON_ERROR_STOP=1', '-At', '-c', q], { encoding: 'utf8' }).trim();
const RUN = `t${Date.now().toString(36)}`;
const SRC = `scratch.tj_it_${RUN}`;
const DEST = `scratch.bo_it_${RUN}`;

const spec = (over: Partial<SourceSpec> = {}): SourceSpec => ({
  source_table: SRC,
  id_column: 'place_id',
  column_map: { company_name: 'name', city: 'city', state: 'st', domain: 'domain' },
  filters: [],
  ...over,
});

const rejects = async (p: Promise<unknown>, re: RegExp) => assert.rejects(p, re);

describe('table jobs against real SQL', { skip: !enabled }, () => {
  let store: RpcStore;

  before(() => {
    store = new RpcStore({ url: URL_ as string, key: KEY as string, token: TOKEN as string });
    sql(`create table ${SRC} (place_id text primary key, name text, city text, st text, domain text)`);
    sql(`insert into ${SRC} select 'p'||lpad(g::text,4,'0'), case when g in (3,4) then '  ' else 'Acme Test '||g end, 'Fresno', case when g%20=0 then 'NV' when g%20=1 then 'California' when g%20=2 then '' else 'CA' end, 'a'||g||'.test' from generate_series(1,200) g`);
  });

  it('rejects a bad token', async () => {
    const bad = new RpcStore({ url: URL_ as string, key: KEY as string, token: 'nope' });
    await rejects(bad.columns(SRC), /forbidden/);
  });

  it('allowlists schemas for reads and writes at the database', async () => {
    for (const t of ['claude.bot_log', 'auth.users', 'pg_catalog.pg_class', 'information_schema.tables', 'bo_jobs.api_token', 'business_owners.owner_hits', 'private.app_secrets']) {
      await rejects(store.columns(t), /not allowed|not found|invalid/);
    }
    await rejects(store.prepareDest('public.bo_nope'), /not allowed/);
    await rejects(store.prepareDest('lp.bo_nope'), /not allowed/);
    await rejects(store.prepareDest('scratch.not_prefixed'), /bo_/);
    await rejects(store.prepareDest('scratch.bo_x"; drop table x; --'), /bo_|invalid/);
    await rejects(store.prepareDest('scratch.BO_upper'), /bo_/);
  });

  it('validates identifiers and treats filter values as data', async () => {
    for (const bad of ["place_id; drop table " + SRC, 'place_id"', 'PLACE_ID', '1=1', 'name) or (1=1']) {
      await rejects(store.plan(spec({ id_column: bad }), null, 10, true), /invalid|not found/);
      await rejects(store.plan(spec({ column_map: { company_name: bad } }), null, 10, true), /invalid|not found/);
      await rejects(store.plan(spec({ filters: [{ column: bad, value: 'x' }] }), null, 10, true), /invalid|not found/);
    }
    await rejects(store.plan(spec({ filters: [{ column: 'st', op: 'exec' as never, value: 'x' }] }), null, 10, true), /unsupported filter/);
    const hostile = ["x'; drop table " + SRC + "; --", "' or '1'='1", '\\', "%' or true or '%", '$$; select 1; $$'];
    for (const v of hostile) {
      for (const op of ['eq', 'neq', 'like', 'ilike'] as const) {
        const plan = await store.plan(spec({ filters: [{ column: 'st', op, value: v }] }), null, 10, true);
        assert.ok(plan.total_matching === 0 || op === 'neq', `${op} ${v}`);
      }
      const inPlan = await store.plan(spec({ filters: [{ column: 'st', op: 'in', values: [v, 'NV'] }] }), null, 10, true);
      assert.equal(inPlan.total_matching, 10, 'only the NV rows match; hostile value is inert');
    }
    assert.equal(sql(`select count(*) from ${SRC}`), '200', 'source table untouched');
  });

  it('plans counts without reading rows: blank companies skipped, states grouped', async () => {
    const plan = await store.plan(spec(), null, 1000, true);
    assert.equal(plan.blank_company, 2);
    assert.equal(plan.total_matching, 198);
    assert.equal(plan.remaining, 198);
    assert.equal(plan.already_done, 0);
    assert.equal(plan.selected, 198);
    assert.equal(plan.dest_exists, false);
    assert.equal(plan.by_state.NV, 10);
    assert.equal(plan.by_state.CALIFORNIA, 10);
    assert.equal(plan.by_state[''], 10);
    const limited = await store.plan(spec(), null, 25, true);
    assert.equal(limited.selected, 25);
    assert.equal(Object.values(limited.by_state).reduce((a, b) => a + b, 0), 25);
    const typed = await store.plan(spec({ filters: [{ column: 'st', op: 'eq', value: 'NV' }, { column: 'place_id', op: 'gte', value: 'p0100' }] }), null, 1000, true);
    assert.equal(typed.total_matching, 6);
  });

  it('refuses a non-unique id column', async () => {
    await rejects(store.plan(spec({ id_column: 'city' }), null, 10, true), /id_column_not_unique/);
  });

  it('dry run through start_table_job creates nothing', async () => {
    const deps: TableJobDeps = { store, runnerId: 'it', background: false, resolve: async () => { throw new Error('must not run'); }, config: { maxUsdCeiling: 50, batchSize: 20, lanes: 3, autoResume: false } };
    const out = await startTableJob({ source_table: SRC, id_column: 'place_id', dest_table: DEST, column_map: { company_name: 'name', city: 'city', state: 'st', domain: 'domain' } }, deps);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.dry_run, true);
    assert.equal(out.selected, 198);
    assert.equal(sql(`select to_regclass('${DEST}') is null`), 't', 'no destination table on a dry run');
    assert.equal(sql(`select count(*) from bo_jobs.job where dest_table = '${DEST}'`), '0');
  });

  const calls: string[] = [];
  const resolve = async (row: NameLookupInput, ctx: LookupContext): Promise<NameLookupResult> => {
    calls.push(row.company_name);
    ctx.spend!.reserveSerper(8, `${row.state}|${row.company_name}`);
    const n = Number(row.company_name.split(' ').pop());
    return n % 3 === 0
      ? { people: [], coverage_reason: 'not_found', source: 'us_sos', implemented: true, serper_usd: 0.008 }
      : { people: [{ first_name: 'Quillon', last_name: 'Vandermeer', title: 'Owner', company_name: row.company_name, domain: null, source_url: 'https://example.test/r', confidence: 'high', confidence_score: 0.9, state: row.state, source: 'us_sos', role: 'owner', coverage_reason: null }], coverage_reason: null, source: 'us_sos', implemented: true, serper_usd: 0.008 };
  };

  it('runs end to end, writes the destination table, summarizes counts only', async () => {
    const deps: TableJobDeps = { store, runnerId: 'it', background: false, resolve, config: { maxUsdCeiling: 50, batchSize: 40, lanes: 3, autoResume: false } };
    const a = { source_table: SRC, id_column: 'place_id', dest_table: DEST, column_map: { company_name: 'name', city: 'city', state: 'st', domain: 'domain' }, default_state: 'CA' };
    const out = await startTableJob({ ...a, dry_run: false, max_usd: 20, limit: 100 }, deps);
    assert.equal(out.ok, true, JSON.stringify(out));
    await waitForTableJob(out.job_id as string);
    const st = await getTableJobStatus(out.job_id as string, deps);
    assert.equal(st.status, 'completed');
    assert.equal(st.processed, 100);
    assert.equal(sql(`select count(*) from ${DEST}`), '100');
    assert.equal(sql(`select count(*) from ${DEST} where status='named' and waterfall_ready and owner_first='Quillon'`), String(st.named));
    // rows with no state fell back to default_state
    assert.equal(sql(`select count(*) from ${DEST} where coverage_reason='no_state'`), '0');
    const sum = await exportTableJobSummary(out.job_id as string, deps);
    assert.equal(sum.counts_only, true);
    assert.equal((sum.results as { rows: number }).rows, 100);
    assert.ok(!/Acme|Quillon|Vandermeer|\.test/.test(JSON.stringify([out, st, sum])), 'no lead data in tool output');

    // second chunk continues, nothing runs twice
    const before = calls.length;
    const second = await startTableJob({ ...a, dry_run: false, max_usd: 20, limit: 500 }, deps);
    await waitForTableJob(second.job_id as string);
    assert.notEqual(second.job_id, out.job_id);
    assert.equal(calls.length - before, 98, 'only the 98 remaining rows ran');
    assert.equal(new Set(calls).size, 198);
    assert.equal(sql(`select count(*) from ${DEST}`), '198');
    const third = await startTableJob({ ...a, dry_run: false, max_usd: 20 }, deps);
    assert.equal(third.started, false);
    assert.equal(calls.length - before, 98);
  });

  it('destination writes are idempotent and never downgrade a named row', async () => {
    await store.write(DEST, 'x', [{ source_id: 'p0001', status: 'miss', waterfall_ready: false, cost_usd: 0.01 }]);
    const row = sql(`select status from ${DEST} where source_id='p0001'`);
    const before = sql(`select status || ':' || waterfall_ready from ${DEST} where source_id='p0005'`);
    assert.match(before, /named:true/);
    await store.write(DEST, 'y', [{ source_id: 'p0005', status: 'miss', waterfall_ready: false }]);
    assert.equal(sql(`select status from ${DEST} where source_id='p0005'`), 'named');
    assert.equal(sql(`select count(*) from ${DEST}`), '198');
    assert.ok(row);
  });

  it('refuses a destination table with the wrong shape or an existing unrelated table', async () => {
    sql(`create table scratch.bo_bad_${RUN} (source_id text primary key)`);
    await rejects(store.prepareDest(`scratch.bo_bad_${RUN}`), /shape_mismatch/);
    await rejects(store.write(`scratch.bo_missing_${RUN}`, 'x', [{ source_id: 'a', status: 'miss' }]), /not found/);
  });

  it('caps, crashes and resumes through the real job table', async () => {
    const src = `scratch.tj_it2_${RUN}`;
    const dest = `scratch.bo_it2_${RUN}`;
    sql(`create table ${src} (id text primary key, name text, st text)`);
    sql(`insert into ${src} select 'r'||lpad(g::text,3,'0'), 'Beta Test '||g, 'CA' from generate_series(1,60) g`);
    const seen: string[] = [];
    const deps: TableJobDeps = {
      store, runnerId: 'it-A', background: false, config: { maxUsdCeiling: 50, batchSize: 10, lanes: 2, autoResume: false },
      resolve: async (row, ctx) => { seen.push(row.company_name); ctx.spend!.reserveSerper(8, row.company_name); return resolve(row, ctx); },
    };
    const a = { source_table: src, id_column: 'id', dest_table: dest, column_map: { company_name: 'name', state: 'st' } };
    const out = await startTableJob({ ...a, dry_run: false, max_usd: 0.25, limit: 60 }, deps);
    await waitForTableJob(out.job_id as string);
    const capped = await getTableJobStatus(out.job_id as string, deps);
    assert.equal(capped.status, 'capped');
    assert.ok((capped.spend_usd as number) <= 0.25);
    assert.ok((capped.processed as number) > 0 && (capped.processed as number) < 60);
    assert.equal(sql(`select count(*) from ${dest}`), String(capped.processed));

    // a different process picks it up with a higher approved cap
    const deps2: TableJobDeps = { ...deps, runnerId: 'it-B' };
    const resumed = await resumeTableJob(out.job_id as string, 5, deps2);
    assert.equal(resumed.ok, true, JSON.stringify(resumed));
    await waitForTableJob(out.job_id as string);
    const done = await getTableJobStatus(out.job_id as string, deps2);
    assert.equal(done.status, 'completed');
    assert.equal(done.processed, 60);
    assert.equal(sql(`select count(*) from ${dest}`), '60');
    assert.equal(sql(`select count(*) from bo_jobs.job where job_id='${out.job_id}' and runner_id is null`), '1', 'runner released');
    assert.equal(new Set(seen).size, 60);
  });

  it('job claims fence out stale runners; cancelled stays cancelled', async () => {
    const id = `tj-${randomBytes(5).toString('hex')}`;
    const mk = await store.jobCreate({ job_id: id, source_table: SRC, id_column: 'place_id', dest_table: DEST, column_map: { company_name: 'name' }, filters: [], row_limit: 5, max_usd: 1, options: {}, total: 5 });
    assert.equal(mk.status, 'queued');
    assert.equal(await store.jobClaim(id, 'r1', 120), true);
    assert.equal(await store.jobClaim(id, 'r2', 120), false);
    assert.equal(await store.jobUpdate(id, { processed: 2 }, 'r2'), false);
    assert.equal(await store.jobUpdate(id, { processed: 2 }, 'r1'), true);
    assert.equal(await store.jobUpdate(id, { status: 'cancelled' }), true);
    assert.equal(await store.jobUpdate(id, { status: 'running' }, 'r1'), true);
    assert.equal((await store.jobGet(id))!.status, 'cancelled');
    assert.equal(await store.jobClaim(id, 'r3', 0), false, 'cancelled jobs cannot be claimed');
    await rejects(store.jobCreate({ job_id: 'tj-bbbbbbbbbb', source_table: 'claude.bot_log', id_column: 'id', dest_table: DEST, max_usd: 1 }), /not allowed/);
  });
});
