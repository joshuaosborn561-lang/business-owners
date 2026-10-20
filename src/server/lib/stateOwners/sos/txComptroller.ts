import { htmlToText, sosSearchQueries } from '../names.js';
import type { LookupContext } from './context.js';
import { lookupDeadlineExceeded } from './context.js';
import { fetchOfficialPage } from './htmlFetch.js';
import { pickBestEntityMatch } from './match.js';
import { canonicalOfficerTitle, hitsFromRoster, parseOfficerRoster, type RosterEntry } from './officers.js';
import { companySpendKey } from './spend.js';
import type { NameLookupInput, NameLookupResult } from './types.js';

/** Live FTAS search page (JS). The old /coa/search.do redirects here. */
export const TX_FTAS_SEARCH = 'https://comptroller.texas.gov/taxes/franchise/account-status/search';
/** Public JSON used by the search page — no API key. */
export const TX_FTAS_API = 'https://comptroller.texas.gov/data-search/franchise-tax';

export function txFtasSearchUrl(company: string): string {
  return `${TX_FTAS_API}?name=${encodeURIComponent(company.trim().slice(0, 50))}`;
}

export function txFtasDetailUrl(taxpayerId: string): string {
  const id = String(taxpayerId || '').trim();
  return `${TX_FTAS_API}/${encodeURIComponent(id)}`;
}

export function txFtasDetailPageUrl(taxpayerId: string): string {
  const id = String(taxpayerId || '').trim();
  return `${TX_FTAS_SEARCH}/${encodeURIComponent(id)}`;
}

interface TxFtasRow {
  name: string;
  taxpayerId: string;
  city?: string | null;
  url?: string;
}

export function parseTxHtmlSearchLinks(html: string): TxFtasRow[] {
  const out: TxFtasRow[] = [];
  const seen = new Set<string>();
  for (const m of String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] || '';
    const name = htmlToText(m[2] || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href || /^(javascript:|#|mailto:)/i.test(href) || name.length < 3) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    let url = href;
    try {
      url = new URL(href, 'https://mycpa.cpa.state.tx.us/').href;
    } catch {
      /* keep href */
    }
    const id = href.match(/taxpayerId=([^&]+)|t_coa_id=([^&]+)|\/(\d{9,11})(?:\/|$)/i);
    out.push({
      name,
      taxpayerId: decodeURIComponent(id?.[1] || id?.[2] || id?.[3] || ''),
      url,
    });
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

export function parseTxFtasSearch(payload: string): TxFtasRow[] {
  const raw = String(payload || '').trim();
  if (!raw) return [];
  try {
    const json = JSON.parse(raw) as unknown;
    const rec = asRecord(json);
    const rows = Array.isArray(json)
      ? json
      : rec && Array.isArray(rec.data)
        ? rec.data
        : [];
    const out: TxFtasRow[] = [];
    for (const item of rows) {
      const row = asRecord(item);
      if (!row) continue;
      const name = str(row, ['name', 'taxpayerName', 'entityName']);
      const taxpayerId = str(row, ['taxpayerId', 'taxpayer_id', 'id']);
      if (!name || !taxpayerId) continue;
      out.push({
        name,
        taxpayerId,
        city: str(row, ['mailingAddressCity', 'city']) || null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function officersFromTxFtasDetail(payload: string): RosterEntry[] {
  const raw = String(payload || '').trim();
  if (!raw) return [];
  try {
    const json = JSON.parse(raw) as unknown;
    const rec = asRecord(json);
    const data = rec ? asRecord(rec.data) || rec : null;
    const info = data && Array.isArray(data.officerInfo) ? data.officerInfo : [];
    const blob = info
      .map((item) => {
        const row = asRecord(item);
        if (!row) return '';
        const title = canonicalOfficerTitle(str(row, ['AGNT_TITL_TX', 'title', 'officerTitle']) || 'Officer');
        const name = str(row, ['AGNT_NM', 'name', 'officerName']);
        return name ? `${title}: ${name}` : '';
      })
      .filter(Boolean)
      .join('\n');
    const fromJson = parseOfficerRoster(blob);
    if (fromJson.length) return fromJson;
  } catch {
    /* HTML fallback */
  }
  return parseOfficerRoster(htmlToText(raw) || raw);
}

function emptyTx(coverage: NameLookupResult['coverage_reason'], extra?: Partial<NameLookupResult>): NameLookupResult {
  return {
    people: [],
    coverage_reason: coverage,
    source: 'us_sos',
    source_url: TX_FTAS_SEARCH,
    implemented: true,
    ...extra,
  };
}

/**
 * Texas Comptroller franchise-tax officers via the public data-search JSON.
 * Direct HTTP only — never Apify, never residential proxy.
 */
export async function resolveTexasComptroller(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<NameLookupResult> {
  if (ctx) ctx.companyKey = ctx.companyKey || companySpendKey(input);
  let usd = 0;
  let viaApify = false;

  for (const query of sosSearchQueries(input.company_name)) {
    if (lookupDeadlineExceeded(ctx)) break;
    const search = await fetchOfficialPage(txFtasSearchUrl(query), ctx, {
      state: 'TX',
      allowApify: false,
      input,
      kind: 'search',
    });
    usd += search.usd;
    viaApify = viaApify || search.via_apify;
    if (search.timed_out) continue;
    if (search.blocked || search.apify_worthy) {
      return emptyTx('blocked', { via_apify: viaApify, apify_usd: usd, source_url: search.url });
    }
    if (!search.body) continue;

    const jsonRows = parseTxFtasSearch(search.body);
    const htmlRows = jsonRows.length
      ? []
      : parseTxHtmlSearchLinks(search.body);
    const rows = jsonRows.length ? jsonRows : htmlRows;
    if (!rows.length) continue;
    const picked = pickBestEntityMatch(query, rows, {
      legalNameOf: (r) => r.name,
      city: input.city,
      cityOf: (r) => r.city,
      allowTrigram: true,
    });
    if (!picked) continue;

    const detailUrl = picked.item.taxpayerId
      ? txFtasDetailUrl(picked.item.taxpayerId)
      : picked.item.url || search.url;
    const detail = await fetchOfficialPage(detailUrl, ctx, {
      state: 'TX',
      allowApify: false,
      input,
      kind: 'detail',
    });
    usd += detail.usd;
    viaApify = viaApify || detail.via_apify;
    if (detail.blocked || detail.apify_worthy) {
      return emptyTx('blocked', { via_apify: viaApify, apify_usd: usd, source_url: detail.url });
    }
    const entries = officersFromTxFtasDetail(detail.body || search.body);
    const sourceUrl = picked.item.taxpayerId
      ? txFtasDetailPageUrl(picked.item.taxpayerId)
      : picked.item.url || detail.url;
    const people = hitsFromRoster(input, entries, 'us_sos', sourceUrl, picked.method, {
      cityMatch: Boolean(input.city && picked.item.city && input.city.toLowerCase() === String(picked.item.city).toLowerCase()),
    });
    if (!people.length) {
      return {
        people: [],
        coverage_reason: 'agent_only',
        source: 'us_sos',
        source_url: sourceUrl,
        implemented: true,
        match_method: picked.method,
        match_score: picked.score,
        business_name: picked.item.name,
        entity_id: picked.item.taxpayerId || null,
        via_apify: viaApify,
        apify_usd: usd,
      };
    }
    return {
      people,
      coverage_reason: null,
      source: 'us_sos',
      source_url: sourceUrl,
      implemented: true,
      match_method: picked.method,
      match_score: picked.score,
      business_name: picked.item.name,
      entity_id: picked.item.taxpayerId || null,
      via_apify: viaApify,
      apify_usd: usd,
    };
  }

  return emptyTx('not_found', { via_apify: viaApify, apify_usd: usd });
}
