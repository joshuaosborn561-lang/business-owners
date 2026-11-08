/**
 * FMCSA Company Census (data.transportation.gov az4n-8mr2, daily, free): every USDOT registrant with
 * company_officer_1/2, phone, email, power units and drivers. Verified 2026-11-08: 2,102,953 active carriers with
 * an officer; 248,488 of them with 5 or more power units.
 *
 * Universe mode keeps active carriers with an officer and at least `minPowerUnits` power units (default 5) so
 * one-truck owner-operators do not flood the table. Pages by :id, never loads the raw file.
 */
import type { FetchLike } from '../stateOwners/http.js';
import { ilNormName } from '../stateOwners/sos/ilLlc.js';
import { ownerName, readyOwner } from './owners.js';
import { blank, digits10, intOrNull, isoDate, zip5, type UniverseRow } from './types.js';

export const FMCSA_URL = 'https://data.transportation.gov/resource/az4n-8mr2.json';
export const FMCSA_DEFAULT_MIN_POWER_UNITS = 5;

const FIELDS = [
  'dot_number', 'legal_name', 'dba_name', 'phy_street', 'phy_city', 'phy_state', 'phy_zip', 'phone', 'cell_phone',
  'email_address', 'company_officer_1', 'company_officer_2', 'power_units', 'total_drivers', 'mcs150_date', 'status_code',
];

export function fmcsaWhere(opts: { state?: string | null; minPowerUnits?: number }): string {
  const parts = ["status_code='A'", 'company_officer_1 IS NOT NULL'];
  const min = opts.minPowerUnits ?? FMCSA_DEFAULT_MIN_POWER_UNITS;
  if (min > 0) parts.push(`power_units::number >= ${Math.trunc(min)}`);
  if (opts.state) parts.push(`phy_state='${String(opts.state).toUpperCase().replace(/[^A-Z]/g, '')}'`);
  return parts.join(' AND ');
}

export function fmcsaUniverseRow(r: Record<string, string>): UniverseRow | null {
  const dot = blank(r.dot_number);
  const legal = blank(r.legal_name);
  if (!dot || !legal) return null;
  const n1 = ownerName(r.company_officer_1, [r.phy_city]);
  const n2 = ownerName(r.company_officer_2, [r.phy_city]);
  const best = n1.ok ? n1 : n2.ok ? n2 : n1;
  const dba = blank(r.dba_name);
  return {
    source: 'fmcsa',
    source_record_id: dot,
    legal_name: legal,
    dba,
    address: blank(r.phy_street),
    city: blank(r.phy_city),
    state: blank(r.phy_state),
    zip: blank(r.phy_zip),
    phone: digits10(r.phone) || digits10(r.cell_phone),
    ein: null,
    npi: null,
    ccn: null,
    usdot: dot,
    owner_first: best.first,
    owner_last: best.last,
    owner_title: 'Company Officer',
    ownership_pct: null,
    pe_flag: null,
    reit_flag: null,
    org_owners: null,
    size_employees: null,
    size_participants: null,
    size_power_units: intOrNull(r.power_units),
    size_drivers: intOrNull(r.total_drivers),
    business_code: null,
    as_of: isoDate(r.mcs150_date),
    confidence: best.ok ? 'high' : null,
    waterfall_ready: readyOwner(best, 'Company Officer'),
    name_key: ilNormName(legal) || null,
    dba_key: dba ? ilNormName(dba) || null : null,
    zip5: zip5(r.phy_zip),
  };
}

export async function* fmcsaUniverse(opts: { state?: string | null; minPowerUnits?: number; fetchImpl?: FetchLike; pageSize?: number } = {}): AsyncGenerator<UniverseRow> {
  const fetchImpl = opts.fetchImpl || (fetch as unknown as FetchLike);
  const pageSize = opts.pageSize ?? 50_000;
  const where = fmcsaWhere(opts);
  for (let offset = 0; ; offset += pageSize) {
    const p = new URLSearchParams({ $select: FIELDS.join(','), $where: where, $order: ':id', $limit: String(pageSize), $offset: String(offset) });
    let page: Array<Record<string, string>> = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetchImpl(`${FMCSA_URL}?${p.toString()}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(180_000) } as RequestInit);
        if (res.ok) {
          const j = await res.json();
          page = Array.isArray(j) ? j : [];
          break;
        }
      } catch {
        /* retry */
      }
      if (attempt === 3) throw new Error('fmcsa census unavailable');
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    for (const r of page) {
      const row = fmcsaUniverseRow(r);
      if (row) yield row;
    }
    if (page.length < pageSize) return;
  }
}
