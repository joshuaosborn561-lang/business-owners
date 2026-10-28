/** In-memory TableJobsStore with the same semantics as the SQL RPCs. Tests only. */
import type {
  DestRow,
  DestSummary,
  JobPatch,
  JobRecord,
  JobStatus,
  PlanResult,
  SourceRow,
  SourceSpec,
  TableJobsStore,
} from './store.js';
import type { TableFilter } from './ident.js';

type Row = Record<string, string | null>;
type DestStored = DestRow & { job_id: string; attempts: number };

function matches(row: Row, f: TableFilter): boolean {
  const v = row[f.column];
  const s = v == null ? null : String(v);
  switch (f.op ?? 'eq') {
    case 'eq':
      return s === String(f.value);
    case 'neq':
      return s !== String(f.value);
    case 'gt':
      return s != null && Number(s) > Number(f.value);
    case 'gte':
      return s != null && Number(s) >= Number(f.value);
    case 'lt':
      return s != null && Number(s) < Number(f.value);
    case 'lte':
      return s != null && Number(s) <= Number(f.value);
    case 'like':
    case 'ilike': {
      const re = new RegExp(`^${String(f.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, f.op === 'ilike' ? 'i' : '');
      return s != null && re.test(s);
    }
    case 'in':
      return s != null && (f.values || []).map(String).includes(s);
    case 'not_in':
      return s == null || !(f.values || []).map(String).includes(s);
    case 'is_null':
      return s == null;
    case 'not_null':
      return s != null;
  }
}

export class MemoryStore implements TableJobsStore {
  tables = new Map<string, Row[]>();
  dests = new Map<string, Map<string, DestStored>>();
  jobs = new Map<string, JobRecord>();
  /** Test hook: throw on the Nth write call (1-based) to simulate a crash. */
  failWriteOn: number | null = null;
  writeCalls = 0;
  fetchCalls: Array<{ after: string | null; limit: number }> = [];

  addTable(name: string, rows: Row[]) {
    this.tables.set(name, rows);
  }

  private src(name: string): Row[] {
    const t = this.tables.get(name);
    if (!t) throw new Error(`table not found: ${name}`);
    return t;
  }

  private select(spec: SourceSpec, destTable: string | null, retryErrors: boolean): Row[] {
    const cm = spec.column_map;
    const dest = destTable ? this.dests.get(destTable) : undefined;
    return this.src(spec.source_table)
      .filter((r) => spec.filters.every((f) => matches(r, f)))
      .filter((r) => String(r[cm.company_name as string] ?? '').trim() !== '')
      .filter((r) => {
        const d = dest?.get(String(r[spec.id_column]));
        return !d || (d.status === 'error' && retryErrors && d.attempts < 3);
      })
      .sort((a, b) => (String(a[spec.id_column]) < String(b[spec.id_column]) ? -1 : 1));
  }

  async columns(sourceTable: string) {
    return Object.keys(this.src(sourceTable)[0] || {});
  }

  async plan(spec: SourceSpec, destTable: string | null, limit: number, retryErrors: boolean): Promise<PlanResult> {
    const all = this.src(spec.source_table).filter((r) => spec.filters.every((f) => matches(r, f)));
    const ids = all.map((r) => r[spec.id_column]);
    if (new Set(ids).size !== ids.length) throw new Error('id_column_not_unique');
    const nonBlank = all.filter((r) => String(r[spec.column_map.company_name as string] ?? '').trim() !== '');
    const rem = this.select(spec, destTable, retryErrors);
    const sel = rem.slice(0, limit);
    const by_state: Record<string, number> = {};
    if (spec.column_map.state) {
      for (const r of sel) {
        const st = String(r[spec.column_map.state] ?? '').trim().toUpperCase();
        by_state[st] = (by_state[st] || 0) + 1;
      }
    }
    return {
      total_matching: nonBlank.length,
      blank_company: all.length - nonBlank.length,
      remaining: rem.length,
      already_done: nonBlank.length - rem.length,
      selected: sel.length,
      by_state,
      dest_exists: Boolean(destTable && this.dests.has(destTable)),
      column_map: spec.column_map as Record<string, string>,
    };
  }

  async fetch(spec: SourceSpec, destTable: string, after: string | null, limit: number, retryErrors: boolean): Promise<SourceRow[]> {
    this.fetchCalls.push({ after, limit });
    return this.select(spec, destTable, retryErrors)
      .filter((r) => after == null || String(r[spec.id_column]) > after)
      .slice(0, limit)
      .map((r) => {
        const out: Record<string, string | null> = { id: String(r[spec.id_column]) };
        for (const [target, col] of Object.entries(spec.column_map)) out[target] = r[col as string] ?? null;
        return out as unknown as SourceRow;
      });
  }

  async prepareDest(destTable: string) {
    const created = !this.dests.has(destTable);
    if (created) this.dests.set(destTable, new Map());
    return { dest_table: destTable, created };
  }

  async write(destTable: string, jobId: string, rows: DestRow[]) {
    this.writeCalls += 1;
    if (this.failWriteOn === this.writeCalls) throw new Error('simulated write failure');
    const d = this.dests.get(destTable);
    if (!d) throw new Error('dest not prepared');
    let n = 0;
    for (const r of rows) {
      const cur = d.get(r.source_id);
      if (cur && cur.status === 'named' && r.status !== 'named') continue;
      d.set(r.source_id, { ...r, job_id: jobId, cost_usd: (cur?.cost_usd || 0) + (r.cost_usd || 0), attempts: (cur?.attempts || 0) + 1 });
      n += 1;
    }
    return n;
  }

  async summary(destTable: string, jobId?: string | null): Promise<DestSummary> {
    const rows = [...(this.dests.get(destTable)?.values() || [])].filter((r) => !jobId || r.job_id === jobId);
    const tally = (pick: (r: DestStored) => string | null | undefined, only?: (r: DestStored) => boolean) => {
      const o: Record<string, number> = {};
      for (const r of rows) if (!only || only(r)) o[pick(r) || 'none'] = (o[pick(r) || 'none'] || 0) + 1;
      return o;
    };
    return {
      rows: rows.length,
      named: rows.filter((r) => r.status === 'named').length,
      waterfall_ready: rows.filter((r) => r.waterfall_ready).length,
      miss: rows.filter((r) => r.status === 'miss').length,
      error: rows.filter((r) => r.status === 'error').length,
      with_email: rows.filter((r) => r.owner_email).length,
      with_phone: rows.filter((r) => r.owner_phone).length,
      cost_usd: Number(rows.reduce((a, r) => a + (r.cost_usd || 0), 0).toFixed(4)),
      by_source: tally((r) => r.source),
      by_confidence: tally((r) => r.confidence, (r) => r.status === 'named'),
      by_coverage: tally((r) => r.coverage_reason, (r) => r.status !== 'named'),
    };
  }

  async jobCreate(job: Partial<JobRecord> & { job_id: string }) {
    const existing = this.jobs.get(job.job_id);
    if (existing) return structuredClone(existing);
    const now = new Date().toISOString();
    const rec: JobRecord = {
      status: 'queued',
      source_table: '',
      id_column: '',
      dest_table: '',
      column_map: {},
      filters: [],
      row_limit: null,
      max_usd: 0,
      client_tag: null,
      options: {},
      estimate: null,
      total: 0,
      processed: 0,
      named: 0,
      missed: 0,
      errors: 0,
      spend_usd: 0,
      by_state: {},
      error: null,
      runner_id: null,
      heartbeat_at: null,
      created_at: now,
      updated_at: now,
      started_at: null,
      finished_at: null,
      ...job,
    };
    this.jobs.set(rec.job_id, rec);
    return structuredClone(rec);
  }

  async jobGet(jobId: string) {
    const j = this.jobs.get(jobId);
    return j ? structuredClone(j) : null;
  }

  async jobList(statuses?: JobStatus[] | null, limit = 50) {
    return [...this.jobs.values()]
      .filter((j) => !statuses || statuses.includes(j.status))
      .slice(0, limit)
      .map((j) => structuredClone(j));
  }

  async jobClaim(jobId: string, runnerId: string, staleSeconds: number) {
    const j = this.jobs.get(jobId);
    if (!j || !['queued', 'running', 'capped', 'failed'].includes(j.status)) return false;
    const stale = !j.heartbeat_at || Date.parse(j.heartbeat_at) < Date.now() - staleSeconds * 1000;
    if (j.runner_id && j.runner_id !== runnerId && !stale) return false;
    j.runner_id = runnerId;
    j.heartbeat_at = new Date().toISOString();
    j.status = 'running';
    j.error = null;
    j.started_at = j.started_at || j.heartbeat_at;
    return true;
  }

  async jobUpdate(jobId: string, patch: JobPatch, runnerId?: string | null) {
    const j = this.jobs.get(jobId);
    if (!j) return false;
    if (runnerId && j.runner_id && j.runner_id !== runnerId) return false;
    const { release, status, ...rest } = patch;
    if (status && j.status !== 'cancelled') j.status = status;
    Object.assign(j, rest);
    if (release) j.runner_id = null;
    else if (runnerId) j.runner_id = runnerId;
    if (runnerId) j.heartbeat_at = new Date().toISOString();
    j.updated_at = new Date().toISOString();
    return true;
  }
}
