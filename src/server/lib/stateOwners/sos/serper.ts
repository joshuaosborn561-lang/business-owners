import { DESKTOP_UA } from '../http.js';
import type { LookupContext } from './context.js';
import { ctxFetch, ctxSerper, serperKeyFromEnv } from './context.js';
import type { SerperOrganicHit, SerperPlacesResponse, SerperSearchResponse } from './types.js';

/** Charge 1 Serper credit on the unified TOTAL_MAX_USD ledger. False = skip the vendor call. */
export function chargeSerperQuery(ctx?: LookupContext): boolean {
  if (ctx?.spend && !ctx.spend.reserveSerper(1, ctx.companyKey)) return false;
  ctxSerper(ctx).add(1);
  return true;
}

export const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
export const SERPER_PLACES_URL = 'https://google.serper.dev/places';

export function organicFromSerperPayload(payload: unknown): SerperOrganicHit[] {
  if (!payload || typeof payload !== 'object') return [];
  const organic = (payload as SerperSearchResponse).organic;
  if (!Array.isArray(organic)) return [];
  return organic.filter((row) => row && typeof row === 'object') as SerperOrganicHit[];
}

/**
 * One google.serper.dev search. A successful HTTP 200 costs 1 credit even if
 * organic is empty. Failed / skipped calls cost 0.
 */
export async function serperSearch(query: string, ctx?: LookupContext): Promise<SerperSearchResponse> {
  const q = String(query || '').trim();
  if (!q) return { organic: [] };

  if (ctx?.serperOrganic) {
    if (!chargeSerperQuery(ctx)) return { organic: [] };
    const payload =
      typeof ctx.serperOrganic === 'function' ? await ctx.serperOrganic(q) : ctx.serperOrganic;
    return payload && typeof payload === 'object' ? payload : { organic: [] };
  }

  if (ctx?.serperEnabled === false) return { organic: [] };
  if (ctx && ctx.live === false) return { organic: [] };

  const key = ctx?.serperKey ?? serperKeyFromEnv();
  if (!key) return { organic: [] };

  const fetchFn = ctxFetch(ctx);
  try {
    const res = await fetchFn(SERPER_SEARCH_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': DESKTOP_UA,
      },
      body: JSON.stringify({ q, gl: 'us', hl: 'en', num: 10 }),
    });
    if (!res.ok) return { organic: [] };
    if (!chargeSerperQuery(ctx)) return { organic: [] };
    const json = (await res.json()) as SerperSearchResponse;
    return json && typeof json === 'object' ? json : { organic: [] };
  } catch {
    return { organic: [] };
  }
}

/**
 * Google Maps / GBP via Serper Places. One credit on HTTP 200.
 */
export async function serperPlaces(query: string, ctx?: LookupContext): Promise<SerperPlacesResponse> {
  const q = String(query || '').trim();
  if (!q) return { places: [] };

  if (ctx?.serperOrganic) {
    if (!chargeSerperQuery(ctx)) return { places: [] };
    return { places: [] };
  }
  if (ctx?.serperEnabled === false) return { places: [] };
  if (ctx && ctx.live === false) return { places: [] };

  const key = ctx?.serperKey ?? serperKeyFromEnv();
  if (!key) return { places: [] };

  const fetchFn = ctxFetch(ctx);
  try {
    const res = await fetchFn(SERPER_PLACES_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': DESKTOP_UA,
      },
      body: JSON.stringify({ q, gl: 'us', hl: 'en' }),
    });
    if (!res.ok) return { places: [] };
    if (!chargeSerperQuery(ctx)) return { places: [] };
    const json = (await res.json()) as SerperPlacesResponse;
    return json && typeof json === 'object' ? json : { places: [] };
  } catch {
    return { places: [] };
  }
}
