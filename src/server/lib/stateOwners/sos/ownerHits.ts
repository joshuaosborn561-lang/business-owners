/**
 * Owner results: one row per input business, saved as each lookup finishes.
 *
 * Kept in memory per job (so results come back even without Supabase) and,
 * when BO_SUPABASE_* is configured, upserted into business_owners.owner_hits
 * through the token-checked RPC bo_save_owner_hits. Read back with
 * bo_get_owner_hits or the get_owner_results MCP tool.
 */
import type { NameLookupInput, NameLookupResult, WaterfallOwnerHit } from './types.js';
import { isWaterfallReady } from './waterfall.js';

export interface OwnerHitRow {
  job_id: string;
  client_tag: string | null;
  input_company: string;
  input_city: string;
  input_state: string;
  input_phone: string | null;
  input_domain: string | null;
  input_address: string | null;
  legal_name: string | null;
  owner_first: string | null;
  owner_last: string | null;
  owner_title: string | null;
  owner_role: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  source: string | null;
  open_data_source: string | null;
  source_url: string | null;
  confidence: string | null;
  confidence_score: number | null;
  waterfall_ready: boolean;
  coverage_reason: string | null;
  other_people: Array<{ first_name: string | null; last_name: string | null; title: string | null; waterfall_ready: boolean }>;
  cost_usd: number;
}

const MEMORY_CAP_PER_JOB = 20_000;
const memory = new Map<string, OwnerHitRow[]>();

const titleCase = (s: string | null | undefined): string | null => {
  const t = String(s || '').trim();
  if (!t) return null;
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()).replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`);
};

/** Best person: first waterfall-ready hit, else the first named candidate. */
export function bestPerson(result: NameLookupResult): { person: WaterfallOwnerHit | null; ready: boolean } {
  const ready = result.people.find((p) => isWaterfallReady(p));
  if (ready) return { person: ready, ready: true };
  const any = result.people.find((p) => p.first_name && p.last_name);
  return { person: any || null, ready: false };
}

export function toOwnerHitRow(jobId: string, clientTag: string | null, input: NameLookupInput, result: NameLookupResult): OwnerHitRow {
  const { person, ready } = bestPerson(result);
  const cost = (result.serper_usd || 0) + (result.apify_usd || 0) + (result.unblocker_usd || 0);
  return {
    job_id: jobId,
    client_tag: clientTag,
    input_company: input.company_name,
    input_city: input.city || '',
    input_state: String(input.state || '').toUpperCase(),
    input_phone: input.phone || null,
    input_domain: input.domain || input.website || null,
    input_address: input.address || null,
    legal_name: result.legal_name || result.business_name || null,
    owner_first: titleCase(person?.first_name),
    owner_last: titleCase(person?.last_name),
    owner_title: person?.title || null,
    owner_role: person?.role || null,
    owner_email: person?.email || null,
    owner_phone: person?.phone || null,
    source: person ? result.open_data_source || person.source : result.source || null,
    open_data_source: result.open_data_source || null,
    source_url: person?.source_url || result.source_url || null,
    confidence: person?.confidence || null,
    confidence_score: person?.confidence_score ?? null,
    waterfall_ready: ready,
    coverage_reason: result.coverage_reason || null,
    other_people: result.people
      .filter((p) => p !== person && p.first_name && p.last_name)
      .slice(0, 4)
      .map((p) => ({ first_name: titleCase(p.first_name), last_name: titleCase(p.last_name), title: p.title || null, waterfall_ready: isWaterfallReady(p) })),
    cost_usd: Number(cost.toFixed(4)),
  };
}

export function rememberOwnerHit(row: OwnerHitRow): void {
  const list = memory.get(row.job_id) || [];
  if (list.length < MEMORY_CAP_PER_JOB) list.push(row);
  memory.set(row.job_id, list);
}

export function memoryOwnerHits(jobId: string): OwnerHitRow[] | null {
  return memory.get(jobId) ?? null;
}

export function resetOwnerHitsForTests(): void {
  memory.clear();
}

export function ownerHitsDbConfigured(): boolean {
  return Boolean(process.env.BO_SUPABASE_URL && process.env.BO_SUPABASE_KEY && process.env.BO_REGISTRY_TOKEN) && process.env.OWNER_HITS_DB !== 'false';
}

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: T | null; error?: string }> {
  const url = String(process.env.BO_SUPABASE_URL).replace(/\/$/, '');
  const key = String(process.env.BO_SUPABASE_KEY);
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tok: process.env.BO_REGISTRY_TOKEN, ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, data: null, error: `http_${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.name : 'error' };
  }
}

/** Upsert a batch. Returns rows written (0 when the DB is not configured). Never throws. */
export async function saveOwnerHits(rows: OwnerHitRow[]): Promise<{ written: number; error?: string }> {
  if (!rows.length || !ownerHitsDbConfigured()) return { written: 0 };
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const got = await rpc<number>('bo_save_owner_hits', { rows: rows.slice(i, i + 500) });
    if (!got.ok) return { written, error: got.error };
    written += Number(got.data) || 0;
  }
  return { written };
}

export async function fetchOwnerHits(opts: {
  job_id?: string | null;
  client_tag?: string | null;
  only_named?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ rows: OwnerHitRow[]; source: 'memory' | 'supabase' | 'none'; error?: string }> {
  const onlyNamed = opts.only_named !== false;
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));
  const offset = Math.max(0, opts.offset ?? 0);
  if (opts.job_id) {
    const mem = memoryOwnerHits(opts.job_id);
    if (mem) {
      const pool = onlyNamed ? mem.filter((r) => r.waterfall_ready) : mem;
      return { rows: pool.slice(offset, offset + limit), source: 'memory' };
    }
  }
  if (!ownerHitsDbConfigured()) return { rows: [], source: 'none' };
  const got = await rpc<OwnerHitRow[]>('bo_get_owner_hits', {
    job: opts.job_id || null,
    client: opts.client_tag || null,
    only_named: onlyNamed,
    lim: limit,
    off: offset,
  });
  return { rows: got.data || [], source: 'supabase', error: got.error };
}

const CSV_COLUMNS: Array<keyof OwnerHitRow> = [
  'input_company', 'input_city', 'input_state', 'input_phone', 'input_domain', 'legal_name',
  'owner_first', 'owner_last', 'owner_title', 'owner_email', 'owner_phone',
  'source', 'confidence', 'confidence_score', 'waterfall_ready', 'source_url', 'job_id', 'client_tag',
];

export function ownerHitsCsv(rows: OwnerHitRow[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(','))].join('\n');
}

/** Compact shape for tool replies and for Email Finder Waterfall name_company rows. */
export function ownerHitForReply(r: OwnerHitRow): Record<string, unknown> {
  return {
    company_name: r.input_company,
    legal_name: r.legal_name,
    city: r.input_city,
    state: r.input_state,
    domain: r.input_domain,
    phone: r.input_phone,
    first_name: r.owner_first,
    last_name: r.owner_last,
    title: r.owner_title,
    owner_email: r.owner_email,
    owner_phone: r.owner_phone,
    source: r.source,
    confidence_score: r.confidence_score,
    waterfall_ready: r.waterfall_ready,
    source_url: r.source_url,
  };
}
