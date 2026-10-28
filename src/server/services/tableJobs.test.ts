import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryStore } from '../lib/tableJobs/store.memory.js';
import type { NameLookupInput, NameLookupResult } from '../lib/stateOwners/sos/types.js';
import type { LookupContext } from '../lib/stateOwners/sos/context.js';
import {
  cancelTableJob,
  estimateForStateCounts,
  exportTableJobSummary,
  getTableJobStatus,
  normalizeStateCounts,
  resumeStaleTableJobs,
  resumeTableJob,
  runTableJob,
  startTableJob,
  waitForTableJob,
  type TableJobDeps,
} from './tableJobs.js';

const SRC = 'scratch.tj_companies';
const DEST = 'scratch.bo_owners_test';

function seed(store: MemoryStore, n = 20, extra: Array<Record<string, string | null>> = []) {
  const rows: Array<Record<string, string | null>> = [];
  for (let i = 1; i <= n; i++) {
    rows.push({ place_id: `p${String(i).padStart(3, '0')}`, name: `Zorblax Plumbing ${i}`, city: 'Fresno', st: i % 10 === 0 ? 'NV' : 'CA', phone: null, domain: `z${i}.example` });
  }
  store.addTable(SRC, [...rows, ...extra]);
}

interface Calls {
  rows: NameLookupInput[];
}

function makeDeps(store: MemoryStore, opts: { perRowUsd?: number; fail?: (row: NameLookupInput) => boolean; calls?: Calls } = {}): TableJobDeps {
  const per = opts.perRowUsd ?? 0.008;
  return {
    store,
    runnerId: 'test-runner',
    background: false,
    config: { maxUsdCeiling: 100, batchSize: 5, lanes: 3, autoResume: true },
    resolve: async (row: NameLookupInput, ctx: LookupContext): Promise<NameLookupResult> => {
      opts.calls?.rows.push(row);
      if (opts.fail?.(row)) throw new Error('registry timeout');
      // charge like the real adapters do: through the shared tracker, refusing past the cap
      if (per > 0 && !ctx.spend!.reserveSerper(Math.round(per / 0.001), `${row.state}|${row.company_name}`)) {
        return { people: [], coverage_reason: 'blocked', source: 'us_sos', implemented: true };
      }
      const named = Number(row.company_name.split(' ').pop()) % 2 === 1;
      return {
        people: named
          ? [{ first_name: 'Quillon', last_name: 'Vandermeer', title: 'Owner', company_name: row.company_name, domain: row.domain ?? null, source_url: 'https://example.test/rec', confidence: 'high', confidence_score: 0.95, state: row.state, source: 'us_sos', role: 'owner', coverage_reason: null }]
          : [],
        coverage_reason: named ? null : 'not_found',
        source: 'us_sos',
        implemented: true,
        serper_usd: per,
        serper_credits: Math.round(per / 0.001),
      };
    },
  };
}

const args = (extra: Record<string, unknown> = {}) => ({ source_table: SRC, id_column: 'place_id', dest_table: DEST, ...extra });

async function runToEnd(deps: TableJobDeps, a: Record<string, unknown>) {
  const out = await startTableJob(args(a) as never, deps);
  assert.equal(out.ok, true, JSON.stringify(out));
  await waitForTableJob(out.job_id as string);
  return out;
}

describe('estimate', () => {
  it('prices a CA-heavy table from state counts', () => {
    const est = estimateForStateCounts({ CA: 9215, NV: 285 }, {});
    assert.equal(est.rows, 9500);
    assert.ok(est.per_row_usd_max > 0.008 && est.per_row_usd_max < 0.1);
    assert.ok(est.expected_usd_high < est.total_usd_max);
    assert.ok(Math.abs(est.total_usd_max - est.per_row_usd_max * 9500) < 5);
  });

  it('normalizes state spellings and blanks', () => {
    assert.deepEqual(normalizeStateCounts({ CA: 5, CALIFORNIA: 2, '': 3, nv: 1 }, 'CA'), { CA: 10, NV: 1 });
    assert.deepEqual(normalizeStateCounts({ '': 3 }, ''), { UNK: 3 });
  });
});

describe('start_table_job dry run', () => {
  it('returns the estimate only: no dest table, no job, no spend, no rows', async () => {
    const store = new MemoryStore();
    seed(store, 20);
    const calls: Calls = { rows: [] };
    const out = await startTableJob(args({ limit: 10 }) as never, makeDeps(store, { calls }));
    assert.equal(out.ok, true);
    assert.equal(out.dry_run, true);
    assert.equal(out.spent_usd, 0);
    assert.equal(out.selected, 10);
    assert.equal(out.matching_rows, 20);
    assert.ok((out.estimate as { total_usd_max: number }).total_usd_max > 0);
    assert.equal(store.dests.size, 0);
    assert.equal(store.jobs.size, 0);
    assert.equal(calls.rows.length, 0);
    const text = JSON.stringify(out);
    assert.ok(!/Zorblax|example/.test(text), 'dry run must not echo company data');
  });

  it('is the default when dry_run is omitted, and live runs need max_usd', async () => {
    const store = new MemoryStore();
    seed(store, 4);
    const deps = makeDeps(store);
    assert.equal((await startTableJob(args() as never, deps)).dry_run, true);
    const noCap = await startTableJob(args({ dry_run: false }) as never, deps);
    assert.equal(noCap.ok, false);
    assert.match(String(noCap.error), /max_usd/);
    const tooBig = await startTableJob(args({ dry_run: false, max_usd: 1000 }) as never, deps);
    assert.equal(tooBig.ok, false);
    assert.match(String(tooBig.error), /ceiling/);
    assert.equal(store.jobs.size, 0);
  });

  it('warns about blank companies and missing states, and needs a state source', async () => {
    const store = new MemoryStore();
    seed(store, 6, [{ place_id: 'px1', name: '   ', city: 'X', st: 'CA', phone: null, domain: null }, { place_id: 'px2', name: 'No State Co', city: 'X', st: '', phone: null, domain: null }]);
    const out = await startTableJob(args() as never, makeDeps(store));
    assert.equal(out.ok, true);
    assert.equal(out.matching_rows, 7);
    assert.ok((out.warnings as string[]).some((w) => /blank company/.test(w)));
    assert.ok((out.warnings as string[]).some((w) => /no usable state/.test(w)));
    const noState = new MemoryStore();
    noState.addTable(SRC, [{ place_id: 'a', name: 'A Co', city: 'X' }]);
    const bad = await startTableJob(args() as never, makeDeps(noState));
    assert.equal(bad.ok, false);
    assert.match(String(bad.error), /state/);
    const withDefault = await startTableJob(args({ default_state: 'CA' }) as never, makeDeps(noState));
    assert.equal(withDefault.ok, true);
  });
});

describe('start_table_job validation', () => {
  it('rejects disallowed schemas and hostile identifiers before touching the store', async () => {
    const store = new MemoryStore();
    seed(store, 3);
    let touched = 0;
    const spy = new Proxy(store, { get: (t, k, r) => { touched += 1; if (process.env.DBG) console.log('touched', String(k)); return Reflect.get(t, k, r); } });
    const deps = makeDeps(spy as MemoryStore);
    for (const a of [
      { source_table: 'claude.bot_log' },
      { source_table: 'auth.users' },
      { source_table: `${SRC}; drop table x` },
      { id_column: 'place_id; --' },
      { dest_table: 'public.bo_x' },
      { dest_table: 'scratch.emcor_companies' },
      { dest_table: SRC },
      { filters: [{ column: '1=1; --', value: 'x' }] },
      { filters: 'state = CA' },
      { column_map: { company_name: 'name"' } },
      { limit: 0 },
      { limit: 1_000_000 },
      { default_state: 'CA; drop' },
    ]) {
      const out = await startTableJob(args(a) as never, deps);
      assert.equal(out.ok, false, JSON.stringify(a));
    }
    assert.equal(touched, 0, 'validation must fail before any database call');
  });

  it('reports not-configured clearly when no store is available', async () => {
    const saved = { u: process.env.TABLE_JOBS_SUPABASE_URL, k: process.env.TABLE_JOBS_SUPABASE_KEY, t: process.env.TABLE_JOBS_TOKEN };
    delete process.env.TABLE_JOBS_SUPABASE_URL;
    delete process.env.TABLE_JOBS_SUPABASE_KEY;
    delete process.env.TABLE_JOBS_TOKEN;
    try {
      const out = await startTableJob(args() as never);
      assert.equal(out.ok, false);
      assert.deepEqual(out.missing_env, ['TABLE_JOBS_SUPABASE_URL', 'TABLE_JOBS_SUPABASE_KEY', 'TABLE_JOBS_TOKEN']);
    } finally {
      if (saved.u) process.env.TABLE_JOBS_SUPABASE_URL = saved.u;
      if (saved.k) process.env.TABLE_JOBS_SUPABASE_KEY = saved.k;
      if (saved.t) process.env.TABLE_JOBS_TOKEN = saved.t;
    }
  });
});

describe('background run', () => {
  it('processes rows server-side, writes one dest row per source row, reports counts only', async () => {
    const store = new MemoryStore();
    seed(store, 20);
    const deps = makeDeps(store);
    const started = await runToEnd(deps, { dry_run: false, max_usd: 5, limit: 20 });
    const jobId = started.job_id as string;
    const status = await getTableJobStatus(jobId, deps);
    assert.equal(status.status, 'completed');
    assert.equal(status.processed, 20);
    assert.equal(status.named, 10);
    assert.equal(status.missed, 10);
    assert.equal(status.errors, 0);
    assert.equal(status.spend_usd, 0.16);
    assert.equal(store.dests.get(DEST)!.size, 20);
    const sum = await exportTableJobSummary(jobId, deps);
    assert.equal((sum.results as { waterfall_ready: number }).waterfall_ready, 10);
    assert.equal(sum.counts_only, true);
    const all = JSON.stringify([started, status, sum]);
    assert.ok(!/Zorblax|Quillon|Vandermeer|example\.test|z\d+\.example/.test(all), 'tool output must never contain lead data');
    const hit = [...store.dests.get(DEST)!.values()].find((r) => r.status === 'named')!;
    assert.equal(hit.owner_first, 'Quillon');
    assert.equal(hit.waterfall_ready, true);
  });

  it('is idempotent per row: a second run does no lookups and spends nothing', async () => {
    const store = new MemoryStore();
    seed(store, 12);
    const calls: Calls = { rows: [] };
    const deps = makeDeps(store, { calls });
    await runToEnd(deps, { dry_run: false, max_usd: 5 });
    assert.equal(calls.rows.length, 12);
    const again = await startTableJob(args({ dry_run: false, max_usd: 5 }) as never, deps);
    assert.equal(again.ok, true);
    assert.equal(again.started, false);
    assert.equal(calls.rows.length, 12);
    const dry = await startTableJob(args() as never, deps);
    assert.equal(dry.already_done, 12);
    assert.equal(dry.selected, 0);
  });

  it('limit applies to rows still to do, so repeated chunks walk the table', async () => {
    const store = new MemoryStore();
    seed(store, 12);
    const calls: Calls = { rows: [] };
    const deps = makeDeps(store, { calls });
    const first = await runToEnd(deps, { dry_run: false, max_usd: 5, limit: 5 });
    assert.equal(store.dests.get(DEST)!.size, 5);
    const second = await runToEnd(deps, { dry_run: false, max_usd: 5, limit: 5 });
    assert.notEqual(first.job_id, second.job_id);
    assert.equal(store.dests.get(DEST)!.size, 10);
    assert.equal(new Set(calls.rows.map((r) => r.company_name)).size, 10, 'no row ran twice');
  });

  it('resumes after a crash without re-running or re-charging finished rows', async () => {
    const store = new MemoryStore();
    seed(store, 20);
    const calls: Calls = { rows: [] };
    const deps = makeDeps(store, { calls });
    // batches of 5: the first two batches are saved, then the database goes away for every retry of the third write
    const origWrite = store.write.bind(store);
    let writeCalls = 0;
    store.write = async (d, j, r) => {
      writeCalls += 1;
      if (writeCalls >= 3 && writeCalls <= 6) throw new Error('simulated crash');
      return origWrite(d, j, r);
    };
    const started = await startTableJob(args({ dry_run: false, max_usd: 5 }) as never, deps);
    await waitForTableJob(started.job_id as string);
    const failed = await getTableJobStatus(started.job_id as string, deps);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.processed, 10);
    assert.equal(store.dests.get(DEST)!.size, 10);
    const ranBefore = calls.rows.length; // 10 saved + the unsaved third batch
    // "restart": new process, same database
    const deps2 = { ...makeDeps(store, { calls }), runnerId: 'runner-2' };
    const resumed = await resumeTableJob(started.job_id as string, undefined, deps2);
    assert.equal(resumed.ok, true);
    await waitForTableJob(started.job_id as string);
    const done = await getTableJobStatus(started.job_id as string, deps2);
    assert.equal(done.status, 'completed');
    assert.equal(done.processed, 20);
    assert.equal(store.dests.get(DEST)!.size, 20);
    const rerun = calls.rows.slice(ranBefore).map((r) => r.company_name);
    assert.equal(rerun.length, 10, 'only the unfinished rows ran again');
    assert.ok(ranBefore - 10 <= 5, 'at most one in-flight batch is lost on a crash');
  });

  it('stops at the hard cap, keeps finished rows, and resumes with a higher approved cap', async () => {
    const store = new MemoryStore();
    seed(store, 30);
    const calls: Calls = { rows: [] };
    const deps = makeDeps(store, { perRowUsd: 0.008, calls });
    const out = await runToEnd(deps, { dry_run: false, max_usd: 0.15, limit: 30 });
    const capped = await getTableJobStatus(out.job_id as string, deps);
    assert.equal(capped.status, 'capped');
    assert.ok((capped.spend_usd as number) <= 0.15 + 1e-9, `spend ${capped.spend_usd} must not pass the cap`);
    assert.ok((capped.processed as number) >= 3 && (capped.processed as number) < 30, `processed ${capped.processed}`);
    const doneRows = store.dests.get(DEST)!.size;
    assert.equal(doneRows, capped.processed);
    assert.match(String(capped.next_step), /resume_table_job/);

    const refused = await resumeTableJob(out.job_id as string, 1000, deps);
    assert.equal(refused.ok, false);
    const lower = await resumeTableJob(out.job_id as string, 0.05, deps);
    assert.equal(lower.ok, false);

    const resumed = await resumeTableJob(out.job_id as string, 1, deps);
    assert.equal(resumed.ok, true);
    await waitForTableJob(out.job_id as string);
    const done = await getTableJobStatus(out.job_id as string, deps);
    assert.equal(done.status, 'completed');
    assert.equal(done.processed, 30);
    assert.ok((done.spend_usd as number) <= 0.24 + 1e-9);
    assert.equal(new Set(calls.rows.map((r) => r.company_name)).size, 30);
  });

  it('records row failures as error rows, retries them next run, never more than 3 times', async () => {
    const store = new MemoryStore();
    seed(store, 10);
    let failing = true;
    const deps = makeDeps(store, { fail: (r) => failing && r.company_name.endsWith(' 3') });
    const first = await runToEnd(deps, { dry_run: false, max_usd: 5 });
    const st = await getTableJobStatus(first.job_id as string, deps);
    assert.equal(st.status, 'completed');
    assert.equal(st.errors, 1);
    const err = [...store.dests.get(DEST)!.values()].find((r) => r.status === 'error')!;
    assert.match(String(err.error), /registry timeout/);
    failing = false;
    const dry = await startTableJob(args() as never, deps);
    assert.equal(dry.selected, 1, 'the error row is eligible again');
    await runToEnd(deps, { dry_run: false, max_usd: 5 });
    const row = [...store.dests.get(DEST)!.values()].filter((r) => r.status === 'error');
    assert.equal(row.length, 0);
  });

  it('does not downgrade a named row when a later run misses', async () => {
    const store = new MemoryStore();
    seed(store, 2);
    await store.prepareDest(DEST);
    await store.write(DEST, 'x', [{ source_id: 'p001', status: 'named', owner_first: 'A', owner_last: 'B', waterfall_ready: true }]);
    await store.write(DEST, 'y', [{ source_id: 'p001', status: 'miss', waterfall_ready: false }]);
    assert.equal(store.dests.get(DEST)!.get('p001')!.status, 'named');
  });

  it('writes rows with no state as misses without a lookup', async () => {
    const store = new MemoryStore();
    seed(store, 3, [{ place_id: 'p900', name: 'Stateless Co', city: 'X', st: '', phone: null, domain: null }]);
    const calls: Calls = { rows: [] };
    const deps = makeDeps(store, { calls });
    await runToEnd(deps, { dry_run: false, max_usd: 5 });
    assert.equal(calls.rows.length, 3);
    const row = store.dests.get(DEST)!.get('p900')!;
    assert.equal(row.status, 'miss');
    assert.equal(row.coverage_reason, 'no_state');
  });

  it('same start twice does not run twice (idempotent job id, active run reused)', async () => {
    const store = new MemoryStore();
    seed(store, 10);
    const calls: Calls = { rows: [] };
    const deps = { ...makeDeps(store, { calls }), background: true };
    const a = await startTableJob(args({ dry_run: false, max_usd: 5 }) as never, deps);
    const b = await startTableJob(args({ dry_run: false, max_usd: 5 }) as never, deps);
    assert.equal(a.job_id, b.job_id);
    await waitForTableJob(a.job_id as string);
    assert.equal(calls.rows.length, 10);
  });

  it('cancel stops a job after the current batch and keeps results', async () => {
    const store = new MemoryStore();
    seed(store, 30);
    const deps = makeDeps(store);
    const orig = deps.resolve;
    let n = 0;
    deps.resolve = async (row, ctx) => {
      n += 1;
      if (n === 7) await cancelTableJob([...store.jobs.keys()][0], deps);
      return orig(row, ctx);
    };
    const out = await runToEnd(deps, { dry_run: false, max_usd: 5, limit: 30 });
    const st = await getTableJobStatus(out.job_id as string, deps);
    assert.equal(st.status, 'cancelled');
    assert.ok((st.processed as number) < 30 && (st.processed as number) >= 5);
    assert.equal(store.dests.get(DEST)!.size, st.processed);
    const resume = await resumeTableJob(out.job_id as string, undefined, deps);
    assert.equal(resume.ok, false);
  });

  it('a second runner cannot steal a live job; a stale one can', async () => {
    const store = new MemoryStore();
    seed(store, 6);
    await store.prepareDest(DEST);
    await store.jobCreate({ job_id: 'tj-aaaaaaaaaa', source_table: SRC, id_column: 'place_id', dest_table: DEST, column_map: { company_name: 'name', state: 'st', city: 'city' }, max_usd: 5, total: 6 });
    assert.equal(await store.jobClaim('tj-aaaaaaaaaa', 'r1', 120), true);
    assert.equal(await store.jobClaim('tj-aaaaaaaaaa', 'r2', 120), false);
    store.jobs.get('tj-aaaaaaaaaa')!.heartbeat_at = new Date(Date.now() - 300_000).toISOString();
    assert.equal(await store.jobClaim('tj-aaaaaaaaaa', 'r2', 120), true);
    assert.equal(await store.jobUpdate('tj-aaaaaaaaaa', { processed: 1 }, 'r1'), false, 'old runner is fenced out');
    const swept = await resumeStaleTableJobs({ ...makeDeps(store), runnerId: 'r3' });
    assert.equal(swept, 0, 'fresh heartbeat from r2 is respected');
  });

  it('rejects malformed job ids', async () => {
    const deps = makeDeps(new MemoryStore());
    for (const id of ['', 'x', 'tj-123', "tj-aaaaaaaaaa'; drop", '../x']) {
      assert.equal((await getTableJobStatus(id, deps)).ok, false);
    }
  });
});

describe('runTableJob direct', () => {
  it('returns null for unknown jobs', async () => {
    assert.equal(await runTableJob('tj-0000000000', makeDeps(new MemoryStore())), null);
  });
});
