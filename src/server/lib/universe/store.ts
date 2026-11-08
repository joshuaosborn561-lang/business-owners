/**
 * Universe table access through token-checked RPCs (supabase/migrations/20261108_universe.sql).
 * Same project and env as table jobs: TABLE_JOBS_SUPABASE_URL, TABLE_JOBS_SUPABASE_KEY, TABLE_JOBS_TOKEN.
 * UNIVERSE_TABLE picks the table (default client_pe.bo_universe).
 */
import { rpcConfigFromEnv, type RpcConfig } from '../tableJobs/store.js';
import { DEST_NAME_RE, IDENT_RE } from '../tableJobs/ident.js';
import type { UniverseRow, UniverseSource } from './types.js';

export const DEFAULT_UNIVERSE_TABLE = 'client_pe.bo_universe';

export function universeTableFromEnv(): string {
  return process.env.UNIVERSE_TABLE?.trim() || DEFAULT_UNIVERSE_TABLE;
}

export function assertUniverseTable(spec: string): string {
  const [sch, tbl, extra] = String(spec || '').split('.');
  if (extra !== undefined || !IDENT_RE.test(sch || '') || !DEST_NAME_RE.test(tbl || '')) {
    throw new Error('universe table must be schema.bo_<name> (lowercase)');
  }
  if (!sch.startsWith('client_') && sch !== 'scratch') throw new Error('universe table must live in a client_* or scratch schema');
  return `${sch}.${tbl}`;
}

export class UniverseStore {
  constructor(
    private readonly cfg: RpcConfig,
    readonly table: string = universeTableFromEnv(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertUniverseTable(table);
  }

  static fromEnv(table?: string): UniverseStore | null {
    const cfg = rpcConfigFromEnv();
    return cfg ? new UniverseStore(cfg, table || universeTableFromEnv()) : null;
  }

  private async rpc<T>(fn: string, body: Record<string, unknown>, timeoutMs = 120_000): Promise<T> {
    let last: Error = new Error(`${fn} failed`);
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.cfg.url}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          headers: {
            apikey: this.cfg.key,
            ...(this.cfg.key.split('.').length === 3 ? { Authorization: `Bearer ${this.cfg.key}` } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tok: this.cfg.token, ...body }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        // Network error or timeout: retry.
        last = e instanceof Error ? e : new Error(String(e));
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const text = await res.text();
      if (res.ok) return (text ? JSON.parse(text) : null) as T;
      let msg = `http_${res.status}`;
      try {
        msg = (JSON.parse(text) as { message?: string }).message || msg;
      } catch {
        /* keep status */
      }
      last = new Error(`${fn}: ${msg}`.slice(0, 300));
      // Client errors (bad token, bad table, bad rows) do not get better on retry.
      if (res.status < 500 && res.status !== 429) throw last;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    throw last;
  }

  prepare(): Promise<{ dest_table: string; created: boolean }> {
    return this.rpc('bo_uv_prepare', { dest_table: this.table });
  }

  async upsert(rows: UniverseRow[]): Promise<number> {
    let n = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      n += Number(await this.rpc<number>('bo_uv_upsert', { dest_table: this.table, rows: rows.slice(i, i + 1000) })) || 0;
    }
    return n;
  }

  lookup(source: UniverseSource, keys: { ein?: string | null; name_key?: string | null; zip5?: string | null; phone?: string | null }): Promise<UniverseRow[]> {
    return this.rpc<UniverseRow[]>(
      'bo_uv_lookup',
      { dest_table: this.table, src: source, ein: keys.ein || null, name_key: keys.name_key || null, zip5: keys.zip5 || null, phone: keys.phone || null },
      20_000,
    ).then((r) => (Array.isArray(r) ? r : []));
  }

  counts(): Promise<Record<string, { rows: number; named: number; waterfall_ready: number; states: number }>> {
    return this.rpc('bo_uv_counts', { dest_table: this.table });
  }
}
