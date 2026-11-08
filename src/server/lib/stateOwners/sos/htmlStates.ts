import { htmlToText, sosSearchQueries } from '../names.js';
import { isChallengePage } from '../http.js';
import { lookupDeadlineExceeded, type LookupContext } from './context.js';
import { fetchOfficialPage, type OfficialPage } from './htmlFetch.js';
import { pickBestEntityMatch } from './match.js';
import { hitsFromRoster, parseOfficerRoster } from './officers.js';
import { companySpendKey } from './spend.js';
import type { NameLookupInput, NameLookupResult } from './types.js';
import {
  AGENT_ONLY_SKIP_CODES,
  OFFICER_PUBLISHING_CODES,
  catalogByCode,
} from './catalog.js';
import { isEmptyJsShell, resolveArizona, AZ_SEARCH_UI } from './azCenter.js';
import { resolveTexasComptroller, TX_FTAS_SEARCH } from './txComptroller.js';
import { resolveFloridaSunbiz } from './flSunbiz.js';

/** Apify residential proxy for blocked-state SOS pages. Off by default: it found no extra owners in testing. Set SOS_APIFY_PROXY=on to re-enable. */
function blockedStateApifyEnabled(): boolean {
  return process.env.SOS_APIFY_PROXY === 'on';
}

interface SearchHit {
  name: string;
  url: string;
  city?: string | null;
}

const GA_SEARCH = 'https://ecorp.sos.ga.gov/BusinessSearch';
const NC_SEARCH = 'https://www.sosnc.gov/online_services/search/by_title/_Business_Registration';
const AZ_SEARCH = AZ_SEARCH_UI;
const TX_SEARCH = TX_FTAS_SEARCH;
const MN_SEARCH = 'https://mblsportal.sos.mn.gov/Business/Search';
const UT_SEARCH = 'https://businessregistration.utah.gov/EntitySearch/OnlineEntitySearch';
const WA_SEARCH = 'https://ccfs.sos.wa.gov/';

export const HTML_REGISTRY_STATES = ['GA', 'NC', 'AZ', 'TX', 'MN', 'UT', 'WA'] as const;
export type HtmlOfficerState = (typeof HTML_REGISTRY_STATES)[number] | string;

const HTML_ADAPTER_SKIP = new Set(['CA', 'IL', 'OH', 'CO', 'OK', ...AGENT_ONLY_SKIP_CODES]);

export function usesHtmlOfficerAdapter(state: string): boolean {
  if ((HTML_REGISTRY_STATES as readonly string[]).includes(state)) return true;
  if (HTML_ADAPTER_SKIP.has(state)) return false;
  return (OFFICER_PUBLISHING_CODES as readonly string[]).includes(state);
}

function absUrl(href: string, base: string): string {
  try {
    return new URL(href.replace(/&amp;/g, '&'), base).href;
  } catch {
    return href;
  }
}

function looksNavLabel(name: string): boolean {
  return /^(search|home|login|help|privacy|next|previous|register|click here|more|view|details?)$/i.test(name);
}

export function parseSearchResultLinks(html: string, base: string): SearchHit[] {
  const rows: SearchHit[] = [];
  const seen = new Set<string>();
  if (isChallengePage(html) || isEmptyJsShell(html)) return rows;

  const push = (name: string, href: string, city?: string | null) => {
    const cleaned = htmlToText(name).replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 3 || cleaned.length > 120) return;
    if (looksNavLabel(cleaned)) return;
    if (!href || /^(javascript:|#|mailto:)/i.test(href)) return;
    const url = absUrl(href, base);
    if (!url || seen.has(url)) return;
    const lower = href.toLowerCase();
    const looksDetail =
      /business|profile|detail|entity|information|controln|id=|coa|taxpayer|ccfs|mbls|filing|account|entitysearch|inquiry|corpsearch|beSearch|cis|sos/i.test(
        lower,
      ) || /Business/i.test(href);
    const looksEntity = /\b(llc|inc|corp|ltd|llp|pllc|pc|pa|company|co)\b/i.test(cleaned) || cleaned.split(' ').length >= 2;
    if (!looksDetail && !looksEntity) return;
    seen.add(url);
    rows.push({ name: cleaned, url, city: city || null });
  };

  for (const m of String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    push(m[2] || '', m[1] || '');
  }

  for (const row of String(html || '').matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const href = row[0].match(/href=["']([^"']+)["']/i)?.[1] || '';
    const cells = [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      htmlToText(c[1] || '').replace(/\s+/g, ' ').trim(),
    );
    const nameCell = cells.find((c) => c.length >= 3 && !looksNavLabel(c)) || '';
    const cityCell =
      cells.find((c) => c !== nameCell && /^[A-Za-z .'-]{3,40}$/.test(c) && !/\b(llc|inc|corp)\b/i.test(c)) || null;
    if (href && nameCell) push(nameCell, href, cityCell);
  }

  for (const m of String(html || '').matchAll(/data-(?:href|url|entity-url)=["']([^"']+)["'][^>]*>([\s\S]*?)</gi)) {
    push(m[2] || '', m[1] || '');
  }

  return rows;
}

function originOf(url: string, fallback: string): string {
  try {
    return new URL(url).origin + '/';
  } catch {
    return fallback;
  }
}

function txSearchUrls(company: string): Array<{ url: string; base: string }> {
  const q = encodeURIComponent(company.trim().slice(0, 50));
  const base = 'https://comptroller.texas.gov/';
  return [
    { url: `https://comptroller.texas.gov/data-search/franchise-tax?name=${q}`, base },
    { url: `${TX_SEARCH}`, base },
  ];
}

export function searchUrlFor(state: string, company: string): { url: string; base: string } {
  const q = encodeURIComponent(company.trim());
  if (state === 'GA') {
    return {
      url: `${GA_SEARCH}?SearchType=BusinessName&EntityName=${q}`,
      base: 'https://ecorp.sos.ga.gov/',
    };
  }
  if (state === 'NC') {
    return {
      url: `https://www.sosnc.gov/online_services/search/Business_Registration_Results?SearchTerms=${q}`,
      base: 'https://www.sosnc.gov/',
    };
  }
  if (state === 'TX') return txSearchUrls(company)[0];
  if (state === 'MN') {
    return {
      url: `${MN_SEARCH}?searchType=BusinessName&searchValue=${q}`,
      base: 'https://mblsportal.sos.state.mn.us/',
    };
  }
  if (state === 'UT') {
    return {
      url: `${UT_SEARCH}?SearchTerm=${q}`,
      base: 'https://businessregistration.utah.gov/',
    };
  }
  if (state === 'WA') {
    return {
      url: `${WA_SEARCH}?searchTerm=${q}`,
      base: 'https://ccfs.sos.wa.gov/',
    };
  }
  if (state === 'AZ') {
    return {
      url: `${AZ_SEARCH}?q=${q}`,
      base: 'https://arizonabusinesscenter.azcc.gov/',
    };
  }
  if (state === 'FL') {
    return {
      url: `https://search.sunbiz.org/Inquiry/CorporationSearch/ByName`,
      base: 'https://search.sunbiz.org/',
    };
  }
  const entry = catalogByCode().get(state);
  const search = entry?.search_url || 'https://example.invalid/';
  const joiner = search.includes('?') ? '&' : '?';
  return { url: `${search}${joiner}name=${q}`, base: originOf(search, search) };
}

function searchAttempts(state: string, company: string): Array<{ url: string; base: string }> {
  if (state === 'TX') return txSearchUrls(company);
  return [searchUrlFor(state, company)];
}

function blockedResult(
  sourceUrl: string,
  extra?: Partial<NameLookupResult>,
): NameLookupResult {
  return {
    people: [],
    coverage_reason: 'blocked',
    source: 'us_sos',
    source_url: sourceUrl,
    implemented: true,
    ...extra,
  };
}

function pickFromLinks(input: NameLookupInput, links: SearchHit[], query: string) {
  const targets = sosSearchQueries(query);
  let best: ReturnType<typeof pickBestEntityMatch<SearchHit>> = null;
  for (const target of targets) {
    const picked = pickBestEntityMatch(target, links, {
      legalNameOf: (r) => r.name,
      city: input.city,
      cityOf: (r) => r.city,
      allowTrigram: true,
    });
    if (!picked) continue;
    if (!best || picked.score > best.score) best = picked;
    if (picked.method === 'exact' || picked.method === 'substring') return picked;
  }
  return best;
}

async function officersFromSearchPage(
  input: NameLookupInput,
  state: string,
  ctx: LookupContext | undefined,
  search: OfficialPage,
  url: string,
  base: string,
  query: string,
): Promise<{ hit: NameLookupResult | null; viaApify: boolean; usd: number }> {
  let viaApify = search.via_apify;
  let usd = search.usd;
  if (search.timed_out || search.blocked || isChallengePage(search.body) || !search.body) {
    return { hit: null, viaApify, usd };
  }
  const links = parseSearchResultLinks(search.body, base);
  const picked = pickFromLinks(input, links, query);
  if (!picked) return { hit: null, viaApify, usd };

  let detailBody = search.body;
  let detailUrl = search.url;
  if (picked.item.url && picked.item.url !== url) {
    const detail = await fetchOfficialPage(picked.item.url, ctx, {
      state,
      allowApify: blockedStateApifyEnabled(),
      input,
      kind: 'detail',
    });
    viaApify = viaApify || detail.via_apify;
    usd += detail.usd;
    if (detail.blocked || isChallengePage(detail.body)) {
      return {
        hit: blockedResult(picked.item.url, {
          via_apify: viaApify,
          apify_usd: usd,
          match_method: picked.method,
          match_score: picked.score,
          business_name: picked.item.name,
        }),
        viaApify,
        usd,
      };
    }
    if (detail.body) {
      detailBody = detail.body;
      detailUrl = detail.url;
    }
  }
  if (isChallengePage(detailBody)) {
    return {
      hit: blockedResult(detailUrl, { via_apify: viaApify, apify_usd: usd, business_name: picked.item.name }),
      viaApify,
      usd,
    };
  }
  const entries = parseOfficerRoster(detailBody);
  const people = hitsFromRoster(input, entries, 'us_sos', detailUrl, picked.method, {
    cityMatch: Boolean(input.city && picked.item.city && input.city.toLowerCase() === String(picked.item.city).toLowerCase()),
  });
  if (!people.length) {
    return {
      hit: {
        people: [],
        coverage_reason: 'agent_only',
        source: 'us_sos',
        source_url: detailUrl,
        implemented: true,
        match_method: picked.method,
        match_score: picked.score,
        business_name: picked.item.name,
        via_apify: viaApify,
        apify_usd: usd,
      },
      viaApify,
      usd,
    };
  }
  return {
    hit: {
      people,
      coverage_reason: null,
      source: 'us_sos',
      source_url: detailUrl,
      implemented: true,
      match_method: picked.method,
      match_score: picked.score,
      business_name: picked.item.name,
      via_apify: viaApify,
      apify_usd: usd,
    },
    viaApify,
    usd,
  };
}

export async function resolveHtmlOfficerState(
  input: NameLookupInput,
  state: HtmlOfficerState,
  ctx?: LookupContext,
): Promise<NameLookupResult> {
  if (state === 'AZ') return resolveArizona(input, ctx);
  if (state === 'TX') return resolveTexasComptroller(input, ctx);
  if (state === 'FL') return resolveFloridaSunbiz(input, ctx);
  if (ctx) ctx.companyKey = ctx.companyKey || companySpendKey(input);

  const entry = catalogByCode().get(state);
  const sourceUrl = entry?.search_url || searchUrlFor(state, input.company_name).url;
  const queries = sosSearchQueries(input.company_name);
  let viaApify = false;
  let usd = 0;
  let apifyWorthyUrl: { url: string; base: string; query: string } | null = null;

  for (const query of queries) {
    if (lookupDeadlineExceeded(ctx)) break;
    const attempts = searchAttempts(state, query);
    for (const { url, base } of attempts) {
      if (lookupDeadlineExceeded(ctx)) break;
      const search = await fetchOfficialPage(url, ctx, {
        state,
        allowApify: false,
        input,
        kind: 'search',
      });
      viaApify = viaApify || search.via_apify;
      usd += search.usd;
      if (search.apify_worthy && !apifyWorthyUrl) apifyWorthyUrl = { url, base, query };
      const parsed = await officersFromSearchPage(input, state, ctx, search, url, base, query);
      viaApify = viaApify || parsed.viaApify;
      usd = Number((usd + (parsed.usd - search.usd)).toFixed(4));
      if (parsed.hit) {
        return { ...parsed.hit, via_apify: viaApify, apify_usd: usd };
      }
    }
  }

  const apifyPolicy = catalogByCode().get(state)?.apify;
  // One residential fetch only after a real WAF block — never on not-found / timeout.
  // TX/FL and apify:never states stay on direct HTTP (+ residential proxy in fetchOfficialPage).
  if (apifyWorthyUrl && !blockedStateApifyEnabled()) {
    return blockedResult(sourceUrl, { via_apify: viaApify, apify_usd: usd });
  }
  if (apifyWorthyUrl && apifyPolicy !== 'never' && !lookupDeadlineExceeded(ctx)) {
    const search = await fetchOfficialPage(apifyWorthyUrl.url, ctx, {
      state,
      allowApify: blockedStateApifyEnabled(),
      input,
      kind: 'search',
    });
    viaApify = viaApify || search.via_apify;
    usd += search.usd;
    const parsed = await officersFromSearchPage(
      input,
      state,
      ctx,
      search,
      apifyWorthyUrl.url,
      apifyWorthyUrl.base,
      apifyWorthyUrl.query,
    );
    viaApify = viaApify || parsed.viaApify;
    usd = Number((usd + (parsed.usd - search.usd)).toFixed(4));
    if (parsed.hit) return { ...parsed.hit, via_apify: viaApify, apify_usd: usd };
    if (search.blocked || search.apify_worthy) {
      return blockedResult(sourceUrl, { via_apify: viaApify, apify_usd: usd });
    }
  }

  return {
    people: [],
    coverage_reason: 'not_found',
    source: 'us_sos',
    source_url: sourceUrl,
    implemented: true,
    via_apify: viaApify,
    apify_usd: usd,
  };
}

export const HTML_OFFICER_STATES = {
  GA_SEARCH,
  NC_SEARCH,
  AZ_SEARCH,
  TX_SEARCH,
  MN_SEARCH,
  UT_SEARCH,
  WA_SEARCH,
};
