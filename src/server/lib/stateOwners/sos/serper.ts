import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DESKTOP_UA } from '../http.js';
import type { LookupContext } from './context.js';
import { ctxFetch, ctxSerper, serperKeyFromEnv } from './context.js';
import type { SerperOrganicHit, SerperPlacesResponse, SerperSearchResponse } from './types.js';

/** Charge 1 Serper credit on the unified TOTAL_MAX_USD ledger. False = skip the vendor call. */
/**
 * Process-wide Serper ledger. Every real HTTP call is reserved here BEFORE it
 * is sent, whether or not the caller's ctx carries a SpendTracker, so the cap
 * cannot be under-counted by sub-contexts. Hard-stops at SERPER_HARD_CAP_USD
 * (falls back to TOTAL_MAX_USD) minus the tracked Apify spend.
 */
let globalSerperCalls = -1;
function ledgerPath(): string | null {
  return process.env.SERPER_LEDGER_FILE?.trim() || null;
}
function loadLedger(): void {
  if (globalSerperCalls >= 0) return;
  globalSerperCalls = 0;
  const p = ledgerPath();
  if (p && existsSync(p)) globalSerperCalls = Number(readFileSync(p, 'utf8').trim()) || 0;
}
export function globalSerperCredits(): number {
  loadLedger();
  return globalSerperCalls;
}
export function resetGlobalSerper(n = 0): void {
  globalSerperCalls = n;
}
function globalCapUsd(): number {
  const raw = Number(process.env.SERPER_HARD_CAP_USD || process.env.TOTAL_MAX_USD || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : Infinity;
}
export function reserveGlobalSerper(ctx?: LookupContext): boolean {
  loadLedger();
  const apify = Number((ctx?.spend as { apifyUsd?: number } | undefined)?.apifyUsd || 0);
  if ((globalSerperCalls + 1) * 0.001 + apify > globalCapUsd()) return false;
  globalSerperCalls += 1;
  const p = ledgerPath();
  if (p) writeFileSync(p, String(globalSerperCalls));
  return true;
}

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
  // Reserve on both ledgers BEFORE the paid request (previously the tracker was
  // charged after the call, so refused calls were paid but never counted).
  if (!chargeSerperQuery(ctx)) return { organic: [] };
  if (!reserveGlobalSerper(ctx)) return { organic: [] };
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
  if (!chargeSerperQuery(ctx)) return { places: [] };
  if (!reserveGlobalSerper(ctx)) return { places: [] };
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
    const json = (await res.json()) as SerperPlacesResponse;
    return json && typeof json === 'object' ? json : { places: [] };
  } catch {
    return { places: [] };
  }
}
