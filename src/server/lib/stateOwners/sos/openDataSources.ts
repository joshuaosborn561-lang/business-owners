/**
 * Free owner-name sources queried live (no bulk load, no HTTP to any bot-walled
 * registry). Each source is a small adapter over a public API:
 *
 *  pa_dos      data.pa.gov xvd7-5r2c      one row per business x officer (party_type + first/last)
 *  co_trade    data.colorado.gov u7sb-g482 trade-name registrant first/last (sole props)
 *  or_ccb      data.oregon.gov g77e-6bhs   CCB licensed contractors, rmi_name = responsible individual
 *  ny_dmv      data.ny.gov nhjr-rpi2       repair shops / dealers / inspection stations, owner_name
 *  nyc_dob     data.cityofnewyork.us t8hj-ruu2  NYC DOB licensees first/last + business
 *  wa_lni      data.wa.gov m8qx-ubtq       L&I contractors, primaryprincipalname
 *  mo_liquor   data.mo.gov yyhn-562y       alcohol licenses, associated OWN / PART / MGR persons
 *  chicago     data.cityofchicago.org r5kz-chrr + ezma-pppn  licensed businesses joined to owners
 *  il_idfpr    data.illinois.gov pzzh-kp68 professional licenses with business_name / businessdba
 *  tx_tabc     data.texas.gov 7hf9-qc9f    TABC trade_name -> owner (person or legal entity name)
 *  dc_bbl      DCGIS FEEDS/DCRA layer 0    Basic Business License, BUSINESSOWNERFIRST/LASTNAME
 *  fmcsa       data.transportation.gov az4n-8mr2  USDOT census, company_officer_1/2 + email + cell
 *  nppes       npiregistry.cms.hhs.gov     Type-2 organizations, authorized official + title
 *  ca_la_fbn   LA County FBN ArcGIS        fictitious business names, RegisteredOwnerName (one row per owner)
 *  ca_sf_reg   data.sf.gov g8m3-pdis       SF registered business locations, ownership_name
 *  ca_abc      abc.ca.gov DailyExport-CSV  statewide alcohol licenses, Primary Name (person for sole props) + DBA
 *  tx_tdlr     data.texas.gov 7358-krk7    TDLR licenses, owner_name per business (A/C, electricians, etc.)
 *  ak_bl       AK DCCED ArcGIS layer 2     statewide business licenses, Owners
 *  phl_bl      phl.carto.com business_licenses  Philadelphia licenses, legal first/last for individuals
 *  cms_owners  data.cms.gov All Owners + Enrollments  HHA / hospice / SNF / RHC / hospital owners with ownership %, PE + REIT flags
 *  form5500    client_pe.bo_universe (DOL Form 5500 bulk, loaded by scripts/build_universe.ts)  plan signer by EIN / name+ZIP / phone
 *
 * CA added 2026-11-05: CA SOS sells/publishes no bulk entity file, so the free
 * owner files are county FBN (LA), SF registry and the ABC export. CSLB personnel
 * is free but WAF-blocked from datacenter IPs (see research/2026-10-25).
 *
 * All verified live on 2026-10-25 (see research/2026-10-25). Column names are
 * the dataset field names. Every source returns waterfall-shaped hits through
 * hitsFromRoster so confidence scoring is shared with the SOS adapters.
 */
import { normalizeState, validateOfficerPersonName } from '../names.js';
import type { LookupContext } from './context.js';
import { ctxFetch } from './context.js';
import { ilNormName } from './ilLlc.js';
import { hitsFromRoster, type RosterEntry } from './officers.js';
import { firstZipEntry } from './zipEntry.js';
import { CMS_TYPES, cmsDatasetIds, cmsQueryUrl, summarizeCmsOwners, type CmsType } from '../../universe/cms.js';
import { F5500_TITLE } from '../../universe/form5500.js';
import { UniverseStore } from '../../universe/store.js';
import { zip5 as zip5Of } from '../../universe/types.js';
import type { NameLookupInput, NameLookupResult } from './types.js';

export type OpenDataSourceId =
  | 'pa_dos'
  | 'co_trade'
  | 'or_ccb'
  | 'ny_dmv'
  | 'nyc_dob'
  | 'wa_lni'
  | 'mo_liquor'
  | 'chicago'
  | 'il_idfpr'
  | 'tx_tabc'
  | 'dc_bbl'
  | 'fmcsa'
  | 'nppes'
  | 'ca_la_fbn'
  | 'ca_sf_reg'
  | 'ca_abc'
  | 'tx_tdlr'
  | 'ak_bl'
  | 'phl_bl'
  | 'cms_owners'
  | 'form5500';

export interface OpenDataOutcome {
  result: NameLookupResult | null;
  /** Legal entity name learned from a file whose owner field is an entity (TABC, DMV). */
  legal_name: string | null;
  sources_tried: OpenDataSourceId[];
}

const OPEN_DATA_TIMEOUT_MS = 20_000;
const STOP_WORDS = /^(LLC|INC|THE|AND|CORP|COMPANY|CO|LTD|SERVICES?|GROUP|OF|DBA|PLLC|PC|LP|LLP)$/;

/** Significant uppercase tokens for a `like` query. Two tokens keeps SODA fast and still selective. */
export function queryTokens(company: string, max = 2): string[] {
  return String(company || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.test(t))
    .slice(0, max);
}

export function sodaLike(cols: string[], tokens: string[]): string | null {
  if (!tokens.length || !cols.length) return null;
  const esc = (t: string) => t.replace(/'/g, "''");
  const perCol = cols.map((c) => tokens.map((t) => `upper(${c}) like '%${esc(t)}%'`).join(' AND '));
  return perCol.length === 1 ? perCol[0] : perCol.map((x) => `(${x})`).join(' OR ');
}

/** Exact normalized key, or the registry name is a leading part of the Maps trade name (>= 6 chars), or vice versa. */
export function looseNameMatch(candidate: string, company: string): 'exact' | 'substring' | null {
  const k = ilNormName(candidate);
  const full = ilNormName(company);
  const head = ilNormName(String(company).split(/\s[-–|:]\s|\s\(|\|/)[0]);
  if (!k || k.length < 3) return null;
  if (k === full || k === head) return 'exact';
  if (k.length >= 6 && (head.startsWith(k) || full.startsWith(k))) return 'substring';
  if (head.length >= 6 && k.startsWith(head)) return 'substring';
  return null;
}

export function phoneDigits(raw: string | null | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d.length === 10 ? d : null;
}

function cityEq(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || '').toUpperCase().replace(/[^A-Z]/g, '');
  const y = String(b || '').toUpperCase().replace(/[^A-Z]/g, '');
  return Boolean(x && y && x === y);
}

async function getJson(ctx: LookupContext | undefined, url: string): Promise<unknown> {
  try {
    const res = await ctxFetch(ctx)(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(OPEN_DATA_TIMEOUT_MS),
    } as RequestInit);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function soda(ctx: LookupContext | undefined, url: string): Promise<Array<Record<string, string>>> {
  const j = await getJson(ctx, url);
  return Array.isArray(j) ? (j as Array<Record<string, string>>) : [];
}

const personName = (first?: string | null, last?: string | null, middle?: string | null) =>
  [first, middle, last].map((x) => String(x || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');

/** "LAST, FIRST" -> "FIRST LAST"; otherwise unchanged. */
export function lastFirstToFirstLast(raw: string): string {
  const n = String(raw || '').replace(/\s+/g, ' ').trim();
  const m = n.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : n;
}

function isPerson(name: string, city?: string | null): boolean {
  const n = String(name || '').trim();
  if (!n || n.split(/\s+/).length < 2) return false;
  if (/\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|CO\.|LTD|LP|LLP|PLLC|P\.?C\.?|TRUST|ASSOC|ASSOCIATION|SERVICES?|ENTERPRISES?|HOLDINGS?|GROUP|PARTNERS|BANK|CHURCH|MINISTR)\b/i.test(n)) {
    return false;
  }
  // Fixed-width files split long names across two fields; a glued suffix ("PETROLEUMCORP") is still an entity.
  if (/[A-Z]{3,}(CORP|CORPORATION|INC|LLC|LTD|COMPANY|ENTERPRISES?|HOLDINGS?|SERVICES?)\b/i.test(n)) return false;
  if (/\b(PETROLEUM|GAS|OIL|MOTORS?|AUTO(MOTIVE)?|COLLISION|TIRES?|TOWING|REPAIRS?|SALES|LEASING|RENTALS?|TRANSPORT(ATION)?|TRUCKING|LOGISTICS)\b/i.test(n)) return false;
  return validateOfficerPersonName(n, city ? [city] : undefined).ok;
}

function made(
  input: NameLookupInput,
  roster: RosterEntry[],
  url: string,
  method: 'exact' | 'substring',
  cityMatch: boolean,
  source: OpenDataSourceId,
  extra?: Partial<NameLookupResult>,
): NameLookupResult | null {
  const people = hitsFromRoster(input, roster.slice(0, 4), 'open_data', url, method, { cityMatch });
  if (!people.length) return null;
  return {
    people,
    coverage_reason: null,
    source: 'open_data',
    source_url: url,
    match_method: method,
    implemented: true,
    open_data_source: source,
    ...extra,
  };
}

/** Prefer a city match; otherwise accept a lone exact-name candidate. */
export function pickCandidate<T>(
  rows: T[],
  input: NameLookupInput,
  nameOf: (r: T) => string,
  cityOf: (r: T) => string | null | undefined,
): { row: T; method: 'exact' | 'substring'; cityMatch: boolean } | null {
  const scored = rows
    .map((row) => ({ row, method: looseNameMatch(nameOf(row), input.company_name) }))
    .filter((x): x is { row: T; method: 'exact' | 'substring' } => x.method !== null);
  if (!scored.length) return null;
  const inCity = scored.filter((x) => cityEq(cityOf(x.row), input.city));
  const exactInCity = inCity.find((x) => x.method === 'exact');
  if (exactInCity) return { ...exactInCity, cityMatch: true };
  if (inCity.length === 1) return { ...inCity[0], cityMatch: true };
  if (inCity.length > 1) return { ...inCity[0], cityMatch: true };
  const exact = scored.filter((x) => x.method === 'exact');
  // No city match: only a unique exact name is safe (common trade names repeat across a state).
  if (exact.length === 1 && !input.city) return { ...exact[0], cityMatch: false };
  if (exact.length === 1) {
    const distinct = new Set(exact.map((x) => ilNormName(nameOf(x.row))));
    if (distinct.size === 1 && scored.length === 1) return { ...exact[0], cityMatch: false };
  }
  return null;
}

const OWNER_TITLE_ORDER = [
  /\bowner\b/i,
  /sole\s+member|managing\s+member/i,
  /\bmember\b/i,
  /\bmanager\b/i,
  /\bpresident\b/i,
  /chief\s+executive|\bceo\b/i,
  /\bprincipal\b/i,
  /\bgovernor\b/i,
  /\bpartner\b/i,
  /\bdirector\b/i,
  /\btreasurer\b/i,
  /\bsecretary\b/i,
  /vice\s+president|\bvp\b/i,
  /organizer|incorporator/i,
];

export function titleRank(title: string): number {
  const i = OWNER_TITLE_ORDER.findIndex((re) => re.test(title || ''));
  return i === -1 ? OWNER_TITLE_ORDER.length : i;
}

function roleFor(title: string): RosterEntry['role'] {
  if (/owner|sole\s+member|managing\s+member|proprietor/i.test(title)) return 'owner';
  if (/\bmember\b|\bmanager\b/i.test(title)) return 'member';
  if (/qualif|responsible|principal|license/i.test(title)) return 'qualifying_individual';
  return 'officer';
}

// ---------------------------------------------------------------------------
// Pennsylvania: data.pa.gov xvd7-5r2c
// ---------------------------------------------------------------------------
export const PA_DOS_URL = 'https://data.pa.gov/resource/xvd7-5r2c.json';

export async function resolvePaOpenData(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const w = sodaLike(['business_name'], queryTokens(input.company_name));
  if (!w) return null;
  const url = `${PA_DOS_URL}?$where=${encodeURIComponent(w)}&$limit=400`;
  const rows = await soda(ctx, url);
  const groups = new Map<string, { name: string; city: string; parties: Array<{ title: string; name: string }> }>();
  for (const r of rows) {
    const key = r.filing_number || r.business_name;
    const g = groups.get(key) || { name: r.business_name || '', city: r.city || '', parties: [] };
    const name = personName(r.first_name, r.last_name, r.middle_name);
    if (name && r.last_name) g.parties.push({ title: r.party_type || 'Governor', name });
    groups.set(key, g);
  }
  const pick = pickCandidate([...groups.values()], input, (g) => g.name, (g) => g.city);
  if (!pick) return null;
  const roster: RosterEntry[] = pick.row.parties
    .filter((p) => isPerson(p.name, input.city))
    .sort((a, b) => titleRank(a.title) - titleRank(b.title))
    .map((p) => ({ name: p.name, title: p.title || 'Governor', role: roleFor(p.title), labeled: true }));
  return made(input, roster, url, pick.method, pick.cityMatch, 'pa_dos', { business_name: pick.row.name });
}

// ---------------------------------------------------------------------------
// Colorado trade names: u7sb-g482
// ---------------------------------------------------------------------------
export const CO_TRADE_URL = 'https://data.colorado.gov/resource/u7sb-g482.json';

export async function resolveCoTradeNames(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const w = sodaLike(['tradenamedescription'], queryTokens(input.company_name));
  if (!w) return null;
  const url = `${CO_TRADE_URL}?$where=${encodeURIComponent(w)}&$limit=200`;
  const rows = (await soda(ctx, url)).filter((r) => r.lastname && !/^(withdrawn|expired|delinquent)/i.test(r.entitystatus || ''));
  const pick = pickCandidate(rows, input, (r) => r.tradenamedescription || '', (r) => r.city);
  if (!pick) return null;
  const name = personName(pick.row.firstname, pick.row.lastname, pick.row.middlename);
  if (!isPerson(name, input.city)) return null;
  return made(input, [{ name, title: 'Owner', role: 'owner', labeled: true }], url, pick.method, pick.cityMatch, 'co_trade', {
    business_name: pick.row.tradenamedescription,
  });
}

// ---------------------------------------------------------------------------
// Oregon CCB: g77e-6bhs (rmi_name)
// ---------------------------------------------------------------------------
export const OR_CCB_URL = 'https://data.oregon.gov/resource/g77e-6bhs.json';

export async function resolveOrCcb(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const phone = phoneDigits(input.phone);
  const w = sodaLike(['full_name'], queryTokens(input.company_name));
  const where = phone && w ? `(${w}) OR phone_number='${phone}'` : w;
  if (!where) return null;
  const url = `${OR_CCB_URL}?$where=${encodeURIComponent(where)}&$limit=100`;
  const rows = (await soda(ctx, url)).filter((r) => r.rmi_name);
  const byPhone = phone ? rows.find((r) => phoneDigits(r.phone_number) === phone) : null;
  const pick = byPhone
    ? { row: byPhone, method: 'exact' as const, cityMatch: true }
    : pickCandidate(rows, input, (r) => r.full_name || '', (r) => r.city);
  if (!pick) return null;
  const name = lastFirstToFirstLast(pick.row.rmi_name);
  if (!isPerson(name, input.city)) return null;
  return made(
    input,
    [{ name, title: 'Responsible Managing Individual', role: 'qualifying_individual', labeled: true }],
    url,
    pick.method,
    pick.cityMatch,
    'or_ccb',
    { business_name: pick.row.full_name },
  );
}

// ---------------------------------------------------------------------------
// New York DMV facilities: nhjr-rpi2 (owner_name)
// ---------------------------------------------------------------------------
export const NY_DMV_URL = 'https://data.ny.gov/resource/nhjr-rpi2.json';

export async function resolveNyDmv(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  const w = sodaLike(['facility_name'], queryTokens(input.company_name));
  if (!w) return { result: null, legal_name: null };
  const url = `${NY_DMV_URL}?$where=${encodeURIComponent(w)}&$limit=100`;
  const rows = (await soda(ctx, url)).filter((r) => r.owner_name);
  const pick = pickCandidate(rows, input, (r) => `${r.facility_name || ''}${r.facility_name_overflow || ''}`, (r) => r.facility_city);
  if (!pick) return { result: null, legal_name: null };
  const ownerHead = String(pick.row.owner_name || '');
  const ownerTail = String(pick.row.owner_name_overflow || '');
  const owner = (ownerTail ? `${ownerHead}${ownerHead.length >= 25 ? '' : ' '}${ownerTail}` : ownerHead).replace(/\s+/g, ' ').trim();
  if (isPerson(lastFirstToFirstLast(owner), input.city)) {
    const result = made(input, [{ name: lastFirstToFirstLast(owner), title: 'Owner', role: 'owner', labeled: true }], url, pick.method, pick.cityMatch, 'ny_dmv');
    return { result, legal_name: null };
  }
  return { result: null, legal_name: owner || null };
}

// ---------------------------------------------------------------------------
// NYC DOB licenses: t8hj-ruu2
// ---------------------------------------------------------------------------
export const NYC_DOB_URL = 'https://data.cityofnewyork.us/resource/t8hj-ruu2.json';

export async function resolveNycDob(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const w = sodaLike(['business_name'], queryTokens(input.company_name));
  if (!w) return null;
  const url = `${NYC_DOB_URL}?$where=${encodeURIComponent(w)}&$limit=100`;
  const rows = (await soda(ctx, url)).filter((r) => r.last_name && r.first_name && !/inactive|expired|revoked/i.test(r.license_status || ''));
  const pick = pickCandidate(rows, input, (r) => r.business_name || '', (r) => r.license_business_city);
  if (!pick) return null;
  const name = personName(pick.row.first_name, pick.row.last_name);
  if (!isPerson(name, input.city)) return null;
  const result = made(
    input,
    [{ name, title: pick.row.license_type || 'Licensee', role: 'qualifying_individual', labeled: true }],
    url,
    pick.method,
    pick.cityMatch,
    'nyc_dob',
    { business_name: pick.row.business_name },
  );
  if (result && (pick.row.business_email || pick.row.business_phone_number)) {
    result.people[0].email = pick.row.business_email || null;
    result.people[0].phone = pick.row.business_phone_number || null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Washington L&I contractors: m8qx-ubtq (primaryprincipalname)
// ---------------------------------------------------------------------------
export const WA_LNI_URL = 'https://data.wa.gov/resource/m8qx-ubtq.json';

export async function resolveWaLni(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const phone = phoneDigits(input.phone);
  const w = sodaLike(['businessname'], queryTokens(input.company_name));
  const where = phone && w ? `(${w}) OR phonenumber='${phone}'` : w;
  if (!where) return null;
  const url = `${WA_LNI_URL}?$where=${encodeURIComponent(where)}&$limit=100`;
  const rows = (await soda(ctx, url)).filter((r) => r.primaryprincipalname);
  const byPhone = phone ? rows.find((r) => phoneDigits(r.phonenumber) === phone) : null;
  const pick = byPhone
    ? { row: byPhone, method: 'exact' as const, cityMatch: true }
    : pickCandidate(rows, input, (r) => r.businessname || '', (r) => r.city);
  if (!pick) return null;
  const name = lastFirstToFirstLast(pick.row.primaryprincipalname);
  if (!isPerson(name, input.city)) return null;
  return made(input, [{ name, title: 'Primary Principal', role: 'owner', labeled: true }], url, pick.method, pick.cityMatch, 'wa_lni', {
    business_name: pick.row.businessname,
  });
}

// ---------------------------------------------------------------------------
// Missouri alcohol licenses: yyhn-562y (assoc OWN / PART / MGR)
// ---------------------------------------------------------------------------
export const MO_LIQUOR_URL = 'https://data.mo.gov/resource/yyhn-562y.json';
const MO_ASSOC_RANK: Record<string, number> = { OWN: 0, PART: 1, MGR: 2 };

export async function resolveMoLiquor(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const toks = queryTokens(input.company_name);
  const w = sodaLike(['dbaname', 'licensee'], toks);
  if (!w) return null;
  const url = `${MO_LIQUOR_URL}?$where=${encodeURIComponent(w)}&$limit=200`;
  const rows = (await soda(ctx, url)).filter((r) => r.name && r.assoc && r.assoc in MO_ASSOC_RANK);
  const pick = pickCandidate(rows, input, (r) => r.dbaname || r.licensee || '', (r) => r.city);
  if (!pick) return null;
  const key = ilNormName(pick.row.dbaname || pick.row.licensee || '');
  const roster: RosterEntry[] = rows
    .filter((r) => ilNormName(r.dbaname || r.licensee || '') === key && cityEq(r.city, pick.row.city))
    .sort((a, b) => MO_ASSOC_RANK[a.assoc] - MO_ASSOC_RANK[b.assoc])
    .map((r) => ({
      name: lastFirstToFirstLast(r.name),
      title: r.assoc === 'OWN' ? 'Owner' : r.assoc === 'PART' ? 'Partner' : 'Managing Officer',
      role: r.assoc === 'MGR' ? ('officer' as const) : ('owner' as const),
      labeled: true,
    }))
    .filter((e) => isPerson(e.name, input.city));
  return made(input, roster, url, pick.method, pick.cityMatch, 'mo_liquor', { business_name: pick.row.licensee || pick.row.dbaname });
}

// ---------------------------------------------------------------------------
// Chicago business licenses + owners: r5kz-chrr -> ezma-pppn
// ---------------------------------------------------------------------------
export const CHI_LICENSES_URL = 'https://data.cityofchicago.org/resource/r5kz-chrr.json';
export const CHI_OWNERS_URL = 'https://data.cityofchicago.org/resource/ezma-pppn.json';

export async function resolveChicago(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  if (!cityEq(input.city, 'Chicago')) return null;
  const w = sodaLike(['doing_business_as_name', 'legal_name'], queryTokens(input.company_name));
  if (!w) return null;
  const url = `${CHI_LICENSES_URL}?$where=${encodeURIComponent(`(${w}) AND license_status='AAI'`)}&$limit=100`;
  const rows = await soda(ctx, url);
  const pick = pickCandidate(rows, input, (r) => r.doing_business_as_name || r.legal_name || '', () => 'Chicago');
  if (!pick) return null;
  const account = pick.row.account_number;
  if (!account) return null;
  const ownersUrl = `${CHI_OWNERS_URL}?account_number=${encodeURIComponent(account)}&$limit=20`;
  const owners = await soda(ctx, ownersUrl);
  const roster: RosterEntry[] = owners
    .map((o) => ({
      name: personName(o.owner_first_name, o.owner_last_name, o.owner_middle_initial),
      title: o.owner_title || 'Owner',
      role: roleFor(o.owner_title || 'Owner'),
      labeled: true,
    }))
    .filter((e) => isPerson(e.name, input.city))
    .sort((a, b) => titleRank(a.title) - titleRank(b.title));
  return made(input, roster, ownersUrl, pick.method, true, 'chicago', { business_name: pick.row.legal_name || pick.row.doing_business_as_name });
}

// ---------------------------------------------------------------------------
// Illinois IDFPR: pzzh-kp68 (business_name / businessdba on individual licenses)
// ---------------------------------------------------------------------------
export const IL_IDFPR_URL = 'https://data.illinois.gov/resource/pzzh-kp68.json';

export async function resolveIlIdfpr(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const w = sodaLike(['business_name', 'businessdba'], queryTokens(input.company_name));
  if (!w) return null;
  const url = `${IL_IDFPR_URL}?$where=${encodeURIComponent(`(${w}) AND license_status='ACTIVE'`)}&$limit=100`;
  const rows = (await soda(ctx, url)).filter((r) => r.last_name && r.first_name);
  const pick = pickCandidate(rows, input, (r) => r.businessdba || r.business_name || '', (r) => r.city);
  if (!pick) return null;
  const name = personName(pick.row.first_name, pick.row.last_name);
  if (!isPerson(name, input.city)) return null;
  return made(
    input,
    [{ name, title: pick.row.description || 'Licensee', role: 'qualifying_individual', labeled: true }],
    url,
    pick.method,
    pick.cityMatch,
    'il_idfpr',
    { business_name: pick.row.business_name || pick.row.businessdba },
  );
}

// ---------------------------------------------------------------------------
// Texas TABC: 7hf9-qc9f (trade_name -> owner)
// ---------------------------------------------------------------------------
export const TX_TABC_URL = 'https://data.texas.gov/resource/7hf9-qc9f.json';

export async function resolveTxTabc(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  const phone = phoneDigits(input.phone);
  const w = sodaLike(['trade_name'], queryTokens(input.company_name));
  const where = phone && w ? `(${w}) OR phone='${phone}'` : w;
  if (!where) return { result: null, legal_name: null };
  const url = `${TX_TABC_URL}?$where=${encodeURIComponent(where)}&$limit=100`;
  const rows = (await soda(ctx, url)).filter((r) => r.owner && !/cancel|expired|suspend/i.test(r.license_status || ''));
  const byPhone = phone ? rows.find((r) => phoneDigits(r.phone) === phone) : null;
  const pick = byPhone
    ? { row: byPhone, method: 'exact' as const, cityMatch: true }
    : pickCandidate(rows, input, (r) => r.trade_name || '', (r) => r.city);
  if (!pick) return { result: null, legal_name: null };
  const owner = lastFirstToFirstLast(pick.row.owner);
  if (isPerson(owner, input.city)) {
    return { result: made(input, [{ name: owner, title: 'Licensee', role: 'owner', labeled: true }], url, pick.method, pick.cityMatch, 'tx_tabc'), legal_name: null };
  }
  return { result: null, legal_name: pick.row.owner || null };
}

// ---------------------------------------------------------------------------
// DC Basic Business License: ArcGIS FeatureServer
// ---------------------------------------------------------------------------
export const DC_BBL_URL = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0/query';

export async function resolveDcBbl(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const toks = queryTokens(input.company_name);
  if (!toks.length) return null;
  const esc = (t: string) => t.replace(/'/g, "''");
  const clause = (col: string) => toks.map((t) => `UPPER(${col}) LIKE '%${esc(t)}%'`).join(' AND ');
  const where = `(${clause('ENTITYNAME')}) OR (${clause('ENTITYTRADENAME')})`;
  const params = new URLSearchParams({
    where,
    outFields: 'ENTITYNAME,ENTITYTRADENAME,BUSINESSOWNERFIRSTNAME,BUSINESSOWNERMIDDLENAME,BUSINESSOWNERLASTNAME,LICENSESTATUS,PREMISEADDRESS,BUSINESSACTIVITY',
    resultRecordCount: '100',
    f: 'json',
  });
  const url = `${DC_BBL_URL}?${params.toString()}`;
  const j = (await getJson(ctx, url)) as { features?: Array<{ attributes: Record<string, string | null> }> } | null;
  const rows = (j?.features || []).map((f) => f.attributes).filter((a) => a.BUSINESSOWNERLASTNAME);
  const active = rows.filter((a) => /^active/i.test(a.LICENSESTATUS || ''));
  const pool = active.length ? active : rows;
  const pick = pickCandidate(pool, input, (a) => a.ENTITYTRADENAME || a.ENTITYNAME || '', () => 'Washington');
  const alt = pick ? null : pickCandidate(pool, input, (a) => a.ENTITYNAME || '', () => 'Washington');
  const chosen = pick || alt;
  if (!chosen) return null;
  const name = personName(chosen.row.BUSINESSOWNERFIRSTNAME, chosen.row.BUSINESSOWNERLASTNAME, chosen.row.BUSINESSOWNERMIDDLENAME);
  if (!isPerson(name, input.city)) return null;
  return made(input, [{ name, title: 'Business Owner', role: 'owner', labeled: true }], url, chosen.method, true, 'dc_bbl', {
    business_name: chosen.row.ENTITYNAME || chosen.row.ENTITYTRADENAME,
  });
}

// ---------------------------------------------------------------------------
// FMCSA Company Census: az4n-8mr2 (company_officer_1/2, email, cell)
// ---------------------------------------------------------------------------
export const FMCSA_URL = 'https://data.transportation.gov/resource/az4n-8mr2.json';

export async function resolveFmcsa(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const st = normalizeState(input.state);
  const phone = phoneDigits(input.phone);
  const nameWhere = sodaLike(['legal_name', 'dba_name'], queryTokens(input.company_name));
  const parts: string[] = [];
  if (phone) parts.push(`phone='${phone}' OR cell_phone='${phone}'`);
  if (nameWhere && st) parts.push(`((${nameWhere}) AND phy_state='${st}')`);
  if (!parts.length) return null;
  const url = `${FMCSA_URL}?$where=${encodeURIComponent(parts.join(' OR '))}&$limit=50`;
  const rows = (await soda(ctx, url)).filter((r) => r.company_officer_1);
  const byPhone = phone ? rows.find((r) => phoneDigits(r.phone) === phone || phoneDigits(r.cell_phone) === phone) : null;
  const pick = byPhone
    ? { row: byPhone, method: 'exact' as const, cityMatch: true }
    : pickCandidate(
        rows.filter((r) => /^A/i.test(r.status_code || 'A')),
        input,
        (r) => r.dba_name || r.legal_name || '',
        (r) => r.phy_city,
      ) || pickCandidate(rows, input, (r) => r.legal_name || '', (r) => r.phy_city);
  if (!pick) return null;
  const roster: RosterEntry[] = [pick.row.company_officer_1, pick.row.company_officer_2]
    .filter(Boolean)
    .map((n) => ({ name: String(n).replace(/\s+/g, ' ').trim(), title: 'Company Officer', role: 'owner' as const, labeled: true }))
    .filter((e) => isPerson(e.name, input.city));
  const result = made(input, roster, url, pick.method, pick.cityMatch, 'fmcsa', {
    business_name: pick.row.legal_name,
    dba_name: pick.row.dba_name || null,
  });
  if (result) {
    result.people[0].email = pick.row.email_address || null;
    result.people[0].phone = pick.row.cell_phone || pick.row.phone || null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// NPPES NPI registry: Type-2 organizations, authorized official
// ---------------------------------------------------------------------------
export const NPPES_URL = 'https://npiregistry.cms.hhs.gov/api/';
const OWNER_LIKE_OFFICIAL = /owner|president|ceo|chief|principal|founder|partner|member|director|dds|dmd|d\.d\.s|d\.m\.d|\bdc\b|\bmd\b|\bdo\b|\bod\b|dpm|dvm|dentist|doctor|\bdr\b/i;

interface NppesRecord {
  basic?: { organization_name?: string; authorized_official_first_name?: string; authorized_official_last_name?: string; authorized_official_middle_name?: string; authorized_official_title_or_position?: string; authorized_official_telephone_number?: string; status?: string };
  other_names?: Array<{ organization_name?: string }>;
  addresses?: Array<{ address_purpose?: string; city?: string; telephone_number?: string }>;
}

export async function resolveNppes(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const st = normalizeState(input.state);
  const core = String(input.company_name)
    .split(/\s[-–|:]\s|\s\(|\|/)[0]
    .replace(/[^A-Za-z0-9 &']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (core.length < 3 || !st) return null;
  const params = new URLSearchParams({ version: '2.1', enumeration_type: 'NPI-2', organization_name: `${core}*`, state: st, limit: '50' });
  const url = `${NPPES_URL}?${params.toString()}`;
  const j = (await getJson(ctx, url)) as { results?: NppesRecord[] } | null;
  const recs = (j?.results || []).filter((r) => r.basic?.authorized_official_last_name && (r.basic?.status || 'A') === 'A');
  const phone = phoneDigits(input.phone);
  const nameOf = (r: NppesRecord) => r.basic?.organization_name || '';
  const cityOf = (r: NppesRecord) => (r.addresses || []).find((a) => a.address_purpose === 'LOCATION')?.city || null;
  const byPhone = phone
    ? recs.find((r) => (r.addresses || []).some((a) => phoneDigits(a.telephone_number) === phone) || phoneDigits(r.basic?.authorized_official_telephone_number) === phone)
    : null;
  const pick = byPhone
    ? { row: byPhone, method: 'exact' as const, cityMatch: true }
    : pickCandidate(recs, input, nameOf, cityOf) ||
      pickCandidate(
        recs.filter((r) => (r.other_names || []).some((o) => looseNameMatch(o.organization_name || '', input.company_name))),
        input,
        (r) => (r.other_names || []).find((o) => looseNameMatch(o.organization_name || '', input.company_name))?.organization_name || '',
        cityOf,
      );
  if (!pick) return null;
  const b = pick.row.basic!;
  const name = personName(b.authorized_official_first_name, b.authorized_official_last_name, b.authorized_official_middle_name);
  if (!isPerson(name, input.city)) return null;
  const title = b.authorized_official_title_or_position || 'Authorized Official';
  const roster: RosterEntry[] = [{ name, title, role: OWNER_LIKE_OFFICIAL.test(title) ? 'owner' : 'officer', labeled: true }];
  const result = made(input, roster, url, pick.method, pick.cityMatch, 'nppes', { business_name: b.organization_name || null });
  if (result && b.authorized_official_telephone_number) result.people[0].phone = b.authorized_official_telephone_number;
  // An office manager or billing contact is a real contact but not an owner; keep it below waterfall-ready unless the title says owner.
  if (result && !OWNER_LIKE_OFFICIAL.test(title)) result.people = result.people.map((p) => ({ ...p, review_flag: true }));
  return result;
}

// ---------------------------------------------------------------------------
// ArcGIS helper (LA County FBN, Alaska business licenses)
// ---------------------------------------------------------------------------
function arcgisLike(cols: string[], tokens: string[]): string | null {
  if (!tokens.length || !cols.length) return null;
  const esc = (t: string) => t.replace(/'/g, "''");
  const perCol = cols.map((c) => tokens.map((t) => `UPPER(${c}) LIKE '%${esc(t)}%'`).join(' AND '));
  return perCol.length === 1 ? perCol[0] : perCol.map((x) => `(${x})`).join(' OR ');
}

async function arcgisRows(ctx: LookupContext | undefined, base: string, where: string, outFields: string, limit = 200): Promise<{ url: string; rows: Array<Record<string, string | number | null>> }> {
  const params = new URLSearchParams({ where, outFields, resultRecordCount: String(limit), f: 'json' });
  const url = `${base}?${params.toString()}`;
  const j = (await getJson(ctx, url)) as { features?: Array<{ attributes: Record<string, string | number | null> }> } | null;
  return { url, rows: (j?.features || []).map((f) => f.attributes) };
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// California: LA County fictitious business names (RegisteredOwnerName)
// ---------------------------------------------------------------------------
export const CA_LA_FBN_URL = 'https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Fictitious_Business_Name/FeatureServer/0/query';

export async function resolveCaLaFbn(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  const where = arcgisLike(['BusinessName'], queryTokens(input.company_name));
  if (!where) return { result: null, legal_name: null };
  const { url, rows } = await arcgisRows(ctx, CA_LA_FBN_URL, where, 'FilingNumber,FiledTS,FilingType,BusinessType,BusinessName,BusinessCity,RegisteredOwnerName', 300);
  const live = rows.filter((r) => str(r.RegisteredOwnerName) && !/abandon|withdraw/i.test(str(r.FilingType)));
  // An abandonment names the owner who gave the name up; drop that owner's earlier statements for the same name.
  const gone = new Set(
    rows.filter((r) => /abandon|withdraw/i.test(str(r.FilingType))).map((r) => `${ilNormName(str(r.BusinessName))}|${str(r.RegisteredOwnerName).toUpperCase()}`),
  );
  const kept = live
    .filter((r) => !gone.has(`${ilNormName(str(r.BusinessName))}|${str(r.RegisteredOwnerName).toUpperCase()}`))
    .sort((a, b) => Number(b.FiledTS || 0) - Number(a.FiledTS || 0));
  const pick = pickCandidate(kept, input, (r) => str(r.BusinessName), (r) => str(r.BusinessCity));
  if (!pick) return { result: null, legal_name: null };
  const filing = str(pick.row.FilingNumber);
  const owners = kept.filter((r) => str(r.FilingNumber) === filing).map((r) => str(r.RegisteredOwnerName));
  const roster: RosterEntry[] = [...new Set(owners)]
    .filter((n) => isPerson(n, input.city))
    .map((n) => ({ name: n, title: 'Owner (fictitious business name)', role: 'owner' as const, labeled: true }));
  if (roster.length) {
    return {
      result: made(input, roster, url, pick.method, pick.cityMatch, 'ca_la_fbn', { business_name: str(pick.row.BusinessName), dba_source: 'fbn' }),
      legal_name: null,
    };
  }
  return { result: null, legal_name: owners[0] || null };
}

// ---------------------------------------------------------------------------
// California: San Francisco registered business locations (ownership_name)
// ---------------------------------------------------------------------------
export const CA_SF_REG_URL = 'https://data.sf.gov/resource/g8m3-pdis.json';

export async function resolveCaSfRegistry(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  const w = sodaLike(['dba_name', 'ownership_name'], queryTokens(input.company_name));
  if (!w) return { result: null, legal_name: null };
  const url = `${CA_SF_REG_URL}?$where=${encodeURIComponent(`(${w}) AND dba_end_date IS NULL`)}&$limit=200`;
  const rows = (await soda(ctx, url)).filter((r) => r.ownership_name);
  const pick =
    pickCandidate(rows, input, (r) => r.dba_name || '', (r) => r.city) || pickCandidate(rows, input, (r) => r.ownership_name || '', (r) => r.city);
  if (!pick) return { result: null, legal_name: null };
  const owner = str(pick.row.ownership_name);
  if (isPerson(owner, input.city)) {
    return {
      result: made(input, [{ name: owner, title: 'Owner', role: 'owner', labeled: true }], url, pick.method, pick.cityMatch, 'ca_sf_reg', {
        business_name: pick.row.dba_name || owner,
      }),
      legal_name: null,
    };
  }
  return { result: null, legal_name: owner || null };
}

// ---------------------------------------------------------------------------
// California ABC: statewide daily export (zip, ~7 MB, ~130k rows), cached per process
// ---------------------------------------------------------------------------
export const CA_ABC_URL = 'https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip';
const CA_ABC_TTL_MS = 24 * 3600_000;

export interface CaAbcRow { primary: string; dba: string; city: string; status: string; type: string }
let abcCache: { at: number; index: Map<string, CaAbcRow[]> } | null = null;
let abcLoading: Promise<Map<string, CaAbcRow[]> | null> | null = null;

export function resetCaAbcCache(): void {
  abcCache = null;
  abcLoading = null;
}

/** RFC 4180-ish line splitter (quoted fields, doubled quotes). The ABC export has no embedded newlines. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function indexCaAbc(csv: string): Map<string, CaAbcRow[]> {
  const index = new Map<string, CaAbcRow[]>();
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/);
  const hi = lines.findIndex((l) => /"?License Type"?\s*,/.test(l));
  if (hi < 0) return index;
  const head = splitCsvLine(lines[hi]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const [cP, cD, cC, cS, cT] = [col('primary name'), col('dba name'), col('prem city'), col('type status'), col('license type')];
  if (cP < 0 || cD < 0) return index;
  for (const line of lines.slice(hi + 1)) {
    if (!line) continue;
    const c = splitCsvLine(line);
    // Keep the raw spacing of Primary Name: the double space marks a person ("LAST  FIRST").
    const row: CaAbcRow = { primary: String(c[cP] || '').trim(), dba: str(c[cD]), city: str(c[cC]), status: str(c[cS]), type: str(c[cT]) };
    if (!row.primary || !/^(ACTIVE|PEND)/i.test(row.status)) continue;
    for (const k of new Set([ilNormName(row.dba), ilNormName(row.primary)])) {
      if (k.length < 3) continue;
      const list = index.get(k) || [];
      list.push(row);
      index.set(k, list);
    }
  }
  return index;
}

async function loadCaAbc(ctx?: LookupContext): Promise<Map<string, CaAbcRow[]> | null> {
  if (abcCache && Date.now() - abcCache.at < CA_ABC_TTL_MS) return abcCache.index;
  if (abcLoading) return abcLoading;
  abcLoading = (async () => {
    try {
      const res = await ctxFetch(ctx)(CA_ABC_URL, { signal: AbortSignal.timeout(90_000) } as RequestInit);
      if (!res.ok) return null;
      const csv = firstZipEntry(Buffer.from(await res.arrayBuffer()));
      if (!csv) return null;
      const index = indexCaAbc(csv.toString('latin1'));
      if (!index.size) return null;
      abcCache = { at: Date.now(), index };
      return index;
    } catch {
      return null;
    } finally {
      abcLoading = null;
    }
  })();
  return abcLoading;
}

/** ABC sole-prop licensees are "LAST  FIRST MIDDLE" (two spaces after the surname). */
export function abcPersonName(primary: string): string | null {
  const m = String(primary || '').match(/^([A-Z][A-Z'.-]*(?: [A-Z][A-Z'.-]*)?)\s{2,}([A-Z][A-Z'. -]*)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}`.replace(/\s+/g, ' ') : null;
}

export async function resolveCaAbc(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  const index = await loadCaAbc(ctx);
  if (!index) return { result: null, legal_name: null };
  const keys = [...new Set([ilNormName(input.company_name), ilNormName(String(input.company_name).split(/\s[-–|:]\s|\s\(|\|/)[0])])].filter((k) => k.length >= 3);
  const rows = [...new Set(keys.flatMap((k) => index.get(k) || []))];
  const pick =
    pickCandidate(rows, input, (r) => r.dba || r.primary, (r) => r.city) || pickCandidate(rows, input, (r) => r.primary, (r) => r.city);
  if (!pick) return { result: null, legal_name: null };
  const raw = String(pick.row.primary).replace(/[ \t]+$/, '');
  const person = abcPersonName(raw);
  if (person && isPerson(person, input.city)) {
    return {
      result: made(input, [{ name: person, title: 'Licensee (owner)', role: 'owner', labeled: true }], CA_ABC_URL, pick.method, pick.cityMatch, 'ca_abc', {
        business_name: pick.row.dba || pick.row.primary,
      }),
      legal_name: null,
    };
  }
  return { result: null, legal_name: str(pick.row.primary) || null };
}

// ---------------------------------------------------------------------------
// Texas TDLR licenses: 7358-krk7 (owner_name per business)
// ---------------------------------------------------------------------------
export const TX_TDLR_URL = 'https://data.texas.gov/resource/7358-krk7.json';

function tdlrCity(cityStateZip: string | undefined): string {
  return String(cityStateZip || '').replace(/\s+[A-Z]{2}\s+\d{5}(-\d{4})?\s*$/, '').trim();
}

function tdlrExpiredLongAgo(mmddccyy: string | undefined): boolean {
  const m = String(mmddccyy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const t = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return t < Date.now() - 180 * 86400_000;
}

export async function resolveTxTdlr(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const phone = phoneDigits(input.phone);
  const w = sodaLike(['business_name'], queryTokens(input.company_name));
  const where = phone && w ? `(${w}) OR business_telephone='${phone}'` : w;
  if (!where) return null;
  const url = `${TX_TDLR_URL}?$where=${encodeURIComponent(where)}&$limit=200`;
  const rows = (await soda(ctx, url)).filter((r) => r.owner_name && !tdlrExpiredLongAgo(r.license_expiration_date_mmddccyy));
  const byPhone = phone ? rows.find((r) => phoneDigits(r.business_telephone) === phone) : null;
  const pick = byPhone
    ? { row: byPhone, method: 'exact' as const, cityMatch: true }
    : pickCandidate(rows, input, (r) => r.business_name || '', (r) => tdlrCity(r.business_city_state_zip));
  if (!pick) return null;
  const name = lastFirstToFirstLast(pick.row.owner_name);
  if (!isPerson(name, input.city)) return null;
  return made(input, [{ name, title: 'Owner', role: 'owner', labeled: true }], url, pick.method, pick.cityMatch, 'tx_tdlr', {
    business_name: pick.row.business_name,
  });
}

// ---------------------------------------------------------------------------
// Alaska business licenses: DCCED ArcGIS (Owners)
// ---------------------------------------------------------------------------
export const AK_BL_URL = 'https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2/query';

export async function resolveAkBusinessLicense(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  // The DCCED firewall rejects a where clause containing AND, so query on the most distinctive word and match locally.
  const longest = [...queryTokens(input.company_name, 4)].sort((a, b) => b.length - a.length).slice(0, 1);
  const where = arcgisLike(['BusinessName'], longest);
  if (!where) return { result: null, legal_name: null };
  const { url, rows } = await arcgisRows(ctx, AK_BL_URL, where, 'Owners,BusinessName,Status,PhysicalCity', 1000);
  const withOwner = rows.filter((r) => str(r.Owners));
  const active = withOwner.filter((r) => /^active/i.test(str(r.Status)));
  const pick = pickCandidate(active.length ? active : withOwner, input, (r) => str(r.BusinessName), (r) => str(r.PhysicalCity));
  if (!pick) return { result: null, legal_name: null };
  const owners = str(pick.row.Owners);
  const roster: RosterEntry[] = owners
    .split(/\s*;\s*|\s+&\s+|\s+AND\s+/i)
    .map((n) => n.trim())
    .filter((n) => isPerson(n, input.city))
    .map((n) => ({ name: n, title: 'Owner (business license)', role: 'owner' as const, labeled: true }));
  if (roster.length) {
    return { result: made(input, roster, url, pick.method, pick.cityMatch, 'ak_bl', { business_name: str(pick.row.BusinessName) }), legal_name: null };
  }
  return { result: null, legal_name: owners || null };
}

// ---------------------------------------------------------------------------
// Philadelphia business licenses (Carto SQL): legal first/last for individuals
// ---------------------------------------------------------------------------
export const PHL_BL_URL = 'https://phl.carto.com/api/v2/sql';

/** "BRUCE TINNENY (TINNERY PLUMBING & HEATING INC)" -> the trade name inside the parentheses, else the whole name. */
function phlTradeName(businessName: string): string {
  const m = String(businessName || '').match(/\(([^)]+)\)\s*$/);
  return m && !/^rental$/i.test(m[1].trim()) ? m[1] : String(businessName || '');
}

export async function resolvePhiladelphia(input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  if (!cityEq(input.city, 'Philadelphia')) return { result: null, legal_name: null };
  const toks = queryTokens(input.company_name);
  if (!toks.length) return { result: null, legal_name: null };
  const like = (col: string) => toks.map((t) => `upper(${col}) like '%${t.replace(/'/g, "''")}%'`).join(' AND ');
  const q =
    `select business_name, legalname, legalentitytype, legalfirstname, legallastname, licensetype from business_licenses ` +
    `where licensestatus = 'Active' and licensetype <> 'Rental' and ((${like('business_name')}) or (${like('legalname')})) limit 200`;
  const url = `${PHL_BL_URL}?q=${encodeURIComponent(q)}`;
  const j = (await getJson(ctx, url)) as { rows?: Array<Record<string, string | null>> } | null;
  const rows = j?.rows || [];
  const pick =
    pickCandidate(rows, input, (r) => phlTradeName(r.business_name || ''), () => 'Philadelphia') ||
    pickCandidate(rows, input, (r) => r.legalname || '', () => 'Philadelphia');
  if (!pick) return { result: null, legal_name: null };
  const r = pick.row;
  if (/individual/i.test(r.legalentitytype || '') && r.legallastname) {
    const name = personName(r.legalfirstname, r.legallastname);
    if (isPerson(name, input.city)) {
      return {
        result: made(input, [{ name, title: 'Owner (license holder)', role: 'owner', labeled: true }], url, pick.method, true, 'phl_bl', {
          business_name: phlTradeName(r.business_name || ''),
        }),
        legal_name: null,
      };
    }
  }
  return { result: null, legal_name: str(r.legalname) || null };
}

// ---------------------------------------------------------------------------
// CMS ownership (All Owners + Enrollments): HHA, hospice, SNF, RHC, hospital
// ---------------------------------------------------------------------------
/** Which CMS provider files a company name could be in. An NPI searches all of them. */
const CMS_GATES: Record<CmsType, RegExp> = {
  hha: /home\s*health|home\s*care|homecare|in[-\s]?home|visiting\s+nurse|\bvna\b|private\s+duty|nursing\s+services|health\s*care\s+services/i,
  hospice: /hospice|palliative/i,
  snf: /nursing|rehab|skilled|care\s+center|health\s*care\s+center|convalescent|post[-\s]?acute|living\s+center|care\s+home|manor\b/i,
  rhc: /clinic|rural\s+health|family\s+(medicine|practice|health)/i,
  hospital: /hospital|medical\s+center|regional\s+health/i,
};

export function cmsTypesFor(input: NameLookupInput): CmsType[] {
  if (input.npi) return [...CMS_TYPES];
  const name = String(input.company_name || '');
  return CMS_TYPES.filter((t) => CMS_GATES[t].test(name));
}

/** ZIP from input.zip, else the last 5-digit group in the address. */
export function inputZip5(input: NameLookupInput): string | null {
  return zip5Of(input.zip) || zip5Of(String(input.address || '').match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1]);
}

/** Different ZIPs: only an exact name in the same city survives. */
function zipConflict(input: NameLookupInput, rowZip: string | null | undefined, method: 'exact' | 'substring', cityMatch: boolean): boolean {
  const a = inputZip5(input);
  const b = zip5Of(rowZip);
  if (!a || !b || a === b) return false;
  return !(method === 'exact' && cityMatch);
}

export async function resolveCmsOwners(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const types = cmsTypesFor(input);
  if (!types.length) return null;
  const st = normalizeState(input.state);
  const fetchImpl = ctxFetch(ctx);
  const ids = await cmsDatasetIds(fetchImpl);
  const npi = String(input.npi || '').replace(/\D/g, '');
  const longest = [...queryTokens(input.company_name, 4)].sort((a, b) => b.length - a.length)[0];
  for (const type of types) {
    const ds = ids[type];
    let rows: Array<Record<string, string>> = [];
    if (npi.length === 10) rows = await soda(ctx, cmsQueryUrl(ds.enrollments, [{ path: 'NPI', value: npi }], 20));
    let pick: { row: Record<string, string>; method: 'exact' | 'substring'; cityMatch: boolean } | null = rows.length
      ? { row: rows[0], method: 'exact', cityMatch: true }
      : null;
    if (!pick && longest && st) {
      for (const col of ['DOING BUSINESS AS NAME', 'ORGANIZATION NAME']) {
        rows = await soda(ctx, cmsQueryUrl(ds.enrollments, [{ path: col, value: longest, op: 'CONTAINS' }, { path: 'STATE', value: st }], 200));
        pick = pickCandidate(rows, input, (r) => r[col] || '', (r) => r.CITY);
        if (pick && zipConflict(input, pick.row['ZIP CODE'], pick.method, pick.cityMatch)) pick = null;
        if (pick) break;
      }
    }
    if (!pick) continue;
    const enrollmentId = pick.row['ENROLLMENT ID'];
    if (!enrollmentId) continue;
    const ownersUrl = cmsQueryUrl(ds.owners, [{ path: 'ENROLLMENT ID', value: enrollmentId }], 200);
    const summary = summarizeCmsOwners(await soda(ctx, ownersUrl));
    const people = summary.people
      .filter((p) => p.ok)
      .slice(0, 4)
      .flatMap((p) =>
        hitsFromRoster(
          input,
          [{ name: `${p.first} ${p.last}`, title: p.title, role: p.role_rank <= 2 ? 'owner' : 'officer', labeled: true }],
          'open_data',
          ownersUrl,
          pick!.method,
          { cityMatch: pick!.cityMatch },
        ),
      );
    // Owned only by organizations (a chain or a PE platform): no person here. Universe mode keeps those flags.
    if (!people.length) continue;
    const flags = { private_equity: summary.pe_flag, reit: summary.reit_flag, org_owners: summary.org_owners };
    return {
      people,
      coverage_reason: null,
      source: 'open_data',
      source_url: ownersUrl,
      match_method: pick.method,
      implemented: true,
      open_data_source: 'cms_owners',
      business_name: pick.row['ORGANIZATION NAME'] || null,
      dba_name: pick.row['DOING BUSINESS AS NAME'] || null,
      entity_id: enrollmentId,
      ownership_flags: flags,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Form 5500 plan signer (universe table, loaded from the DOL bulk files)
// ---------------------------------------------------------------------------
export async function resolveForm5500(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const store = ctx?.universeStore === undefined ? UniverseStore.fromEnv() : ctx.universeStore;
  if (!store) return null;
  const ein = String(input.ein || '').replace(/\D/g, '');
  const zip = inputZip5(input);
  const phone = phoneDigits(input.phone);
  const nameKey = ilNormName(String(input.company_name).split(/\s[-–|:]\s|\s\(|\|/)[0]) || ilNormName(input.company_name);
  if (ein.length !== 9 && !(nameKey && zip) && !phone) return null;
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = (await store.lookup('form5500', { ein: ein.length === 9 ? ein : null, name_key: zip ? nameKey : null, zip5: zip, phone })) as unknown as Array<Record<string, unknown>>;
  } catch {
    return null;
  }
  const named = rows.filter((r) => r.waterfall_ready && r.owner_first && r.owner_last);
  const byEin = ein.length === 9 ? named.find((r) => r.ein === ein) : undefined;
  const byName = zip ? named.filter((r) => (r.name_key === nameKey || r.dba_key === nameKey) && r.zip5 === zip) : [];
  // A phone alone must also agree on the name (loosely): shared office lines are common.
  const byPhone = phone ? named.filter((r) => r.phone === phone && looseNameMatch(String(r.legal_name || ''), input.company_name)) : [];
  const hit = byEin || (byName.length === 1 ? byName[0] : undefined) || (byPhone.length === 1 ? byPhone[0] : undefined);
  if (!hit) return null;
  const people = hitsFromRoster(
    input,
    [{ name: `${hit.owner_first} ${hit.owner_last}`, title: F5500_TITLE, role: 'officer', labeled: true }],
    'open_data',
    'https://www.askebsa.dol.gov/epds/',
    'exact',
    { cityMatch: true },
  ).map((p) => ({ ...p, confidence: 'medium' as const, confidence_score: Math.min(p.confidence_score ?? 0.7, 0.7) }));
  if (!people.length) return null;
  return {
    people,
    coverage_reason: null,
    source: 'open_data',
    source_url: 'https://www.askebsa.dol.gov/epds/',
    match_method: 'exact',
    implemented: true,
    open_data_source: 'form5500',
    business_name: String(hit.legal_name || '') || null,
    legal_name: String(hit.legal_name || '') || null,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
const STATE_SOURCES: Record<string, OpenDataSourceId[]> = {
  CA: ['ca_la_fbn', 'ca_sf_reg', 'ca_abc'],
  AK: ['ak_bl'],
  PA: ['pa_dos', 'phl_bl'],
  CO: ['co_trade'],
  OR: ['or_ccb'],
  NY: ['nyc_dob', 'ny_dmv'],
  WA: ['wa_lni'],
  MO: ['mo_liquor'],
  IL: ['chicago', 'il_idfpr'],
  TX: ['tx_tdlr', 'tx_tabc'],
  DC: ['dc_bbl'],
};

/** National overlays run for every state, phone-keyed first. */
const NATIONAL_SOURCES: OpenDataSourceId[] = ['fmcsa', 'cms_owners', 'nppes'];
/** National sources tried after the state's own files: a plan signer is less certain than an officer roll. */
const NATIONAL_TAIL: OpenDataSourceId[] = ['form5500'];

/** The state's own files only (no national overlays). */
export function stateOpenDataSources(state: string): OpenDataSourceId[] {
  return [...(STATE_SOURCES[normalizeState(state)] || [])];
}

/** State -> free owner files queried for it (national overlays excluded). Reported by the health tool. */
export function openDataStateSources(): Record<string, OpenDataSourceId[]> {
  return Object.fromEntries(Object.entries(STATE_SOURCES).map(([k, v]) => [k, [...v]]));
}

export function openDataSourcesFor(state: string): OpenDataSourceId[] {
  const st = normalizeState(state);
  return [...NATIONAL_SOURCES, ...(STATE_SOURCES[st] || []), ...NATIONAL_TAIL];
}

export function openDataEnabled(ctx?: LookupContext): boolean {
  if (ctx?.openDataEnabled === false) return false;
  return process.env.OPEN_DATA_ENABLED !== 'false';
}

async function runSource(id: OpenDataSourceId, input: NameLookupInput, ctx?: LookupContext): Promise<{ result: NameLookupResult | null; legal_name: string | null }> {
  switch (id) {
    case 'pa_dos':
      return { result: await resolvePaOpenData(input, ctx), legal_name: null };
    case 'co_trade':
      return { result: await resolveCoTradeNames(input, ctx), legal_name: null };
    case 'or_ccb':
      return { result: await resolveOrCcb(input, ctx), legal_name: null };
    case 'ny_dmv':
      return resolveNyDmv(input, ctx);
    case 'nyc_dob':
      return { result: await resolveNycDob(input, ctx), legal_name: null };
    case 'wa_lni':
      return { result: await resolveWaLni(input, ctx), legal_name: null };
    case 'mo_liquor':
      return { result: await resolveMoLiquor(input, ctx), legal_name: null };
    case 'chicago':
      return { result: await resolveChicago(input, ctx), legal_name: null };
    case 'il_idfpr':
      return { result: await resolveIlIdfpr(input, ctx), legal_name: null };
    case 'tx_tabc':
      return resolveTxTabc(input, ctx);
    case 'dc_bbl':
      return { result: await resolveDcBbl(input, ctx), legal_name: null };
    case 'fmcsa':
      return { result: await resolveFmcsa(input, ctx), legal_name: null };
    case 'nppes':
      return { result: await resolveNppes(input, ctx), legal_name: null };
    case 'ca_la_fbn':
      return resolveCaLaFbn(input, ctx);
    case 'ca_sf_reg':
      return resolveCaSfRegistry(input, ctx);
    case 'ca_abc':
      return resolveCaAbc(input, ctx);
    case 'tx_tdlr':
      return { result: await resolveTxTdlr(input, ctx), legal_name: null };
    case 'ak_bl':
      return resolveAkBusinessLicense(input, ctx);
    case 'phl_bl':
      return resolvePhiladelphia(input, ctx);
    case 'cms_owners':
      return { result: await resolveCmsOwners(input, ctx), legal_name: null };
    case 'form5500':
      return { result: await resolveForm5500(input, ctx), legal_name: null };
    default:
      return { result: null, legal_name: null };
  }
}

/**
 * Run the free open-data sources for a row: national overlays, then the
 * state's files. Stops at the first source that names a person. Never spends
 * money and never touches a bot-walled registry.
 */
export async function resolveOpenDataOwners(input: NameLookupInput, ctx?: LookupContext): Promise<OpenDataOutcome> {
  const tried: OpenDataSourceId[] = [];
  let legal: string | null = null;
  if (!openDataEnabled(ctx)) return { result: null, legal_name: null, sources_tried: tried };
  // Offline contexts (tests, estimates) never reach the public APIs unless a fetch is injected.
  if (!ctx?.live && !ctx?.fetch) return { result: null, legal_name: null, sources_tried: tried };
  const only = ctx?.openDataSources;
  for (const id of openDataSourcesFor(input.state)) {
    if (only && !only.includes(id)) continue;
    tried.push(id);
    try {
      const got = await runSource(id, input, ctx);
      if (got.legal_name && !legal) legal = got.legal_name;
      if (got.result?.people.length) return { result: got.result, legal_name: legal, sources_tried: tried };
    } catch {
      /* a failing public API must never stop the row */
    }
  }
  return { result: null, legal_name: legal, sources_tried: tried };
}
