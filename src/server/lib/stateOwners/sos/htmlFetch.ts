import {
  DESKTOP_UA,
  createResidentialProxyFetch,
  isApifyWorthyBlock,
  isChallengePage,
  isTimeoutError,
  looksBlocked,
  type FetchLike,
} from '../http.js';
import {
  SOS_HTTP_TIMEOUT_MS,
  ctxFetch,
  ctxSpend,
  fixtureHtml,
  lookupDeadlineExceeded,
  type LookupContext,
} from './context.js';
import { apifyFetchHtml } from './apifyPlaywright.js';
import { catalogByCode } from './catalog.js';
import { APIFY_USD_PER_BLOCKED_LOOKUP, companySpendKey } from './spend.js';
import type { NameLookupInput } from './types.js';

/** Datacenter IPs get Cloudflare/Incapsula. Try residential proxy before Apify. TX/IL stay direct. */
export const BOT_BLOCK_PROXY_STATES = new Set([
  'AL',
  'AZ',
  'FL',
  'GA',
  'HI',
  'KY',
  'LA',
  'MA',
  'MN',
  'MO',
  'MS',
  'NC',
  'NE',
  'NH',
  'NV',
  'PA',
  'RI',
  'UT',
  'VA',
  'VT',
  'WA',
  'WV',
]);

export function usesResidentialProxy(state: string): boolean {
  return BOT_BLOCK_PROXY_STATES.has(String(state || '').toUpperCase());
}

async function ctxProxyFetch(ctx?: LookupContext): Promise<FetchLike | null> {
  if (!ctx) return null;
  if (ctx.proxyFetch) return ctx.proxyFetch;
  const session = `sos${String(ctx.companyKey || 'x').replace(/[^0-9A-Za-z]/g, '').slice(0, 24) || 'x'}`;
  const fn = await createResidentialProxyFetch(session);
  if (fn) ctx.proxyFetch = fn;
  return fn;
}

export interface OfficialPage {
  status: number;
  body: string;
  url: string;
  via_apify: boolean;
  blocked: boolean;
  usd: number;
  apify_worthy?: boolean;
  timed_out?: boolean;
  via_proxy?: boolean;
}

function asOfficial(opts: {
  status: number;
  body: string;
  url: string;
  via_apify?: boolean;
  usd?: number;
}): OfficialPage {
  const blocked = looksBlocked(opts.status, opts.body) || isChallengePage(opts.body);
  return {
    status: opts.status,
    body: blocked ? '' : opts.body,
    url: opts.url,
    via_apify: opts.via_apify === true,
    blocked,
    usd: opts.usd || 0,
    apify_worthy: isApifyWorthyBlock(opts.status, opts.body),
  };
}

function sosTimeoutMs(ctx?: LookupContext): number {
  const requested = ctx?.httpTimeoutMs ?? SOS_HTTP_TIMEOUT_MS;
  let cap = Math.max(1, Math.min(SOS_HTTP_TIMEOUT_MS, requested));
  if (ctx?.deadlineAt) {
    const remain = ctx.deadlineAt - Date.now();
    if (remain <= 0) return 1;
    cap = Math.min(cap, remain);
  }
  return cap;
}

function withTimeoutSignal(init: RequestInit | undefined, timeoutMs: number): RequestInit {
  const timeout = AbortSignal.timeout(timeoutMs);
  const existing = init?.signal;
  const signal =
    existing && typeof AbortSignal.any === 'function' ? AbortSignal.any([existing, timeout]) : timeout;
  return { ...init, signal };
}

function canUseApify(
  ctx: LookupContext | undefined,
  input: NameLookupInput,
  allowApify: boolean,
): boolean {
  if (!allowApify) return false;
  if (ctx?.apifyEnabled === false) return false;
  const entry = catalogByCode().get(input.state);
  if (entry?.apify === 'never') return false;
  if (lookupDeadlineExceeded(ctx)) return false;
  const spend = ctxSpend(ctx);
  const key = ctx?.companyKey || companySpendKey(input);
  if (spend.wouldExceed(APIFY_USD_PER_BLOCKED_LOOKUP)) return false;
  if (key && spend.remainingCompanyUsd(key) <= 0) return false;
  return true;
}

export async function fetchOfficialPage(
  url: string,
  ctx: LookupContext | undefined,
  opts: {
    state: string;
    allowApify: boolean;
    input: NameLookupInput;
    kind?: 'search' | 'detail' | 'document';
    init?: RequestInit;
  },
): Promise<OfficialPage> {
  const fixture = fixtureHtml(ctx, opts.state, opts.kind || 'search', opts.input, url);
  if (fixture != null) {
    return asOfficial({ status: 200, body: fixture, url });
  }
  if (ctx?.htmlByUrl?.[url]) {
    return asOfficial({ status: 200, body: ctx.htmlByUrl[url], url });
  }
  if (!ctx?.live) {
    return { status: 0, body: '', url, via_apify: false, blocked: false, usd: 0 };
  }
  if (lookupDeadlineExceeded(ctx)) {
    return { status: 0, body: '', url, via_apify: false, blocked: false, usd: 0, timed_out: true };
  }

  const prevKey = ctx.companyKey;
  ctx.companyKey = ctx.companyKey || companySpendKey(opts.input);

  const fetchFn = ctxFetch(ctx);
  let status = 0;
  let body = '';
  try {
    const res = await fetchFn(
      url,
      withTimeoutSignal(
        {
          redirect: 'follow',
          ...opts.init,
          headers: {
            'User-Agent': DESKTOP_UA,
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...(opts.init?.headers || {}),
          },
        },
        sosTimeoutMs(ctx),
      ),
    );
    status = res.status;
    const buf = new Uint8Array(await res.arrayBuffer());
    body = Buffer.from(buf).toString('utf8');
    let worthy = isApifyWorthyBlock(status, body);
    let blocked = looksBlocked(status, body) || isChallengePage(body);
    if (worthy && usesResidentialProxy(opts.state)) {
      const proxy = await ctxProxyFetch(ctx);
      if (proxy) {
        try {
          const proxied = await proxy(
            url,
            withTimeoutSignal(
              {
                redirect: 'follow',
                ...opts.init,
                headers: {
                  'User-Agent': DESKTOP_UA,
                  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                  ...(opts.init?.headers || {}),
                },
              },
              sosTimeoutMs(ctx),
            ),
          );
          const pBuf = new Uint8Array(await proxied.arrayBuffer());
          const pBody = Buffer.from(pBuf).toString('utf8');
          const pWorthy = isApifyWorthyBlock(proxied.status, pBody);
          const pBlocked = looksBlocked(proxied.status, pBody) || isChallengePage(pBody);
          if (!pWorthy) {
            ctx.companyKey = prevKey;
            return {
              status: proxied.status,
              body: pBlocked ? '' : pBody,
              url: proxied.url || url,
              via_apify: false,
              via_proxy: true,
              blocked: pBlocked,
              usd: 0,
              apify_worthy: false,
            };
          }
          status = proxied.status;
          body = pBody;
          worthy = pWorthy;
          blocked = pBlocked;
        } catch {
          /* fall through to Apify when allowed */
        }
      }
    }
    if (!worthy) {
      ctx.companyKey = prevKey;
      return {
        status,
        body: blocked ? '' : body,
        url: res.url || url,
        via_apify: false,
        blocked,
        usd: 0,
        apify_worthy: false,
      };
    }
    if (!canUseApify(ctx, opts.input, opts.allowApify)) {
      ctx.companyKey = prevKey;
      return { status, body: '', url, via_apify: false, blocked: true, usd: 0, apify_worthy: true };
    }
  } catch (err) {
    ctx.companyKey = prevKey;
    const timedOut = isTimeoutError(err) || lookupDeadlineExceeded(ctx);
    return {
      status: 0,
      body: '',
      url,
      via_apify: false,
      blocked: false,
      usd: 0,
      timed_out: timedOut || true,
      apify_worthy: false,
    };
  }

  const got = await apifyFetchHtml(url, ctx, { preferWebFetch: true });
  ctx.companyKey = prevKey;
  if (got.refused) {
    return { status: status || 0, body: '', url, via_apify: false, blocked: true, usd: 0, apify_worthy: true };
  }
  const html = got.html || got.text;
  if (!html || looksBlocked(200, html) || isChallengePage(html)) {
    return { status: status || 0, body: '', url, via_apify: true, blocked: true, usd: got.usd, apify_worthy: true };
  }
  return {
    status: 200,
    body: html,
    url,
    via_apify: true,
    blocked: false,
    usd: got.usd,
    apify_worthy: true,
  };
}
