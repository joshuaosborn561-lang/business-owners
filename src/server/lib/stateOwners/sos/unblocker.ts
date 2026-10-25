/**
 * Unblocker: a pay-as-you-go residential fetch API for the ~20 state
 * registries that return Cloudflare / Incapsula / Akamai / F5 pages to
 * datacenter IPs. The vendor renders the page from a residential IP, clears
 * the challenge, and returns HTML. We pay per request, so every call goes
 * through the spend ledger (TOTAL_MAX_USD + per-company ceiling) first.
 *
 * Env:
 *   UNBLOCKER_PROVIDER = zyte | brightdata | scrapingbee | scraperapi
 *   UNBLOCKER_API_KEY
 *   UNBLOCKER_ZONE            (brightdata only: the Web Unlocker zone name)
 *   UNBLOCKER_USD_PER_REQUEST (default 0.004)
 *   UNBLOCKER_RENDER_JS       (default true; false = plain HTTP through the residential pool)
 */
import { DESKTOP_UA } from '../http.js';
import type { LookupContext } from './context.js';
import { ctxFetch, ctxSpend, lookupDeadlineExceeded } from './context.js';
import { UNBLOCKER_USD_PER_REQUEST_DEFAULT } from './spend.js';

export type UnblockerProvider = 'zyte' | 'brightdata' | 'scrapingbee' | 'scraperapi';

export interface UnblockerConfig {
  provider: UnblockerProvider;
  apiKey: string;
  zone?: string | null;
  usdPerRequest: number;
  renderJs: boolean;
}

export interface UnblockerPage {
  status: number;
  body: string;
  url: string;
  usd: number;
  refused?: boolean;
}

/**
 * Registries that publish officers/principals but block datacenter traffic
 * (observed 2026-10-25). PA uses open data, CA the Apify hybrid, FL the bulk
 * file and OH is agent-only, so they are not routed here.
 */
export const UNBLOCKER_STATES = new Set([
  'GA', 'NC', 'UT', 'MO', 'MS', 'MT', 'HI', 'AK', 'NH', 'MA', 'NV', 'WA', 'WY', 'MI', 'AZ', 'IA', 'KS', 'IN', 'TN', 'VA', 'OR', 'SC',
]);

export function usesUnblocker(state: string): boolean {
  return UNBLOCKER_STATES.has(String(state || '').toUpperCase());
}

export function unblockerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): UnblockerConfig | null {
  const apiKey = env.UNBLOCKER_API_KEY?.trim();
  if (!apiKey) return null;
  const raw = (env.UNBLOCKER_PROVIDER || 'zyte').trim().toLowerCase();
  const provider = (['zyte', 'brightdata', 'scrapingbee', 'scraperapi'] as const).find((p) => p === raw);
  if (!provider) return null;
  const price = Number(env.UNBLOCKER_USD_PER_REQUEST);
  return {
    provider,
    apiKey,
    zone: env.UNBLOCKER_ZONE?.trim() || null,
    usdPerRequest: Number.isFinite(price) && price > 0 ? price : UNBLOCKER_USD_PER_REQUEST_DEFAULT,
    renderJs: env.UNBLOCKER_RENDER_JS?.trim().toLowerCase() !== 'false',
  };
}

export function unblockerConfigured(ctx?: LookupContext): boolean {
  if (ctx?.unblockerEnabled === false) return false;
  if (ctx?.unblockerFetch) return true;
  return unblockerConfigFromEnv() !== null;
}

export function unblockerUsdPerLookup(): number {
  const cfg = unblockerConfigFromEnv();
  return Number(((cfg?.usdPerRequest ?? UNBLOCKER_USD_PER_REQUEST_DEFAULT) * 2).toFixed(4));
}

function headerRecord(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const h = init?.headers;
  if (!h) return out;
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = v;
    return out;
  }
  return { ...(h as Record<string, string>) };
}

/** Build the vendor request for one target URL. Pure; tested without network. */
export function buildUnblockerRequest(cfg: UnblockerConfig, url: string, init?: RequestInit): { url: string; init: RequestInit } {
  const method = (init?.method || 'GET').toUpperCase();
  const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : undefined;
  const headers = headerRecord(init);
  if (cfg.provider === 'zyte') {
    const payload: Record<string, unknown> = { url };
    if (cfg.renderJs && method === 'GET') payload.browserHtml = true;
    else {
      payload.httpResponseBody = true;
      if (method !== 'GET') {
        payload.httpRequestMethod = method;
        if (body) payload.httpRequestBody = Buffer.from(body, 'utf8').toString('base64');
      }
      const custom = Object.entries(headers).filter(([k]) => !/^(user-agent|accept-encoding|host|content-length)$/i.test(k));
      if (custom.length) payload.customHttpRequestHeaders = custom.map(([name, value]) => ({ name, value }));
    }
    return {
      url: 'https://api.zyte.com/v1/extract',
      init: {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
    };
  }
  if (cfg.provider === 'brightdata') {
    const payload: Record<string, unknown> = { zone: cfg.zone || 'web_unlocker1', url, format: 'raw', method };
    if (body) payload.body = body;
    if (!cfg.renderJs) payload.render = false;
    return {
      url: 'https://api.brightdata.com/request',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    };
  }
  if (cfg.provider === 'scrapingbee') {
    const params = new URLSearchParams({
      api_key: cfg.apiKey,
      url,
      render_js: cfg.renderJs ? 'true' : 'false',
      premium_proxy: 'true',
      country_code: 'us',
      forward_headers: 'true',
      transparent_status_code: 'true',
    });
    const fwd: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) fwd[`Spb-${k}`] = v;
    return { url: `https://app.scrapingbee.com/api/v1/?${params.toString()}`, init: { method, headers: fwd, body } };
  }
  const params = new URLSearchParams({ api_key: cfg.apiKey, url, render: cfg.renderJs ? 'true' : 'false', premium: 'true', country_code: 'us' });
  return { url: `https://api.scraperapi.com/?${params.toString()}`, init: { method, headers, body } };
}

/** Normalize the vendor response into status + HTML. Pure. */
export async function parseUnblockerResponse(cfg: UnblockerConfig, res: Response, targetUrl: string): Promise<{ status: number; body: string; url: string }> {
  if (cfg.provider === 'zyte') {
    if (!res.ok) return { status: res.status, body: '', url: targetUrl };
    const j = (await res.json()) as { statusCode?: number; browserHtml?: string; httpResponseBody?: string; url?: string };
    const body = j.browserHtml ?? (j.httpResponseBody ? Buffer.from(j.httpResponseBody, 'base64').toString('utf8') : '');
    return { status: j.statusCode ?? 200, body, url: j.url || targetUrl };
  }
  const body = await res.text();
  if (cfg.provider === 'scrapingbee') {
    const original = Number(res.headers.get('Spb-original-status') || res.headers.get('spb-original-status'));
    return { status: Number.isFinite(original) && original > 0 ? original : res.status, body, url: targetUrl };
  }
  return { status: res.status, body, url: targetUrl };
}

/**
 * Fetch one registry page through the unblocker. Reserves the price first;
 * returns refused=true (no vendor call) when the ledger would be exceeded.
 */
export async function fetchViaUnblocker(url: string, ctx: LookupContext | undefined, init?: RequestInit): Promise<UnblockerPage | null> {
  if (!unblockerConfigured(ctx)) return null;
  if (lookupDeadlineExceeded(ctx)) return null;
  const cfg = unblockerConfigFromEnv();
  const price = cfg?.usdPerRequest ?? UNBLOCKER_USD_PER_REQUEST_DEFAULT;
  const spend = ctxSpend(ctx);
  if (!spend.reserveUnblocker(price, ctx?.companyKey)) {
    return { status: 0, body: '', url, usd: 0, refused: true };
  }
  if (ctx?.unblockerFetch) {
    const got = await ctx.unblockerFetch(url, init);
    return { status: got.status, body: got.body, url: got.url || url, usd: got.usd ?? price };
  }
  if (!cfg) return null;
  const req = buildUnblockerRequest(cfg, url, {
    ...init,
    headers: { 'User-Agent': DESKTOP_UA, ...headerRecord(init) },
  });
  try {
    const res = await ctxFetch(ctx)(req.url, { ...req.init, signal: AbortSignal.timeout(60_000) } as RequestInit);
    const parsed = await parseUnblockerResponse(cfg, res, url);
    return { ...parsed, usd: price };
  } catch {
    return { status: 0, body: '', url, usd: price };
  }
}
