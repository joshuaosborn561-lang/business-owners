import { htmlToText, sosSearchQueries } from '../names.js';
import type { LookupContext } from './context.js';
import { lookupDeadlineExceeded } from './context.js';
import { fetchOfficialPage } from './htmlFetch.js';
import { pickBestEntityMatch } from './match.js';
import {
  canonicalOfficerTitle,
  hitsFromRoster,
  officerPriority,
  parseOfficerRoster,
  roleFromTitle,
  type RosterEntry,
} from './officers.js';
import { companySpendKey } from './spend.js';
import type { NameLookupInput, NameLookupResult } from './types.js';

export const FL_SUNBIZ_BY_NAME = 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName';
export const FL_SUNBIZ_RESULTS = 'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults';

const SUNBIZ_TITLE: Record<string, string> = {
  P: 'President',
  PRES: 'President',
  PRESIDENT: 'President',
  VP: 'Vice President',
  V: 'Vice President',
  S: 'Secretary',
  SEC: 'Secretary',
  T: 'Treasurer',
  TREAS: 'Treasurer',
  C: 'Chairman',
  CEO: 'CEO',
  CFO: 'CFO',
  COO: 'COO',
  MGR: 'Manager',
  MGRM: 'Manager',
  AMBR: 'Member',
  MBR: 'Member',
  DIR: 'Director',
  D: 'Director',
};

function expandSunbizTitle(raw: string): string {
  const key = String(raw || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  return SUNBIZ_TITLE[key] || raw || 'Officer';
}

export function parseSunbizSearchLinks(html: string): Array<{ name: string; url: string; city?: string | null }> {
  const out: Array<{ name: string; url: string; city?: string | null }> = [];
  const seen = new Set<string>();
  for (const m of String(html || '').matchAll(
    /href=["']([^"']*SearchResultDetail[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = m[1] || '';
    const name = htmlToText(m[2] || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href || !name || seen.has(href)) continue;
    seen.add(href);
    try {
      out.push({ name, url: new URL(href, 'https://search.sunbiz.org/').href });
    } catch {
      out.push({ name, url: href });
    }
  }
  if (!out.length) {
    for (const m of String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = m[1] || '';
      const name = htmlToText(m[2] || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!href || /^(javascript:|#|mailto:)/i.test(href) || name.length < 3) continue;
      if (!/search|detail|inquiry|sunbiz|entity|corporation/i.test(href) && !/\b(llc|inc|corp)\b/i.test(name)) {
        continue;
      }
      try {
        out.push({ name, url: new URL(href, 'https://search.sunbiz.org/').href });
      } catch {
        out.push({ name, url: href });
      }
    }
  }
  return out;
}

function upsertSunbizOfficer(out: RosterEntry[], name: string, title: string): void {
  const cleaned = htmlToText(name)
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return;
  const canon = canonicalOfficerTitle(expandSunbizTitle(title));
  const key = cleaned.toLowerCase();
  const existing = out.find((r) => r.name.toLowerCase() === key);
  if (existing) {
    if (existing.title === 'Officer' || officerPriority(canon) < officerPriority(existing.title)) {
      existing.title = canon;
      existing.role = roleFromTitle(canon);
      existing.labeled = true;
    }
    return;
  }
  out.push({ name: cleaned, title: canon, role: roleFromTitle(canon), labeled: true });
}

export function parseSunbizOfficers(html: string): RosterEntry[] {
  const raw = String(html || '');
  const out: RosterEntry[] = [...parseOfficerRoster(raw)];

  const labeled = [
    ...raw.matchAll(
      /Title(?:<\/[^>]+>)?\s*([A-Za-z]{1,12})\s*(?:<[^>]+>\s*)*Name(?:<\/[^>]+>)?\s*([A-Z][A-Z'., \-]{2,80})/gi,
    ),
  ];
  for (const m of labeled) upsertSunbizOfficer(out, m[2] || '', m[1] || '');

  const text = htmlToText(raw);
  const textPairs = text.matchAll(
    /\bTitle\s+([A-Za-z]{1,12})\s+Name\s+([A-Z][A-Z'.,\-]+(?:\s+[A-Z][A-Z'.,\-]+){0,2})/g,
  );
  for (const m of textPairs) upsertSunbizOfficer(out, m[2] || '', m[1] || '');

  return out;
}

function emptyFl(coverage: NameLookupResult['coverage_reason'], extra?: Partial<NameLookupResult>): NameLookupResult {
  return {
    people: [],
    coverage_reason: coverage,
    source: 'us_sos',
    source_url: FL_SUNBIZ_BY_NAME,
    implemented: true,
    ...extra,
  };
}

function formBody(company: string): string {
  const term = company.trim().slice(0, 80);
  return new URLSearchParams({
    SearchTerm: term,
    InquiryType: 'EntityName',
    searchNameOrder: term.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 40),
  }).toString();
}

/**
 * Florida Sunbiz ByName POST → SearchResultDetail officers.
 * Direct HTTP; residential proxy only when Cloudflare blocks. Never Apify.
 */
export async function resolveFloridaSunbiz(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<NameLookupResult> {
  if (ctx) ctx.companyKey = ctx.companyKey || companySpendKey(input);
  let usd = 0;
  let viaApify = false;

  for (const query of sosSearchQueries(input.company_name)) {
    if (lookupDeadlineExceeded(ctx)) break;
    const search = await fetchOfficialPage(FL_SUNBIZ_RESULTS, ctx, {
      state: 'FL',
      allowApify: false,
      input,
      kind: 'search',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://search.sunbiz.org',
          Referer: FL_SUNBIZ_BY_NAME,
        },
        body: formBody(query),
      },
    });
    usd += search.usd;
    viaApify = viaApify || search.via_apify;
    if (search.timed_out) continue;
    if (search.blocked || search.apify_worthy) {
      return emptyFl('blocked', { via_apify: viaApify, apify_usd: usd, source_url: search.url });
    }
    if (!search.body) continue;

    const links = parseSunbizSearchLinks(search.body);
    if (!links.length) continue;
    const picked = pickBestEntityMatch(query, links, {
      legalNameOf: (r) => r.name,
      city: input.city,
      cityOf: (r) => r.city,
      allowTrigram: true,
    });
    if (!picked) continue;

    const detail = await fetchOfficialPage(picked.item.url, ctx, {
      state: 'FL',
      allowApify: false,
      input,
      kind: 'detail',
    });
    usd += detail.usd;
    viaApify = viaApify || detail.via_apify;
    if (detail.blocked || detail.apify_worthy) {
      return emptyFl('blocked', { via_apify: viaApify, apify_usd: usd, source_url: detail.url });
    }
    const entries = parseSunbizOfficers(detail.body || search.body);
    const people = hitsFromRoster(input, entries, 'us_sos', picked.item.url, picked.method);
    if (!people.length) {
      return {
        people: [],
        coverage_reason: 'agent_only',
        source: 'us_sos',
        source_url: picked.item.url,
        implemented: true,
        match_method: picked.method,
        match_score: picked.score,
        business_name: picked.item.name,
        via_apify: viaApify,
        apify_usd: usd,
      };
    }
    return {
      people,
      coverage_reason: null,
      source: 'us_sos',
      source_url: picked.item.url,
      implemented: true,
      match_method: picked.method,
      match_score: picked.score,
      business_name: picked.item.name,
      via_apify: viaApify,
      apify_usd: usd,
    };
  }

  return emptyFl('not_found', { via_apify: viaApify, apify_usd: usd });
}
