/**
 * Universe mode: turn a whole public file into company + owner rows, independent of Maps / getleads.
 * One fixed row shape for every source so the table also works as a start_table_job source.
 */

export const UNIVERSE_SOURCES = [
  'cms_hha',
  'cms_hospice',
  'cms_snf',
  'cms_rhc',
  'cms_hospital',
  'fmcsa',
  'form5500',
] as const;
export type UniverseSource = (typeof UNIVERSE_SOURCES)[number];

export interface UniverseRow {
  source: UniverseSource;
  /** Stable id inside the source: CMS enrollment id, USDOT number, sponsor EIN. */
  source_record_id: string;
  legal_name: string;
  dba: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  ein: string | null;
  npi: string | null;
  ccn: string | null;
  usdot: string | null;
  owner_first: string | null;
  owner_last: string | null;
  owner_title: string | null;
  ownership_pct: number | null;
  /** CMS: any owner flagged as a private equity company. */
  pe_flag: boolean | null;
  /** CMS: any owner flagged as a REIT. */
  reit_flag: boolean | null;
  /** CMS: organizational owners (names only), for spotting roll-ups. */
  org_owners: string[] | null;
  size_employees: number | null;
  size_participants: number | null;
  size_power_units: number | null;
  size_drivers: number | null;
  business_code: string | null;
  /** Date the record speaks for: CMS file date, FMCSA MCS-150 date, 5500 plan year begin. ISO yyyy-mm-dd. */
  as_of: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  waterfall_ready: boolean;
  /** Normalized legal / DBA name key (ilNormName) and 5-digit ZIP, for overlay lookups. */
  name_key: string | null;
  dba_key: string | null;
  zip5: string | null;
}

export function zip5(raw: string | null | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 5 ? d.slice(0, 5) : null;
}

export function digits10(raw: string | null | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d.length === 10 ? d : null;
}

export function intOrNull(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function isoDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{2})-([A-Z]{3})-(\d{2,4})$/i);
  if (m) {
    const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(m[2].toUpperCase());
    if (mon >= 0) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${String(mon + 1).padStart(2, '0')}-${m[1]}`;
    }
  }
  return null;
}

export const blank = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
};
