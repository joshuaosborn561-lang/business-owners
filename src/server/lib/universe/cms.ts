/**
 * CMS provider ownership (data.cms.gov "All Owners" + "Enrollments", quarterly, free).
 *
 * Each provider type publishes two files keyed by ENROLLMENT ID:
 *   Enrollments: legal name, DBA, NPI, CCN, address, incorporation date, proprietary/nonprofit
 *   All Owners:  one row per owner or managing person: type (I individual / O organization), role, title,
 *                ownership %, association date, and flags for private equity, REIT, holding company, etc.
 * Verified 2026-11-08: latest quarter 2026-10-01 for HHA, hospice, SNF, RHC, hospital (research/2026-11-08).
 *
 * Every quarter is a new dataset id, so ids are resolved from the data.json catalog at run time (cached 24h)
 * with the Oct 2026 ids pinned as a fallback.
 */
import type { FetchLike } from '../stateOwners/http.js';
import { ilNormName } from '../stateOwners/sos/ilLlc.js';
import { officerPriority } from '../stateOwners/sos/officers.js';
import { ownerName, readyOwner } from './owners.js';
import { blank, digits10, isoDate, zip5, type UniverseRow, type UniverseSource } from './types.js';

export const CMS_TYPES = ['hha', 'hospice', 'snf', 'rhc', 'hospital'] as const;
export type CmsType = (typeof CMS_TYPES)[number];

export const CMS_TITLES: Record<CmsType, { owners: string; enrollments: string; label: string }> = {
  hha: { owners: 'Home Health Agency All Owners', enrollments: 'Home Health Agency Enrollments', label: 'home health agency' },
  hospice: { owners: 'Hospice All Owners', enrollments: 'Hospice Enrollments', label: 'hospice' },
  snf: { owners: 'Skilled Nursing Facility All Owners', enrollments: 'Skilled Nursing Facility Enrollments', label: 'skilled nursing facility' },
  rhc: { owners: 'Rural Health Clinic All Owners', enrollments: 'Rural Health Clinic Enrollments', label: 'rural health clinic' },
  hospital: { owners: 'Hospital All Owners', enrollments: 'Hospital Enrollments', label: 'hospital' },
};

/** Dataset ids for the 2026-10-01 release (verified 2026-11-08). Used only if the catalog cannot be read. */
export const CMS_PINNED_IDS: Record<CmsType, { owners: string; enrollments: string; as_of: string }> = {
  hha: { owners: '87e65a9e-3695-4b48-bd5c-4d5f4dfc7f08', enrollments: 'bd36db5c-c05d-4f37-8ab6-e69fd0fcd21c', as_of: '2026-10-01' },
  hospice: { owners: '79b1d3bd-5780-44a0-b878-64183b18592c', enrollments: '70660a53-8dc0-43b3-bb34-262a68943309', as_of: '2026-10-01' },
  snf: { owners: 'd44dd3c9-ffd7-4d92-93de-ab698395d048', enrollments: 'b553788a-41f4-4bca-b227-4e62c2929fe7', as_of: '2026-10-01' },
  rhc: { owners: 'f7a9b559-aa9b-42e1-97f3-627d56e10255', enrollments: '4409ba96-4c24-416d-86ea-7104a5ed121a', as_of: '2026-10-01' },
  hospital: { owners: 'e8a41a8a-eae7-4178-afda-0910b8e47fee', enrollments: '71b9466f-e7f6-4a78-9ec5-745e8d1d0ff7', as_of: '2026-10-01' },
};

export const CMS_CATALOG_URL = 'https://data.cms.gov/data.json';
export const CMS_API = 'https://data.cms.gov/data-api/v1/dataset';
const CATALOG_TTL_MS = 24 * 3600_000;

export type CmsIds = Record<CmsType, { owners: string; enrollments: string; as_of: string }>;
let idsCache: { at: number; ids: CmsIds } | null = null;

export function resetCmsIdsCache(): void {
  idsCache = null;
}

interface CatalogDataset {
  title?: string;
  modified?: string;
  distribution?: Array<{ accessURL?: string; downloadURL?: string; format?: string }>;
}

/** Pick the newest release of each family from a data.json catalog. Exported for tests. */
export function cmsIdsFromCatalog(catalog: { dataset?: CatalogDataset[] }): CmsIds {
  const ids = JSON.parse(JSON.stringify(CMS_PINNED_IDS)) as CmsIds;
  const latest = new Map<string, { title: string; id: string }>();
  for (const ds of catalog.dataset || []) {
    const title = String(ds.title || '');
    const family = title.split(' : ')[0];
    const api = (ds.distribution || [])
      .map((d) => d.accessURL || '')
      .filter((u) => /\/data-api\/v1\/dataset\/[0-9a-f-]{36}\/data$/.test(u))
      .pop();
    if (!api) continue;
    const id = api.match(/dataset\/([0-9a-f-]{36})\//)![1];
    const prev = latest.get(family);
    // Release date is the suffix after " : " (yyyy-mm-dd); later wins.
    if (!prev || title.split(' : ')[1] > prev.title.split(' : ')[1]) latest.set(family, { title, id });
  }
  for (const t of CMS_TYPES) {
    const o = latest.get(CMS_TITLES[t].owners);
    const e = latest.get(CMS_TITLES[t].enrollments);
    if (o && e) {
      const asOf = isoDate(o.title.split(' : ')[1]) || ids[t].as_of;
      ids[t] = { owners: o.id, enrollments: e.id, as_of: asOf };
    }
  }
  return ids;
}

export async function cmsDatasetIds(fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<CmsIds> {
  if (idsCache && Date.now() - idsCache.at < CATALOG_TTL_MS) return idsCache.ids;
  let ids = CMS_PINNED_IDS;
  try {
    const res = await fetchImpl(CMS_CATALOG_URL, { signal: AbortSignal.timeout(60_000) } as RequestInit);
    if (res.ok) ids = cmsIdsFromCatalog((await res.json()) as { dataset?: CatalogDataset[] });
  } catch {
    /* pinned ids */
  }
  idsCache = { at: Date.now(), ids };
  return ids;
}

/** data-api query URL with structured conditions (equality or CONTAINS). */
export function cmsQueryUrl(datasetId: string, conditions: Array<{ path: string; value: string; op?: 'CONTAINS' | '=' }>, size = 200, offset = 0): string {
  const p = new URLSearchParams();
  conditions.forEach((c, i) => {
    p.set(`filter[c${i}][condition][path]`, c.path);
    if (c.op === 'CONTAINS') p.set(`filter[c${i}][condition][operator]`, 'CONTAINS');
    p.set(`filter[c${i}][condition][value]`, c.value);
  });
  p.set('size', String(size));
  if (offset) p.set('offset', String(offset));
  return `${CMS_API}/${datasetId}/data?${p.toString()}`;
}

export type CmsRecord = Record<string, string>;

// ---------------------------------------------------------------------------------------------------------
// Owner ranking
// ---------------------------------------------------------------------------------------------------------

/** Role codes in the All Owners files. Lower rank = more owner-like. Managing employees are not owners. */
export function cmsRoleRank(roleText: string): number {
  const r = String(roleText || '').toUpperCase();
  if (/5% OR GREATER DIRECT/.test(r)) return 0;
  if (/GENERAL PARTNERSHIP/.test(r)) return 1;
  if (/5% OR GREATER INDIRECT/.test(r)) return 2;
  if (/CORPORATE OFFICER/.test(r)) return 3;
  if (/OPERATIONAL\/MANAGERIAL CONTROL/.test(r)) return 4;
  if (/CORPORATE DIRECTOR|LIMITED PARTNERSHIP/.test(r)) return 5;
  if (/MANAGING EMPLOYEE/.test(r)) return 99;
  return 6;
}

const isY = (v: string | undefined) => String(v || '').trim().toUpperCase() === 'Y';

export interface CmsOwnerPick {
  first: string | null;
  last: string | null;
  title: string;
  pct: number | null;
  ok: boolean;
  role_rank: number;
}

export interface CmsOwnershipSummary {
  people: CmsOwnerPick[];
  pe_flag: boolean;
  reit_flag: boolean;
  org_owners: string[];
}

function titleFor(row: CmsRecord): string {
  const title = blank(row['TITLE - OWNER']);
  const role = String(row['ROLE TEXT - OWNER'] || '');
  const pct = Number(row['PERCENTAGE OWNERSHIP']);
  if (title && !/^[A-Z]{1,3};?$/.test(title)) return title.replace(/;+$/, '');
  if (/5% OR GREATER/.test(role)) return Number.isFinite(pct) && pct > 0 ? `Owner (${pct}%)` : 'Owner';
  if (/GENERAL PARTNERSHIP/.test(role)) return 'General Partner';
  if (/CORPORATE OFFICER/.test(role)) return 'Officer';
  if (/CORPORATE DIRECTOR/.test(role)) return 'Director';
  return 'Owner';
}

/** Individuals ranked: ownership role, then ownership %, then title. Organizations kept by name for PE spotting. */
export function summarizeCmsOwners(rows: CmsRecord[]): CmsOwnershipSummary {
  const pe_flag = rows.some((r) => isY(r['PRIVATE EQUITY COMPANY - OWNER']));
  const reit_flag = rows.some((r) => isY(r['REIT - OWNER']));
  const org_owners = [
    ...new Set(
      rows
        .filter((r) => String(r['TYPE - OWNER']).toUpperCase() === 'O')
        .map((r) => blank(r['ORGANIZATION NAME - OWNER']))
        .filter((x): x is string => Boolean(x)),
    ),
  ].slice(0, 10);
  const seen = new Set<string>();
  const people: CmsOwnerPick[] = [];
  const individuals = rows
    .filter((r) => String(r['TYPE - OWNER']).toUpperCase() === 'I' && cmsRoleRank(r['ROLE TEXT - OWNER']) < 99)
    .map((r) => ({ r, rank: cmsRoleRank(r['ROLE TEXT - OWNER']), pct: Number(r['PERCENTAGE OWNERSHIP']) }))
    .sort((a, b) => a.rank - b.rank || (Number.isFinite(b.pct) ? b.pct : -1) - (Number.isFinite(a.pct) ? a.pct : -1) || officerPriority(titleFor(a.r)) - officerPriority(titleFor(b.r)));
  for (const { r, rank, pct } of individuals) {
    const raw = [r['FIRST NAME - OWNER'], r['MIDDLE NAME - OWNER'], r['LAST NAME - OWNER']].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
    const key = `${String(r['FIRST NAME - OWNER'] || '').trim()}|${String(r['LAST NAME - OWNER'] || '').trim()}`.toUpperCase();
    if (!raw || seen.has(key)) continue;
    seen.add(key);
    // CMS gives first and last separately; validate the pair but keep CMS's own split.
    const checked = ownerName(raw);
    const first = blank(r['FIRST NAME - OWNER']);
    const last = blank(r['LAST NAME - OWNER']);
    people.push({ first, last, title: titleFor(r), pct: Number.isFinite(pct) && pct > 0 ? pct : null, ok: checked.ok && Boolean(first && last), role_rank: rank });
  }
  return { people, pe_flag, reit_flag, org_owners };
}

const SOURCE_OF: Record<CmsType, UniverseSource> = { hha: 'cms_hha', hospice: 'cms_hospice', snf: 'cms_snf', rhc: 'cms_rhc', hospital: 'cms_hospital' };

export function cmsUniverseRow(type: CmsType, enrollment: CmsRecord, owners: CmsRecord[], asOf: string): UniverseRow {
  const s = summarizeCmsOwners(owners);
  const best = s.people.find((p) => p.ok) || null;
  const legal = blank(enrollment['ORGANIZATION NAME']) || '';
  const dba = blank(enrollment['DOING BUSINESS AS NAME']);
  const ready = Boolean(best && readyOwner({ first: best.first, last: best.last, ok: best.ok }, best.title));
  return {
    source: SOURCE_OF[type],
    source_record_id: String(enrollment['ENROLLMENT ID'] || ''),
    legal_name: legal,
    dba,
    address: [blank(enrollment['ADDRESS LINE 1']), blank(enrollment['ADDRESS LINE 2'])].filter(Boolean).join(', ') || null,
    city: blank(enrollment['CITY']),
    state: blank(enrollment['STATE']),
    zip: blank(enrollment['ZIP CODE']),
    phone: digits10(enrollment['TELEPHONE NUMBER']),
    ein: null,
    npi: blank(enrollment['NPI']),
    ccn: blank(enrollment['CCN']),
    usdot: null,
    owner_first: best?.first ?? null,
    owner_last: best?.last ?? null,
    owner_title: best?.title ?? null,
    ownership_pct: best?.pct ?? null,
    pe_flag: s.pe_flag,
    reit_flag: s.reit_flag,
    org_owners: s.org_owners.length ? s.org_owners : null,
    size_employees: null,
    size_participants: null,
    size_power_units: null,
    size_drivers: null,
    business_code: null,
    as_of: asOf,
    confidence: best ? 'high' : null,
    waterfall_ready: ready,
    name_key: ilNormName(legal) || null,
    dba_key: dba ? ilNormName(dba) || null : null,
    zip5: zip5(enrollment['ZIP CODE']),
  };
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<CmsRecord[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) } as RequestInit);
      if (res.ok) {
        const j = await res.json();
        return Array.isArray(j) ? (j as CmsRecord[]) : [];
      }
      if (res.status < 500 && res.status !== 429) return [];
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error('cms data api unavailable');
}

/** Page through a whole dataset (optionally filtered by state). */
export async function* cmsPages(fetchImpl: FetchLike, datasetId: string, conditions: Array<{ path: string; value: string }>, pageSize = 5000): AsyncGenerator<CmsRecord[]> {
  for (let offset = 0; ; offset += pageSize) {
    const page = await getJson(fetchImpl, cmsQueryUrl(datasetId, conditions, pageSize, offset));
    if (!page.length) return;
    yield page;
    if (page.length < pageSize) return;
  }
}

/** Universe rows for one provider type: all owners loaded into memory (~100k rows max), enrollments streamed. */
export async function* cmsUniverse(type: CmsType, opts: { state?: string | null; fetchImpl?: FetchLike } = {}): AsyncGenerator<UniverseRow> {
  const fetchImpl = opts.fetchImpl || (fetch as unknown as FetchLike);
  const ids = (await cmsDatasetIds(fetchImpl))[type];
  const byEnrollment = new Map<string, CmsRecord[]>();
  for await (const page of cmsPages(fetchImpl, ids.owners, [])) {
    for (const r of page) {
      const k = r['ENROLLMENT ID'];
      if (!k) continue;
      const list = byEnrollment.get(k) || [];
      list.push(r);
      byEnrollment.set(k, list);
    }
  }
  const cond = opts.state ? [{ path: 'STATE', value: opts.state.toUpperCase() }] : [];
  const seen = new Set<string>();
  for await (const page of cmsPages(fetchImpl, ids.enrollments, cond)) {
    for (const e of page) {
      const id = e['ENROLLMENT ID'];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      yield cmsUniverseRow(type, e, byEnrollment.get(id) || [], ids.as_of);
    }
  }
}
