/**
 * Table-driven owner lookup jobs.
 *
 * Claude (claude.ai) never sees lead rows: it names a Supabase source table, the service reads the rows itself
 * (token-checked RPCs), runs the normal owner lookup, and writes one result row per source row to a destination
 * table. Tool replies carry counts, costs and nameless samples only.
 *
 * Properties
 *  - dry_run (default) returns only the estimate: nothing is read beyond counts, written, created or spent.
 *  - per-row idempotent: results are keyed by source id in the destination table; rows already named/missed are
 *    never fetched or charged again; failed rows retry up to 3 times.
 *  - resumable: progress lives in the database (bo_jobs.job + the destination table). A restart, a deploy or a
 *    capped job picks up where it stopped (boot + 60s sweeper, or resume_table_job).
 *  - hard cap: each job has max_usd; the spend tracker refuses vendor calls past the remaining budget and the job
 *    stops as "capped" with everything done so far kept.
 */
import { createHash, randomUUID } from 'node:crypto';
import { normalizeState } from '../lib/stateOwners/names.js';
import {
  ApifySpendTracker,
  SerperCreditTracker,
  defaultLookupContext,
  lookupConcurrencyFromEnv,
  resolveNameLookup,
  runCaBatch,
  type LookupContext,
  type NameLookupInput,
  type NameLookupResult,
} from '../lib/stateOwners/sos/index.js';
import { mapPool } from '../lib/stateOwners/sos/pool.js';
import { toOwnerHitRow } from '../lib/stateOwners/sos/ownerHits.js';
import { withRetry } from '../lib/retry.js';
import {
  ValidationError,
  detectColumnMap,
  parseTableRef,
  validateColumnMap,
  validateFilters,
  validateIdentifier,
  type ColumnTarget,
} from '../lib/tableJobs/ident.js';
import {
  RpcStore,
  rpcConfigFromEnv,
  tableJobsMissingEnv,
  type DestRow,
  type JobRecord,
  type JobStatus,
  type SourceRow,
  type SourceSpec,
  type TableJobsStore,
} from '../lib/tableJobs/store.js';
import { estimateRuntimeSeconds, quoteForRows } from './lookupBusinessOwner.js';

export const TABLE_JOB_DEFAULT_LIMIT = 500;
export const TABLE_JOB_MAX_LIMIT = 20_000;
export const TABLE_JOB_DEFAULT_BATCH = 50;
export const TABLE_JOB_CA_BATCH = 400;
/** Real spend lands well under the ceiling: free files first, vendors only on misses (see quote note). */
export const EXPECTED_SPEND_LOW = 0.33;
export const EXPECTED_SPEND_HIGH = 0.5;
const STALE_SECONDS = 120;
const HEARTBEAT_MS = 30_000;

export interface TableJobsConfig {
  maxUsdCeiling: number;
  batchSize: number;
  lanes: number;
  autoResume: boolean;
}

export function tableJobsConfig(): TableJobsConfig {
  const ceiling = Number(process.env.TABLE_JOBS_MAX_USD);
  const batch = Number(process.env.TABLE_JOBS_BATCH);
  return {
    maxUsdCeiling: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : 100,
    batchSize: Number.isFinite(batch) && batch >= 1 ? Math.min(Math.floor(batch), 200) : TABLE_JOB_DEFAULT_BATCH,
    lanes: lookupConcurrencyFromEnv(),
    autoResume: process.env.TABLE_JOBS_AUTORESUME !== 'false',
  };
}

export interface TableJobDeps {
  store: TableJobsStore;
  runnerId: string;
  resolve: (row: NameLookupInput, ctx: LookupContext) => Promise<NameLookupResult>;
  /** Extra LookupContext fields (tests inject fixtures here). */
  ctxOverrides?: Partial<LookupContext>;
  /** Run jobs in the background (default). Tests set false to await completion. */
  background?: boolean;
  config?: TableJobsConfig;
}

const PROCESS_RUNNER_ID = `bo-${randomUUID().slice(0, 8)}`;
let sharedStore: TableJobsStore | null = null;

export function defaultDeps(): TableJobDeps | null {
  const cfg = rpcConfigFromEnv();
  if (!cfg) return null;
  sharedStore = sharedStore || new RpcStore(cfg);
  return { store: sharedStore, runnerId: PROCESS_RUNNER_ID, resolve: resolveNameLookup, background: true };
}

function notConfigured() {
  return {
    ok: false,
    error: 'table jobs are not configured on this server',
    missing_env: tableJobsMissingEnv(),
    hint: 'Apply supabase/migrations/20261028_table_jobs.sql, create a bo_jobs.api_token row, set the three TABLE_JOBS_* env vars on the service. See README "Table jobs".',
  };
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

// ----------------------------------------------------------------------------------------------- estimate

function normState(raw: string, defaultState: string): string {
  return normalizeState(raw) || defaultState;
}

/** Group raw state strings from the database into normalized codes. */
export function normalizeStateCounts(byRaw: Record<string, number>, defaultState: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [raw, n] of Object.entries(byRaw)) {
    const st = normState(raw, defaultState) || 'UNK';
    out[st] = (out[st] || 0) + n;
  }
  return out;
}

export function estimateForStateCounts(
  stateCounts: Record<string, number>,
  opts: { ca_batch?: boolean; ca_max_results?: number; lanes?: number },
) {
  const rows: NameLookupInput[] = [];
  for (const [st, n] of Object.entries(stateCounts)) {
    for (let i = 0; i < n; i++) rows.push({ company_name: 'x', state: st });
  }
  const quote = quoteForRows(rows, { ca_batch: opts.ca_batch, ca_hybrid_only: true, ca_max_results: opts.ca_max_results }) as Record<string, number | string | boolean | Record<string, number>>;
  const total = Number(quote.total_usd_max) || 0;
  const per = rows.length ? Number((total / rows.length).toFixed(4)) : 0;
  return {
    rows: rows.length,
    total_usd_max: total,
    per_row_usd_max: per,
    expected_usd_low: Number((total * EXPECTED_SPEND_LOW).toFixed(2)),
    expected_usd_high: Number((total * EXPECTED_SPEND_HIGH).toFixed(2)),
    serper_usd_max: quote.serper_usd_max,
    apify_usd_max: quote.apify_usd_max,
    unblocker_usd_max: quote.unblocker_usd_max,
    rows_by_state: quote.rows_by_state,
    runtime_seconds: estimateRuntimeSeconds(rows.length, opts.lanes),
    note:
      'total_usd_max is a ceiling, not a bill: free open-data files run first at $0 and Serper / Apify / the unblocker are charged only on rows those miss. expected_usd_* is the usual 33-50% of the ceiling.',
  };
}

// ----------------------------------------------------------------------------------------------- start

export interface StartTableJobArgs {
  source_table: string;
  id_column: string;
  filters?: unknown;
  limit?: number;
  dest_table?: string;
  dry_run?: boolean;
  max_usd?: number;
  column_map?: unknown;
  default_state?: string;
  client_tag?: string;
  ca_batch?: boolean;
  ca_max_results?: number;
}

function defaultDest(sourceRef: string): string {
  const [schema, table] = sourceRef.split('.');
  const t = `bo_owners_${table}`.slice(0, 63);
  return `${schema === 'public' || schema === 'lp' ? 'scratch' : schema}.${t}`;
}

function jobIdFor(parts: unknown): string {
  return `tj-${createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 10)}`;
}

function sortedMap(m: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function jobView(job: JobRecord) {
  const pct = job.total ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  const byState: Record<string, { attempted: number; named: number; hit_rate: number }> = {};
  for (const [st, v] of Object.entries(job.by_state || {})) {
    byState[st] = { attempted: v.attempted, named: v.named, hit_rate: v.attempted ? Number((v.named / v.attempted).toFixed(3)) : 0 };
  }
  return {
    job_id: job.job_id,
    status: job.status,
    source_table: job.source_table,
    dest_table: job.dest_table,
    total: job.total,
    processed: job.processed,
    remaining: Math.max(0, job.total - job.processed),
    percent: pct,
    named: job.named,
    missed: job.missed,
    errors: job.errors,
    hit_rate: job.processed ? Number((job.named / job.processed).toFixed(3)) : 0,
    spend_usd: Number(job.spend_usd.toFixed(4)),
    max_usd: job.max_usd,
    spend_per_row_usd: job.processed ? Number((job.spend_usd / job.processed).toFixed(4)) : 0,
    hit_rate_by_state: byState,
    started_at: job.started_at,
    updated_at: job.updated_at,
    finished_at: job.finished_at,
    error: job.error,
  };
}

export async function startTableJob(args: StartTableJobArgs, depsIn?: TableJobDeps | null): Promise<Record<string, unknown>> {
  const deps = depsIn ?? defaultDeps();
  if (!deps) return notConfigured();
  const cfg = deps.config ?? tableJobsConfig();
  try {
    const source = parseTableRef(args.source_table, 'read');
    const idColumn = validateIdentifier(args.id_column, 'id_column');
    const filters = validateFilters(args.filters);
    const dest = parseTableRef(args.dest_table ?? defaultDest(source.ref), 'write');
    if (dest.ref === source.ref) throw new ValidationError('dest_table must differ from source_table');
    const limit = Math.floor(Number(args.limit ?? TABLE_JOB_DEFAULT_LIMIT));
    if (!Number.isFinite(limit) || limit < 1 || limit > TABLE_JOB_MAX_LIMIT) {
      throw new ValidationError(`limit must be 1-${TABLE_JOB_MAX_LIMIT}`);
    }
    const dryRun = args.dry_run !== false;
    const defaultState = args.default_state ? normalizeState(args.default_state) : '';
    if (args.default_state && !/^[A-Za-z]{2,20}$/.test(args.default_state)) throw new ValidationError('default_state must be a state code or name');
    const caBatch = args.ca_batch === true;
    const clientTag = args.client_tag ? String(args.client_tag).slice(0, 80) : null;
    if (!dryRun) {
      const m = Number(args.max_usd);
      if (!Number.isFinite(m) || m <= 0) {
        throw new ValidationError('max_usd is required when dry_run=false: the dollar ceiling the user approved for this job');
      }
      if (m > cfg.maxUsdCeiling) {
        throw new ValidationError(`max_usd ${m} is above this server's per-job ceiling (${cfg.maxUsdCeiling}). Run in smaller chunks with limit, or ask Josh to raise TABLE_JOBS_MAX_USD.`);
      }
    }

    const explicitMap = validateColumnMap(args.column_map);
    const available = await deps.store.columns(source.ref);
    const columnMap = detectColumnMap(available, explicitMap);
    if (!columnMap.company_name) {
      throw new ValidationError(`could not find a company name column in ${source.ref}; pass column_map.company_name (columns: ${available.slice(0, 40).join(', ')})`);
    }
    if (!available.includes(idColumn)) throw new ValidationError(`id_column "${idColumn}" is not a column of ${source.ref}`);
    if (!columnMap.state && !defaultState) {
      throw new ValidationError('the table has no state column; pass column_map.state or default_state (e.g. "CA")');
    }
    const spec: SourceSpec = { source_table: source.ref, id_column: idColumn, column_map: columnMap, filters };

    const plan = await deps.store.plan(spec, dest.ref, limit, true);
    const stateCounts = normalizeStateCounts(columnMap.state ? plan.by_state : { '': plan.selected }, defaultState);
    const withoutState = stateCounts.UNK || 0;
    const estimate = estimateForStateCounts(stateCounts, { ca_batch: caBatch, ca_max_results: args.ca_max_results, lanes: cfg.lanes });
    const warnings: string[] = [];
    if (plan.blank_company) warnings.push(`${plan.blank_company} rows have a blank company name and are skipped`);
    if (withoutState) warnings.push(`${withoutState} selected rows have no usable state and will be written as misses without a lookup`);
    if (plan.already_done) warnings.push(`${plan.already_done} rows already have results in ${dest.ref} and will not be run or charged again`);
    if (!columnMap.city) warnings.push('no city column: matches get weaker without city');
    if (!columnMap.phone && !columnMap.domain && !columnMap.website) warnings.push('no phone/domain/website column: hit rate will be lower');

    const summary = {
      source_table: source.ref,
      id_column: idColumn,
      dest_table: dest.ref,
      column_map: sortedMap(columnMap as Record<string, string>),
      filters_count: filters.length,
      matching_rows: plan.total_matching,
      already_done: plan.already_done,
      remaining: plan.remaining,
      selected: plan.selected,
      limit,
      ca_batch: caBatch,
      ceiling_per_job_usd: cfg.maxUsdCeiling,
    };

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        spent_usd: 0,
        ...summary,
        estimate,
        warnings,
        fits_server_ceiling: estimate.total_usd_max <= cfg.maxUsdCeiling,
        next_step:
          plan.selected === 0
            ? 'Nothing to run: every matching row already has a result.'
            : `Show the user the estimate. To run, call start_table_job again with dry_run=false and max_usd (the approved ceiling, at most ${cfg.maxUsdCeiling}). For a first pass, a limit of 100 costs about $${(estimate.per_row_usd_max * 100).toFixed(2)} at the ceiling.`,
      };
    }

    if (plan.selected === 0) {
      return { ok: true, dry_run: false, started: false, ...summary, message: 'Nothing to run: every matching row already has a result.' };
    }

    // Idempotent start: same source + dest + filters + columns => reuse the active/resumable job; a finished one starts the next run.
    const base = jobIdFor({ s: source.ref, i: idColumn, d: dest.ref, f: filters, c: sortedMap(columnMap as Record<string, string>) });
    let jobId = base;
    let existing: JobRecord | null = null;
    for (let n = 1; n < 1000; n++) {
      jobId = n === 1 ? base : `${base}-${n}`;
      existing = await deps.store.jobGet(jobId);
      if (!existing || ['queued', 'running', 'capped', 'failed'].includes(existing.status)) break;
    }
    if (existing && ['queued', 'running'].includes(existing.status) && existing.runner_id && existing.heartbeat_at && Date.parse(existing.heartbeat_at) > Date.now() - STALE_SECONDS * 1000) {
      return { ok: true, dry_run: false, started: false, already_running: true, ...jobView(existing), message: 'This job is already running. Poll get_table_job_status.' };
    }
    if (!existing) {
      await deps.store.prepareDest(dest.ref);
      await deps.store.jobCreate({
        job_id: jobId,
        status: 'queued',
        source_table: source.ref,
        id_column: idColumn,
        dest_table: dest.ref,
        column_map: columnMap as Record<string, string>,
        filters,
        row_limit: limit,
        max_usd: Number(args.max_usd),
        client_tag: clientTag,
        options: { default_state: defaultState || null, ca_batch: caBatch, ca_max_results: args.ca_max_results ?? null },
        estimate: { total_usd_max: estimate.total_usd_max, per_row_usd_max: estimate.per_row_usd_max, rows: estimate.rows },
        total: plan.selected,
      });
    } else {
      // capped / failed / stale: continue it, optionally with the newly approved ceiling
      await deps.store.jobUpdate(jobId, { max_usd: Math.max(existing.max_usd, Number(args.max_usd)) });
    }
    launch(jobId, deps);
    const job = await deps.store.jobGet(jobId);
    return {
      ok: true,
      dry_run: false,
      started: true,
      resumed: Boolean(existing),
      ...(job ? jobView(job) : { job_id: jobId }),
      estimate,
      warnings,
      next_step: 'Job is running in the background. Poll get_table_job_status(job_id); when completed call export_table_job_summary(job_id). Results are in dest_table; lead rows never pass through chat.',
    };
  } catch (err) {
    return { ok: false, error: errMsg(err), ...(err instanceof ValidationError ? { kind: 'validation' } : {}) };
  }
}

// ----------------------------------------------------------------------------------------------- status / export / control

export async function getTableJobStatus(jobId: string, depsIn?: TableJobDeps | null): Promise<Record<string, unknown>> {
  const deps = depsIn ?? defaultDeps();
  if (!deps) return notConfigured();
  try {
    const id = validateJobId(jobId);
    const job = await deps.store.jobGet(id);
    if (!job) return { ok: false, error: 'job not found', job_id: id };
    const stale = job.status === 'running' && (!job.heartbeat_at || Date.parse(job.heartbeat_at) < Date.now() - STALE_SECONDS * 1000);
    return {
      ok: true,
      ...jobView(job),
      stalled: stale,
      next_step:
        job.status === 'completed'
          ? 'Done. Call export_table_job_summary(job_id) for counts; results are in dest_table.'
          : job.status === 'capped'
            ? `Stopped at the $${job.max_usd} cap with ${Math.max(0, job.total - job.processed)} rows left. Everything so far is saved. resume_table_job(job_id, max_usd) continues after the user approves a higher ceiling.`
            : job.status === 'failed'
              ? 'Failed (see error). Progress is saved; resume_table_job(job_id) retries from where it stopped.'
              : stale
                ? 'No heartbeat for 2+ minutes: the server restarted. It resumes by itself, or call resume_table_job(job_id).'
                : job.status === 'cancelled'
                  ? 'Cancelled. Results so far stay in dest_table.'
                  : 'Running. Poll again in a minute or two.',
    };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function exportTableJobSummary(jobId: string, depsIn?: TableJobDeps | null): Promise<Record<string, unknown>> {
  const deps = depsIn ?? defaultDeps();
  if (!deps) return notConfigured();
  try {
    const id = validateJobId(jobId);
    const job = await deps.store.jobGet(id);
    if (!job) return { ok: false, error: 'job not found', job_id: id };
    const sum = await deps.store.summary(job.dest_table, id);
    return {
      ok: true,
      counts_only: true,
      job: jobView(job),
      dest_table: job.dest_table,
      results: sum,
      hit_rate: sum.rows ? Number((sum.waterfall_ready / sum.rows).toFixed(3)) : 0,
      read_results_with_sql:
        `select s.${job.id_column}, d.owner_first, d.owner_last, d.owner_title, d.owner_email, d.owner_phone, d.confidence_score from ${job.dest_table} d join ${job.source_table} s on s.${job.id_column}::text = d.source_id where d.waterfall_ready`,
      note: 'No lead rows are returned here by design. Downstream steps read dest_table directly (waterfall_ready = true rows are ready for Email Finder name_company mode).',
    };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function resumeTableJob(jobId: string, maxUsd?: number, depsIn?: TableJobDeps | null): Promise<Record<string, unknown>> {
  const deps = depsIn ?? defaultDeps();
  if (!deps) return notConfigured();
  const cfg = deps.config ?? tableJobsConfig();
  try {
    const id = validateJobId(jobId);
    const job = await deps.store.jobGet(id);
    if (!job) return { ok: false, error: 'job not found', job_id: id };
    if (job.status === 'completed') return { ok: true, resumed: false, ...jobView(job), message: 'Already completed.' };
    if (job.status === 'cancelled') return { ok: false, error: 'job was cancelled; start a new one with start_table_job (done rows are skipped).', job_id: id };
    if (maxUsd != null) {
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > cfg.maxUsdCeiling) {
        throw new ValidationError(`max_usd must be > 0 and at most ${cfg.maxUsdCeiling}`);
      }
      if (maxUsd < job.max_usd) throw new ValidationError(`max_usd cannot be lowered below the current ${job.max_usd}; cancel_table_job to stop`);
      await deps.store.jobUpdate(id, { max_usd: maxUsd });
    }
    launch(id, deps);
    const fresh = await deps.store.jobGet(id);
    return { ok: true, resumed: true, ...(fresh ? jobView(fresh) : { job_id: id }) };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function cancelTableJob(jobId: string, depsIn?: TableJobDeps | null): Promise<Record<string, unknown>> {
  const deps = depsIn ?? defaultDeps();
  if (!deps) return notConfigured();
  try {
    const id = validateJobId(jobId);
    const job = await deps.store.jobGet(id);
    if (!job) return { ok: false, error: 'job not found', job_id: id };
    if (job.status === 'completed' || job.status === 'cancelled') return { ok: true, ...jobView(job), message: `Already ${job.status}.` };
    await deps.store.jobUpdate(id, { status: 'cancelled', finished_at: new Date().toISOString() });
    return { ok: true, cancelled: true, ...jobView((await deps.store.jobGet(id)) || job), message: 'Stops after the current batch. Nothing is deleted; results so far stay in dest_table.' };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

function validateJobId(id: unknown): string {
  if (typeof id !== 'string' || !/^tj-[a-f0-9]{10}(-\d{1,3})?$/.test(id)) throw new ValidationError('invalid job_id');
  return id;
}

// ----------------------------------------------------------------------------------------------- runner

const activeRuns = new Map<string, Promise<void>>();

function launch(jobId: string, deps: TableJobDeps): Promise<void> {
  const running = activeRuns.get(jobId);
  if (running) return running;
  const p = runTableJob(jobId, deps)
    .then(() => undefined)
    .catch((err) => console.error('[table-jobs] run failed', jobId, errMsg(err)))
    .finally(() => activeRuns.delete(jobId));
  activeRuns.set(jobId, p);
  return deps.background === false ? p : Promise.resolve();
}

/** Test helper: wait for an in-process run. */
export async function waitForTableJob(jobId: string): Promise<void> {
  await activeRuns.get(jobId);
}

function toInput(row: SourceRow, defaultState: string): NameLookupInput {
  return {
    company_name: String(row.company_name || '').trim(),
    city: row.city?.trim() || '',
    state: normState(String(row.state || ''), defaultState),
    domain: row.domain?.trim() || null,
    website: row.website?.trim() || null,
    phone: row.phone?.trim() || null,
    address: row.address?.trim() || null,
    mailing_address: row.mailing_address?.trim() || null,
  };
}

function toDestRow(jobId: string, row: SourceRow, input: NameLookupInput, result: NameLookupResult): DestRow {
  const hit = toOwnerHitRow(jobId, null, input, result);
  return {
    source_id: row.id,
    status: hit.waterfall_ready ? 'named' : 'miss',
    legal_name: hit.legal_name,
    owner_first: hit.owner_first,
    owner_last: hit.owner_last,
    owner_title: hit.owner_title,
    owner_role: hit.owner_role,
    owner_email: hit.owner_email,
    owner_phone: hit.owner_phone,
    source: hit.source,
    source_url: hit.source_url,
    confidence: hit.confidence,
    confidence_score: hit.confidence_score,
    waterfall_ready: hit.waterfall_ready,
    coverage_reason: hit.coverage_reason,
    cost_usd: hit.cost_usd,
    error: null,
  };
}

interface BatchOutcome {
  rows: DestRow[];
  capped: boolean;
  states: Array<{ state: string; named: boolean }>;
}

async function processBatch(
  jobId: string,
  rows: SourceRow[],
  ctx: LookupContext,
  tracker: ApifySpendTracker,
  opts: { defaultState: string; caBatch: boolean; lanes: number; reserveUsd: number },
  deps: TableJobDeps,
): Promise<BatchOutcome> {
  const inputs = rows.map((r) => toInput(r, opts.defaultState));
  const results: Array<DestRow | null> = new Array(rows.length).fill(null);
  let capped = false;

  const todo: number[] = [];
  rows.forEach((row, i) => {
    if (!inputs[i].state) {
      results[i] = { source_id: row.id, status: 'miss', coverage_reason: 'no_state', waterfall_ready: false, cost_usd: 0 };
    } else todo.push(i);
  });

  const caIdx = opts.caBatch ? todo.filter((i) => inputs[i].state === 'CA') : [];
  const otherIdx = opts.caBatch ? todo.filter((i) => inputs[i].state !== 'CA') : todo;

  if (caIdx.length) {
    const batch = await runCaBatch(caIdx.map((i) => inputs[i]), ctx, { jobId });
    if (batch.refused) capped = true;
    else caIdx.forEach((rowIdx, k) => {
      const r = batch.results[k];
      if (r) results[rowIdx] = toDestRow(jobId, rows[rowIdx], inputs[rowIdx], r);
    });
  }

  await mapPool(otherIdx, opts.lanes, async (i) => {
    // Start a row only if every in-flight row could still finish inside the cap. A refused vendor call mid-row
    // would otherwise be recorded as a miss, and a row that merely ran out of budget must stay pending instead.
    if (capped || tracker.exhausted() || tracker.remainingTotalUsd() < opts.reserveUsd) {
      capped = true;
      return;
    }
    try {
      const r = await deps.resolve(inputs[i], ctx);
      results[i] = toDestRow(jobId, rows[i], inputs[i], r);
    } catch (err) {
      results[i] = { source_id: rows[i].id, status: 'error', error: errMsg(err).slice(0, 160), waterfall_ready: false, cost_usd: 0 };
    }
  });

  const out: DestRow[] = [];
  const states: BatchOutcome['states'] = [];
  results.forEach((r, i) => {
    if (!r) return; // not processed (cap): stays pending for resume
    out.push(r);
    states.push({ state: inputs[i].state || 'UNK', named: r.status === 'named' });
  });
  return { rows: out, capped, states };
}

export async function runTableJob(jobId: string, deps: TableJobDeps): Promise<JobRecord | null> {
  const cfg = deps.config ?? tableJobsConfig();
  const store = deps.store;
  const job = await store.jobGet(jobId);
  if (!job) return null;
  if (!(await store.jobClaim(jobId, deps.runnerId, STALE_SECONDS))) return job;

  const perRow = Number((job.estimate as { per_row_usd_max?: number } | null)?.per_row_usd_max) || 0.03;
  const opts = {
    defaultState: String(job.options.default_state || ''),
    caBatch: job.options.ca_batch === true,
    lanes: cfg.lanes,
    reserveUsd: Number((Math.max(0.005, perRow) * cfg.lanes).toFixed(4)),
  };
  const batchSize = opts.caBatch ? TABLE_JOB_CA_BATCH : cfg.batchSize;
  const spec: SourceSpec = { source_table: job.source_table, id_column: job.id_column, column_map: job.column_map, filters: job.filters };
  const c = {
    processed: job.processed,
    named: job.named,
    missed: job.missed,
    errors: job.errors,
    spend: job.spend_usd,
    by_state: structuredClone(job.by_state || {}),
  };
  const heartbeat = setInterval(() => {
    void store.jobUpdate(jobId, {}, deps.runnerId).catch(() => undefined);
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let final: JobStatus = 'completed';
  let lostClaim = false;
  try {
    let after: string | null = null;
    while (true) {
      const cur = await store.jobGet(jobId);
      if (!cur || cur.status === 'cancelled') {
        final = 'cancelled';
        break;
      }
      if (c.processed >= job.total) break;
      const remainingCap = Number((cur.max_usd - c.spend).toFixed(4));
      if (remainingCap < opts.reserveUsd) {
        final = 'capped';
        break;
      }
      const lim = Math.min(batchSize, job.total - c.processed);
      const rows = await withRetry(() => store.fetch(spec, job.dest_table, after, lim, true), { attempts: 3, baseDelayMs: 500, label: 'tj fetch' });
      if (!rows.length) break;
      after = rows[rows.length - 1].id;

      const tracker = new ApifySpendTracker({ capUsd: remainingCap, persistPath: null });
      const ctx = defaultLookupContext({
        live: true,
        includeAgents: false,
        spend: tracker,
        serper: new SerperCreditTracker(),
        totalMaxUsd: remainingCap,
        apifySpendFile: '',
        caHybridOnly: true,
        caHybridMaxResultsPerQuery: typeof job.options.ca_max_results === 'number' ? job.options.ca_max_results : undefined,
        ...(deps.ctxOverrides || {}),
      });
      const out = await processBatch(jobId, rows, ctx, tracker, opts, deps);

      if (out.rows.length) {
        await withRetry(() => store.write(job.dest_table, jobId, out.rows), { attempts: 4, baseDelayMs: 1000, label: 'tj write' });
      }
      for (const r of out.rows) {
        c.processed += 1;
        if (r.status === 'named') c.named += 1;
        else if (r.status === 'miss') c.missed += 1;
        else c.errors += 1;
      }
      for (const s of out.states) {
        const v = c.by_state[s.state] || { attempted: 0, named: 0 };
        v.attempted += 1;
        if (s.named) v.named += 1;
        c.by_state[s.state] = v;
      }
      c.spend = Number((c.spend + tracker.usd).toFixed(4));
      const ok = await store.jobUpdate(
        jobId,
        { processed: c.processed, named: c.named, missed: c.missed, errors: c.errors, spend_usd: c.spend, by_state: c.by_state },
        deps.runnerId,
      );
      if (!ok) {
        lostClaim = true; // another instance took over; stop quietly
        break;
      }
      if (out.capped) {
        final = 'capped';
        break;
      }
    }
    if (!lostClaim) {
      await store.jobUpdate(
        jobId,
        { status: final, finished_at: final === 'capped' ? undefined : new Date().toISOString(), release: true, error: null as unknown as string },
        deps.runnerId,
      );
    }
  } catch (err) {
    await store
      .jobUpdate(jobId, { status: 'failed', error: errMsg(err), release: true }, deps.runnerId)
      .catch(() => undefined);
  } finally {
    clearInterval(heartbeat);
  }
  return store.jobGet(jobId);
}

/** Pick up jobs a previous process left running (restart, deploy). Safe to call repeatedly. */
export async function resumeStaleTableJobs(depsIn?: TableJobDeps | null): Promise<number> {
  const deps = depsIn ?? defaultDeps();
  if (!deps) return 0;
  let started = 0;
  try {
    const jobs = await deps.store.jobList(['queued', 'running'], 20);
    for (const j of jobs) {
      if (activeRuns.has(j.job_id)) continue;
      const fresh = j.heartbeat_at && Date.parse(j.heartbeat_at) > Date.now() - STALE_SECONDS * 1000;
      if (fresh && j.runner_id && j.runner_id !== deps.runnerId) continue;
      void launch(j.job_id, deps);
      started += 1;
    }
  } catch (err) {
    console.warn('[table-jobs] resume sweep failed', errMsg(err));
  }
  return started;
}

export function startTableJobSweeper(): void {
  const deps = defaultDeps();
  if (!deps || !tableJobsConfig().autoResume) return;
  const sweep = () => void resumeStaleTableJobs(deps);
  setTimeout(sweep, 5_000).unref?.();
  setInterval(sweep, 60_000).unref?.();
  console.log('[table-jobs] resume sweeper on');
}

export type { ColumnTarget };
