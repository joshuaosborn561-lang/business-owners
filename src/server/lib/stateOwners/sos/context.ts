import { getBoardFetch, type FetchLike } from '../http.js';
import { totalMaxUsdFromEnv } from './spend.js';
import type { NameLookupInput } from './types.js';
import {
  ApifySpendTracker,
  SerperCreditTracker,
  apifyMaxUsdFromEnv,
  apifySpendFileFromEnv,
  apifyUsdPerCompanyFromEnv,
} from './spend.js';
import type { IlDtaIndex } from './ilDta.js';
import type { OpenDataSourceId } from './openDataSources.js';
import type { SerperSearchResponse } from './types.js';

/** Direct SOS HTTP must finish in this window. Never wait on a hung registry. */
export const SOS_HTTP_TIMEOUT_MS = 15_000;
export const LOOKUP_CONCURRENCY_DEFAULT = 5;
export const LOOKUP_CONCURRENCY_MAX = 8;

export type HtmlKind = 'search' | 'detail' | 'document';

export interface LookupContext {
  /** When true, adapters may call official HTTP / Apify. Tests leave this false. */
  live?: boolean;
  fetch?: FetchLike;
  apifyToken?: string | null;
  apifyEnabled?: boolean;
  ilDtaDir?: string | null;
  ilIndex?: IlDtaIndex | null;
  includeAgents?: boolean;
  spend?: ApifySpendTracker;
  serper?: SerperCreditTracker;
  serperKey?: string | null;
  serperEnabled?: boolean;
  /** Fixture: skip google.serper.dev and return this payload (or per-query). */
  serperOrganic?:
    | SerperSearchResponse
    | ((query: string) => SerperSearchResponse | Promise<SerperSearchResponse>);
  /** Fixture: skip CA HTTP and use this keyword-search JSON. */
  caPayload?: unknown;
  caDetailPayload?: unknown;
  caSiText?: string | null;
  caSiBytes?: Uint8Array | null;
  /** Fixture HTML keyed by state + kind, or a function. */
  htmlFor?: string | ((state: string, kind: HtmlKind, input: NameLookupInput, url?: string) => string | null);
  htmlByUrl?: Record<string, string>;
  /** Fixture rows for Colorado Socrata. */
  coRows?: unknown[];
  /** Fixture rows / payload for Ohio businessnamediv JSON. */
  ohRows?: unknown[];
  ohEndpoints?: unknown;
  /** Fixture payload for Arizona Business Center JSON. */
  azPayload?: unknown;
  azDetailPayload?: unknown;
  /** Cached residential proxy fetch (bot-block states only). */
  proxyFetch?: FetchLike | null;
  /** Free open-data owner sources (PA officers, FMCSA, NPPES, license and liquor files). Default on. */
  openDataEnabled?: boolean;
  /** Restrict open-data sources (tests / targeted runs). */
  openDataSources?: OpenDataSourceId[];
  /** Unblocker (residential fetch API) for bot-walled registries. Default on when UNBLOCKER_API_KEY is set. */
  unblockerEnabled?: boolean;
  /** Injected unblocker fetch (tests). */
  unblockerFetch?: (url: string, init?: RequestInit) => Promise<{ status: number; body: string; url?: string; usd?: number }>;
  /** Unified Apify + Serper cap. Env: TOTAL_MAX_USD (falls back to APIFY_MAX_USD). */
  totalMaxUsd?: number | null;
  /** Hard cap for Apify spend this context. Env: APIFY_MAX_USD. */
  apifyMaxUsd?: number | null;
  /** Per-company Apify ceiling. Env: APIFY_USD_PER_COMPANY (default $0.02). */
  apifyUsdPerCompany?: number;
  /** Shared spend file so multiple processes honor one global cap. */
  apifySpendFile?: string | null;
  /** Current company key for the per-company budget (STATE|city|company). */
  companyKey?: string | null;
  /** Abort remaining SOS work after this epoch ms. */
  deadlineAt?: number | null;
  /** Direct SOS HTTP timeout (capped at SOS_HTTP_TIMEOUT_MS). */
  httpTimeoutMs?: number;
  /** Extra ms to poll a finished Apify run until usageTotalUsd lands. */
  apifyUsageWaitMs?: number;
  /** Injected OCR (tests). Production uses tesseract.js when installed. */
  ocr?: (bytes: Uint8Array) => Promise<string>;
  /** Injected Apify HTML fetch (tests). */
  apifyFetchHtml?: (url: string) => Promise<{
    html: string;
    usd: number;
    text?: string;
    refused?: boolean;
    bytesBase64?: string;
    contentType?: string;
  }>;
  /** Host-side CA batch checkpoint path (resume). */
  caBatchCheckpointPath?: string;
  /** Dump per-step HTTP status from the Playwright run (CLI --ca-debug). */
  caBatchDebug?: boolean;
  /** LLC unmask-by-address step (default on). */
  unmaskEnabled?: boolean;
  /** Hard-to-find LinkedIn + aggregator owner step (default on). */
  hardToFindEnabled?: boolean;
  /** Skip Playwright and run dz_omar + web-fetch only. Default for --ca-batch. */
  caHybridOnly?: boolean;
  /** Opt into the Incapsula-blocked Playwright UI path. */
  caPlaywright?: boolean;
  /** dz_omar maxResultsPerQuery (default 3). */
  caHybridMaxResultsPerQuery?: number;
  /** Optional find-named-person HTTP base (agent fallback). */
  findNamedPersonUrl?: string | null;
  /** Fixture dataset items — skip the live Playwright run. */
  caBatchItems?: Array<{
    company_name: string;
    city: string;
    state: string;
    status: 'ok' | 'not_found' | 'blocked' | 'error';
    retries: number;
    entity_id?: string;
    business_name?: string;
    match_method?: 'exact' | 'substring' | 'trigram';
    match_score?: number;
    city_match?: boolean;
    source_url?: string;
    document_id?: string;
    officers_text?: string;
    bytesBase64?: string;
    contentType?: string;
    agent_name?: string;
    error?: string;
  }>;
}

export function apifyTokenFromEnv(): string | null {
  for (const name of ['APIFY_TOKEN', 'APIFY_API_TOKEN', 'apify_token'] as const) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return null;
}

export function ilDtaDirFromEnv(): string | null {
  return process.env.IL_DTA_DIR?.trim() || null;
}

export function serperKeyFromEnv(): string | null {
  for (const name of ['SERPER_API_KEY', 'SERPER_KEY', 'serper_api_key'] as const) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return null;
}

export function lookupMaxSecondsFromEnv(): number | null {
  const raw = process.env.LOOKUP_MAX_SECONDS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function lookupConcurrencyFromEnv(): number {
  const raw = process.env.LOOKUP_CONCURRENCY?.trim();
  const n = raw ? Number(raw) : LOOKUP_CONCURRENCY_DEFAULT;
  if (!Number.isFinite(n) || n < 1) return LOOKUP_CONCURRENCY_DEFAULT;
  return Math.max(1, Math.min(n, LOOKUP_CONCURRENCY_MAX));
}

export function lookupDeadlineExceeded(ctx?: LookupContext): boolean {
  return Boolean(ctx?.deadlineAt && Date.now() >= ctx.deadlineAt);
}

export function defaultLookupContext(overrides: LookupContext = {}): LookupContext {
  const persistPath = overrides.apifySpendFile ?? apifySpendFileFromEnv();
  const capUsd = overrides.totalMaxUsd ?? totalMaxUsdFromEnv() ?? overrides.apifyMaxUsd ?? apifyMaxUsdFromEnv();
  const companyCap = overrides.apifyUsdPerCompany ?? apifyUsdPerCompanyFromEnv();
  const spend =
    overrides.spend ??
    new ApifySpendTracker({
      capUsd,
      persistPath,
      companyCapUsd: companyCap,
    });
  const ctx: LookupContext = {
    live: true,
    fetch: getBoardFetch(),
    apifyToken: apifyTokenFromEnv(),
    apifyEnabled: true,
    ilDtaDir: ilDtaDirFromEnv(),
    includeAgents: false,
    serper: new SerperCreditTracker(),
    serperKey: serperKeyFromEnv(),
    serperEnabled: true,
    apifyMaxUsd: capUsd,
    apifyUsdPerCompany: companyCap,
    apifySpendFile: persistPath,
    ...overrides,
    spend,
  };
  if (ctx.spend && ctx.apifyMaxUsd != null) ctx.spend.capUsd = ctx.apifyMaxUsd;
  if (ctx.spend && ctx.apifyUsdPerCompany != null) ctx.spend.companyCapUsd = ctx.apifyUsdPerCompany;
  if (ctx.spend && persistPath && !ctx.spend.persistPath) ctx.spend.persistPath = persistPath;
  return ctx;
}

export function ctxFetch(ctx?: LookupContext): FetchLike {
  return ctx?.fetch ?? getBoardFetch();
}

export function ctxSpend(ctx?: LookupContext): ApifySpendTracker {
  if (ctx?.spend) return ctx.spend;
  const spend = new ApifySpendTracker();
  if (ctx) ctx.spend = spend;
  return spend;
}

export function ctxSerper(ctx?: LookupContext): SerperCreditTracker {
  if (ctx?.serper) return ctx.serper;
  const serper = new SerperCreditTracker();
  if (ctx) ctx.serper = serper;
  return serper;
}

export function fixtureHtml(ctx: LookupContext | undefined, state: string, kind: HtmlKind, input: NameLookupInput, url?: string): string | null {
  if (!ctx) return null;
  if (typeof ctx.htmlFor === 'function') return ctx.htmlFor(state, kind, input, url);
  if (typeof ctx.htmlFor === 'string') return ctx.htmlFor;
  if (url && ctx.htmlByUrl?.[url]) return ctx.htmlByUrl[url];
  return null;
}
