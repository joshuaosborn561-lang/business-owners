/**
 * Trade license boards as an owner source (free):
 *  FL DBPR construction licensee extract (loaded into Supabase business_owners.fl_license)
 *  TX TDLR All Licenses open data (data.texas.gov 7358-krk7), live SODA query
 * A license qualifier on a small contractor is usually the owner. Exact
 * normalized business-name match only; city breaks ties.
 */
import { normalizeState, validateOfficerPersonName } from '../names.js';
import type { LookupContext } from './context.js';
import { ctxFetch } from './context.js';
import { ilNormName } from './ilLlc.js';
import { hitsFromRoster } from './officers.js';
import { lookupFlLicenseDb, registryDbConfigured } from './registryDb.js';
import type { NameLookupInput, NameLookupResult } from './types.js';

export const TDLR_SODA = 'https://data.texas.gov/resource/7358-krk7.json';
export const DBPR_URL = 'https://www2.myfloridalicense.com/instant-public-records/';

function lastFirst(raw: string): string {
  const n = String(raw || '').replace(/\s+/g, ' ').trim();
  const m = n.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : n;
}

function pick<T>(rows: T[], city: string | null | undefined, cityOf: (r: T) => string): T | null {
  if (!rows.length) return null;
  const want = String(city || '').toUpperCase().trim();
  const same = rows.filter((r) => cityOf(r).toUpperCase().trim() === want);
  if (same.length) return same[0];
  return rows.length === 1 ? rows[0] : null;
}

export async function resolveLicenseBoards(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const st = normalizeState(input.state);
  const key = ilNormName(input.company_name);
  if (key.length < 4) return null;
  let person: string | null = null;
  let url = '';
  if (st === 'FL' && registryDbConfigured()) {
    const row = pick((await lookupFlLicenseDb([key])) || [], input.city, (r) => r.city);
    if (row?.person) { person = row.person; url = DBPR_URL; }
  } else if (st === 'TX') {
    const tokens = String(input.company_name).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !/^(LLC|INC|THE|AND|CO)$/.test(t)).slice(0, 4);
    if (!tokens.length) return null;
    const where = tokens.map((t) => `upper(business_name) like '%${t}%'`).join(' AND ');
    try {
      const res = await ctxFetch(ctx)(`${TDLR_SODA}?$where=${encodeURIComponent(where)}&$limit=50`, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const rows = ((await res.json()) as Array<Record<string, string>>).filter((r) => ilNormName(r.business_name || '') === key && r.owner_name);
        const row = rows[0];
        if (row) { person = lastFirst(row.owner_name); url = `${TDLR_SODA}?license_number=${encodeURIComponent(row.license_number || '')}`; }
      }
    } catch { /* no source */ }
  }
  if (!person || !validateOfficerPersonName(person).ok) return null;
  const people = hitsFromRoster(input, [{ name: person, title: 'Owner (license qualifier)', role: 'qualifying_individual', labeled: true }], 'us_sos', url, 'exact', { cityMatch: true });
  return people.length ? { people, coverage_reason: null, source: 'us_sos', source_url: url, match_method: 'exact', implemented: true } : null;
}
