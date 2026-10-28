/**
 * Storage for table-driven jobs. Two implementations of one interface:
 *  - RpcStore: token-checked Postgres RPCs (supabase/migrations/20261028_table_jobs.sql) over Supabase REST.
 *  - MemoryStore (store.memory.ts): same behavior in memory, for tests.
 * Lead rows only ever move service <-> database through this interface; none of it is returned to MCP callers.
 */
import type { ColumnTarget, TableFilter } from './ident.js';

export type JobStatus = 'queued' | 'running' | 'completed' | 'capped' | 'failed' | 'cancelled';

export interface SourceRow {
  id: string;
  company_name: string;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  domain?: string | null;
  website?: string | null;
  address?: string | null;
  mailing_address?: string | null;
}

export interface SourceSpec {
  source_table: string;
  id_column: string;
  column_map: Partial<Record<ColumnTarget, string>>;
  filters: TableFilter[];
}

export interface PlanResult {
  total_matching: number;
  blank_company: number;
  remaining: number;
  already_done: number;
  selected: number;
  by_state: Record<string, number>;
  dest_exists: boolean;
  column_map: Record<string, string>;
}

export type DestStatus = 'named' | 'miss' | 'error';

export interface DestRow {
  source_id: string;
  status: DestStatus;
  legal_name?: string | null;
  owner_first?: string | null;
  owner_last?: string | null;
  owner_title?: string | null;
  owner_role?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  source?: string | null;
  source_url?: string | null;
  confidence?: string | null;
  confidence_score?: number | null;
  waterfall_ready?: boolean;
  coverage_reason?: string | null;
  cost_usd?: number;
  error?: string | null;
}

export interface JobRecord {
  job_id: string;
  status: JobStatus;
  source_table: string;
  id_column: string;
  dest_table: string;
  column_map: Record<string, string>;
  filters: TableFilter[];
  row_limit: number | null;
  max_usd: number;
  client_tag: string | null;
  options: Record<string, unknown>;
  estimate: Record<string, unknown> | null;
  total: number;
  processed: number;
  named: number;
  missed: number;
  errors: number;
  spend_usd: number;
  by_state: Record<string, { attempted: number; named: number }>;
  error: string | null;
  runner_id: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type JobPatch = Partial<
  Pick<JobRecord, 'status' | 'total' | 'processed' | 'named' | 'missed' | 'errors' | 'spend_usd' | 'max_usd' | 'by_state' | 'error' | 'finished_at'>
> & { release?: boolean };

export interface DestSummary {
  rows: number;
  named: number;
  waterfall_ready: number;
  miss: number;
  error: number;
  with_email: number;
  with_phone: number;
  cost_usd: number;
  by_source: Record<string, number>;
  by_confidence: Record<string, number>;
  by_coverage: Record<string, number>;
}

export interface TableJobsStore {
  columns(sourceTable: string): Promise<string[]>;
  plan(spec: SourceSpec, destTable: string | null, limit: number, retryErrors: boolean): Promise<PlanResult>;
  fetch(spec: SourceSpec, destTable: string, after: string | null, limit: number, retryErrors: boolean): Promise<SourceRow[]>;
  prepareDest(destTable: string): Promise<{ dest_table: string; created: boolean }>;
  write(destTable: string, jobId: string, rows: DestRow[]): Promise<number>;
  summary(destTable: string, jobId?: string | null): Promise<DestSummary>;
  jobCreate(job: Partial<JobRecord> & { job_id: string }): Promise<JobRecord>;
  jobGet(jobId: string): Promise<JobRecord | null>;
  jobList(statuses?: JobStatus[] | null, limit?: number): Promise<JobRecord[]>;
  jobClaim(jobId: string, runnerId: string, staleSeconds: number): Promise<boolean>;
  jobUpdate(jobId: string, patch: JobPatch, runnerId?: string | null): Promise<boolean>;
}

export interface RpcConfig {
  url: string;
  key: string;
  token: string;
}

export function rpcConfigFromEnv(): RpcConfig | null {
  const url = process.env.TABLE_JOBS_SUPABASE_URL?.trim();
  const key = process.env.TABLE_JOBS_SUPABASE_KEY?.trim();
  const token = process.env.TABLE_JOBS_TOKEN?.trim();
  if (!url || !key || !token) return null;
  return { url: url.replace(/\/$/, ''), key, token };
}

export function tableJobsMissingEnv(): string[] {
  return ['TABLE_JOBS_SUPABASE_URL', 'TABLE_JOBS_SUPABASE_KEY', 'TABLE_JOBS_TOKEN'].filter((n) => !process.env[n]?.trim());
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function toJob(raw: Record<string, unknown>): JobRecord {
  return {
    ...(raw as unknown as JobRecord),
    max_usd: num(raw.max_usd),
    spend_usd: num(raw.spend_usd),
    total: num(raw.total),
    processed: num(raw.processed),
    named: num(raw.named),
    missed: num(raw.missed),
    errors: num(raw.errors),
    row_limit: raw.row_limit == null ? null : num(raw.row_limit),
    by_state: (raw.by_state as JobRecord['by_state']) || {},
    column_map: (raw.column_map as JobRecord['column_map']) || {},
    filters: (raw.filters as TableFilter[]) || [],
    options: (raw.options as Record<string, unknown>) || {},
  };
}

export class RpcStore implements TableJobsStore {
  constructor(
    private readonly cfg: RpcConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async rpc<T>(fn: string, body: Record<string, unknown>, timeoutMs = 120_000): Promise<T> {
    const res = await this.fetchImpl(`${this.cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      // Legacy anon keys are JWTs and go in Authorization too; sb_publishable_ keys are not JWTs and go in apikey only.
      headers: {
        apikey: this.cfg.key,
        ...(this.cfg.key.split('.').length === 3 ? { Authorization: `Bearer ${this.cfg.key}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tok: this.cfg.token, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `http_${res.status}`;
      try {
        const j = JSON.parse(text) as { message?: string };
        if (j.message) msg = j.message;
      } catch {
        /* keep status */
      }
      throw new Error(`${fn}: ${msg}`.slice(0, 300));
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  columns(sourceTable: string) {
    return this.rpc<string[]>('bo_tj_columns', { source_table: sourceTable });
  }

  async plan(spec: SourceSpec, destTable: string | null, limit: number, retryErrors: boolean) {
    const r = await this.rpc<Record<string, unknown>>('bo_tj_plan', {
      source_table: spec.source_table,
      id_column: spec.id_column,
      column_map: spec.column_map,
      filters: spec.filters,
      dest_table: destTable,
      lim: limit,
      retry_errors: retryErrors,
    });
    const by_state: Record<string, number> = {};
    for (const [k, v] of Object.entries((r.by_state as Record<string, unknown>) || {})) by_state[k] = num(v);
    return {
      total_matching: num(r.total_matching),
      blank_company: num(r.blank_company),
      remaining: num(r.remaining),
      already_done: num(r.already_done),
      selected: num(r.selected),
      by_state,
      dest_exists: Boolean(r.dest_exists),
      column_map: (r.column_map as Record<string, string>) || {},
    } satisfies PlanResult;
  }

  fetch(spec: SourceSpec, destTable: string, after: string | null, limit: number, retryErrors: boolean) {
    return this.rpc<SourceRow[]>('bo_tj_fetch', {
      source_table: spec.source_table,
      id_column: spec.id_column,
      column_map: spec.column_map,
      filters: spec.filters,
      dest_table: destTable,
      after,
      lim: limit,
      retry_errors: retryErrors,
    });
  }

  prepareDest(destTable: string) {
    return this.rpc<{ dest_table: string; created: boolean }>('bo_tj_prepare_dest', { dest_table: destTable });
  }

  async write(destTable: string, jobId: string, rows: DestRow[]) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      n += num(await this.rpc<number>('bo_tj_write', { dest_table: destTable, job_id: jobId, rows: rows.slice(i, i + 500) }));
    }
    return n;
  }

  async summary(destTable: string, jobId?: string | null) {
    const r = await this.rpc<Record<string, unknown>>('bo_tj_summary', { dest_table: destTable, job_id: jobId ?? null });
    return {
      rows: num(r.rows),
      named: num(r.named),
      waterfall_ready: num(r.waterfall_ready),
      miss: num(r.miss),
      error: num(r.error),
      with_email: num(r.with_email),
      with_phone: num(r.with_phone),
      cost_usd: num(r.cost_usd),
      by_source: (r.by_source as Record<string, number>) || {},
      by_confidence: (r.by_confidence as Record<string, number>) || {},
      by_coverage: (r.by_coverage as Record<string, number>) || {},
    } satisfies DestSummary;
  }

  async jobCreate(job: Partial<JobRecord> & { job_id: string }) {
    return toJob(await this.rpc<Record<string, unknown>>('bo_tj_job_create', { j: { ...job, row_limit: job.row_limit ?? null } }));
  }

  async jobGet(jobId: string) {
    const r = await this.rpc<Record<string, unknown> | null>('bo_tj_job_get', { id: jobId });
    return r ? toJob(r) : null;
  }

  async jobList(statuses?: JobStatus[] | null, limit = 50) {
    const r = await this.rpc<Array<Record<string, unknown>>>('bo_tj_job_list', { statuses: statuses ?? null, lim: limit });
    return (r || []).map(toJob);
  }

  jobClaim(jobId: string, runnerId: string, staleSeconds: number) {
    return this.rpc<boolean>('bo_tj_job_claim', { id: jobId, runner: runnerId, stale_seconds: staleSeconds });
  }

  jobUpdate(jobId: string, patch: JobPatch, runnerId?: string | null) {
    return this.rpc<boolean>('bo_tj_job_update', { id: jobId, patch, runner: runnerId ?? null });
  }
}
