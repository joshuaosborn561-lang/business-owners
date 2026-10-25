/** Starter-plan mid-point from PLAN.md (compute + residential, media off). */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const APIFY_USD_PER_BLOCKED_LOOKUP = 0.015;
export const APIFY_USD_PER_COMPUTE_UNIT = 0.2;
/** Hard per-company Apify ceiling. One web-fetch (~$0.015) fits; a second run does not. */
export const APIFY_USD_PER_COMPANY = 0.02;
/** CA search + SI may each need Playwright when Incapsula blocks datacenter IPs. */
export const CA_APIFY_LOOKUPS_PER_ROW = 1.5;
/** One sticky Playwright session: Incapsula once, then hundreds of CA companies. */
export const CA_BATCH_USD_BASE = 0.04;
export const CA_BATCH_USD_PER_COMPANY = 0.003;
export const CA_BATCH_COMPANIES_PER_RUN = 400;
export const CA_BATCH_ITEM_RETRIES = 3;
/** google.serper.dev search. One credit per query; Josh prefers this over Apify. */
export const SERPER_USD_PER_QUERY = 0.001;
/** Hard cap on Serper queries for one company (DBA + owner + LinkedIn fallback). */
export const SERPER_QUERIES_PER_COMPANY = 8;
/** Estimate: officer query + a few site/DBA lookups, never more than the per-company cap. */
export const SERPER_QUERIES_PER_ROW = SERPER_QUERIES_PER_COMPANY;
/** Unblocker (Zyte / Bright Data / ScrapingBee) default price per rendered request; override with UNBLOCKER_USD_PER_REQUEST. */
export const UNBLOCKER_USD_PER_REQUEST_DEFAULT = 0.004;
/** A registry lookup is a search page plus a detail page. */
export const UNBLOCKER_REQUESTS_PER_LOOKUP = 2;

export function apifyMaxUsdFromEnv(): number | null {
  const raw = process.env.APIFY_MAX_USD?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Unified Apify + Serper cap. Falls back to APIFY_MAX_USD when TOTAL_MAX_USD is unset. */
export function totalMaxUsdFromEnv(): number | null {
  const raw = process.env.TOTAL_MAX_USD?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return apifyMaxUsdFromEnv();
}

export function apifyUsdPerCompanyFromEnv(): number {
  const raw = process.env.APIFY_USD_PER_COMPANY?.trim();
  if (!raw) return APIFY_USD_PER_COMPANY;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : APIFY_USD_PER_COMPANY;
}

export function apifySpendFileFromEnv(): string | null {
  const raw = process.env.APIFY_SPEND_FILE?.trim();
  return raw || null;
}

export function companySpendKey(input: {
  state?: string | null;
  city?: string | null;
  company_name?: string | null;
  company?: string | null;
}): string {
  const state = String(input.state || '').trim().toUpperCase();
  const city = String(input.city || '').trim().toLowerCase();
  const company = String(input.company_name || input.company || '')
    .trim()
    .toLowerCase();
  return `${state}|${city}|${company}`;
}

interface PersistShape {
  usd: number;
  apifyUsd: number;
  runs: number;
  lookups: number;
  computeUnits: number;
  proxyGb: number;
  refused: number;
  serperCredits: number;
  serperQueries: number;
  unblockerUsd?: number;
  unblockerRequests?: number;
  companies: Record<string, number>;
  serperCompanies: Record<string, number>;
}

function sleepSync(ms: number): void {
  const n = Math.max(0, Math.floor(ms));
  if (n <= 0) return;
  try {
    const buf = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buf, 0, 0, n);
  } catch {
    const until = Date.now() + n;
    while (Date.now() < until) {
      /* spin */
    }
  }
}

function withFileLock<T>(lockPath: string, fn: () => T): T {
  const started = Date.now();
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        return fn();
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'EEXIST' && code !== 'EPERM') throw err;
      if (Date.now() - started > 8000) throw err;
      sleepSync(15);
    }
  }
}

function emptyPersist(): PersistShape {
  return {
    usd: 0,
    apifyUsd: 0,
    runs: 0,
    lookups: 0,
    computeUnits: 0,
    proxyGb: 0,
    refused: 0,
    serperCredits: 0,
    serperQueries: 0,
    companies: {},
    serperCompanies: {},
  };
}

export class ApifySpendTracker {
  /** Unified billed USD (Apify + Serper). This is what TOTAL_MAX_USD caps. */
  usd = 0;
  apifyUsd = 0;
  serperCredits = 0;
  serperQueries = 0;
  unblockerUsd = 0;
  unblockerRequests = 0;
  runs = 0;
  lookups = 0;
  computeUnits = 0;
  refused = 0;
  proxyGb = 0;
  capUsd: number | null = totalMaxUsdFromEnv();
  companyCapUsd: number = apifyUsdPerCompanyFromEnv();
  persistPath: string | null = null;
  companies = new Map<string, number>();
  serperCompanies = new Map<string, number>();

  constructor(opts?: { capUsd?: number | null; persistPath?: string | null; companyCapUsd?: number }) {
    if (opts?.capUsd !== undefined) this.capUsd = opts.capUsd;
    if (opts?.persistPath) this.persistPath = opts.persistPath;
    if (opts?.companyCapUsd != null && Number.isFinite(opts.companyCapUsd)) {
      this.companyCapUsd = opts.companyCapUsd;
    }
    if (this.persistPath) this.locked(() => this.hydrate());
  }

  private locked<T>(fn: () => T): T {
    if (!this.persistPath) return fn();
    mkdirSync(dirname(this.persistPath), { recursive: true });
    return withFileLock(`${this.persistPath}.lock`, fn);
  }

  private hydrate(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.persistPath, 'utf8')) as PersistShape;
      this.usd = Number(raw.usd) || 0;
      this.apifyUsd = Number(raw.apifyUsd) || (raw.serperCredits ? 0 : this.usd);
      this.serperCredits = Number(raw.serperCredits) || 0;
      this.serperQueries = Number(raw.serperQueries) || this.serperCredits;
      this.unblockerUsd = Number(raw.unblockerUsd) || 0;
      this.unblockerRequests = Number(raw.unblockerRequests) || 0;
      this.runs = Number(raw.runs) || 0;
      this.lookups = Number(raw.lookups) || 0;
      this.computeUnits = Number(raw.computeUnits) || 0;
      this.proxyGb = Number(raw.proxyGb) || 0;
      this.refused = Number(raw.refused) || 0;
      this.companies = new Map(
        Object.entries(raw.companies || {}).map(([k, v]) => [k, Number(v) || 0]),
      );
      this.serperCompanies = new Map(
        Object.entries(raw.serperCompanies || {}).map(([k, v]) => [k, Number(v) || 0]),
      );
      if (!raw.apifyUsd && this.serperCredits > 0) {
        this.apifyUsd = Number((this.usd - this.serperCredits * SERPER_USD_PER_QUERY).toFixed(4));
        if (this.apifyUsd < 0) this.apifyUsd = 0;
      }
    } catch {
      /* keep in-memory */
    }
  }

  private flush(): void {
    if (!this.persistPath) return;
    const payload: PersistShape = {
      usd: this.usd,
      apifyUsd: this.apifyUsd,
      runs: this.runs,
      lookups: this.lookups,
      computeUnits: this.computeUnits,
      proxyGb: this.proxyGb,
      refused: this.refused,
      serperCredits: this.serperCredits,
      serperQueries: this.serperQueries,
      unblockerUsd: this.unblockerUsd,
      unblockerRequests: this.unblockerRequests,
      companies: Object.fromEntries(this.companies),
      serperCompanies: Object.fromEntries(this.serperCompanies),
    };
    const tmp = `${this.persistPath}.${process.pid}.tmp`;
    mkdirSync(dirname(this.persistPath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(payload) + '\n', 'utf8');
    renameSync(tmp, this.persistPath);
  }

  companySpent(key: string): number {
    if (this.persistPath) this.locked(() => this.hydrate());
    return this.companies.get(key) || 0;
  }

  remainingCompanyUsd(key: string): number {
    return Math.max(0, Number((this.companyCapUsd - this.companySpent(key)).toFixed(4)));
  }

  remainingSerperQueries(key?: string | null): number {
    if (this.persistPath) this.locked(() => this.hydrate());
    if (!key) return SERPER_QUERIES_PER_COMPANY;
    return Math.max(0, SERPER_QUERIES_PER_COMPANY - (this.serperCompanies.get(key) || 0));
  }

  remainingTotalUsd(): number {
    if (this.persistPath) this.locked(() => this.hydrate());
    if (this.capUsd == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, Number((this.capUsd - this.usd).toFixed(4)));
  }

  exhausted(): boolean {
    return this.locked(() => {
      this.hydrate();
      if (this.capUsd == null) return false;
      return this.usd >= this.capUsd;
    });
  }

  wouldExceed(additional = APIFY_USD_PER_BLOCKED_LOOKUP): boolean {
    const extra = Number(additional) || 0;
    return this.locked(() => {
      this.hydrate();
      if (this.capUsd == null) return false;
      return this.usd + extra > this.capUsd;
    });
  }

  wouldExceedCompany(key: string, additional = APIFY_USD_PER_BLOCKED_LOOKUP): boolean {
    const extra = Number(additional) || 0;
    if (!key) return false;
    return this.locked(() => {
      this.hydrate();
      return (this.companies.get(key) || 0) + extra > this.companyCapUsd;
    });
  }

  /**
   * Atomically check global + per-company caps and add the estimate so two
   * processes cannot both slip under the cap.
   */
  reserve(additional = APIFY_USD_PER_BLOCKED_LOOKUP, companyKey?: string | null): boolean {
    const extra = Number(additional) || 0;
    if (extra <= 0) return true;
    return this.locked(() => {
      this.hydrate();
      if (this.capUsd != null && this.usd + extra > this.capUsd) return false;
      // Any remaining per-company budget may start another blocked fetch (search then detail).
      if (companyKey && (this.companies.get(companyKey) || 0) >= this.companyCapUsd) return false;
      this.usd = Number((this.usd + extra).toFixed(4));
      this.apifyUsd = Number((this.apifyUsd + extra).toFixed(4));
      if (companyKey) {
        this.companies.set(companyKey, Number(((this.companies.get(companyKey) || 0) + extra).toFixed(4)));
      }
      this.flush();
      return true;
    });
  }

  /**
   * Charge one unblocker request (residential fetch API) against the same
   * TOTAL_MAX_USD ledger and the per-company ceiling. Returns false (and the
   * caller must not call the vendor) when either cap would be exceeded.
   */
  reserveUnblocker(usd: number, companyKey?: string | null): boolean {
    const extra = Number(usd) || 0;
    if (extra <= 0) return true;
    return this.locked(() => {
      this.hydrate();
      if (this.capUsd != null && this.usd + extra > this.capUsd) return false;
      if (companyKey && (this.companies.get(companyKey) || 0) >= this.companyCapUsd) return false;
      this.usd = Number((this.usd + extra).toFixed(4));
      this.unblockerUsd = Number((this.unblockerUsd + extra).toFixed(4));
      this.unblockerRequests += 1;
      if (companyKey) {
        this.companies.set(companyKey, Number(((this.companies.get(companyKey) || 0) + extra).toFixed(4)));
      }
      this.flush();
      return true;
    });
  }

  /**
   * Charge one or more Serper credits against the same TOTAL_MAX_USD ledger.
   * Returns false (and does not call the vendor) when the total cap or the
   * per-company query cap would be exceeded.
   */
  reserveSerper(credits = 1, companyKey?: string | null): boolean {
    const n = Math.max(0, Math.floor(Number(credits) || 0));
    if (n <= 0) return true;
    const extra = Number((n * SERPER_USD_PER_QUERY).toFixed(4));
    return this.locked(() => {
      this.hydrate();
      if (this.capUsd != null && this.usd + extra > this.capUsd) return false;
      if (companyKey && (this.serperCompanies.get(companyKey) || 0) + n > SERPER_QUERIES_PER_COMPANY) {
        return false;
      }
      this.usd = Number((this.usd + extra).toFixed(4));
      this.serperCredits += n;
      this.serperQueries += n;
      if (companyKey) {
        this.serperCompanies.set(companyKey, (this.serperCompanies.get(companyKey) || 0) + n);
      }
      this.flush();
      return true;
    });
  }

  /** Replace a reservation with billed usage (delta may be negative). Always counts a run. */
  commit(
    actualUsd: number,
    reservedUsd: number,
    opts?: { cu?: number; lookups?: number; proxyGb?: number; companyKey?: string | null },
  ): void {
    const actual = Number(actualUsd) || 0;
    const reserved = Number(reservedUsd) || 0;
    const delta = Number((actual - reserved).toFixed(4));
    this.locked(() => {
      this.hydrate();
      this.usd = Number((this.usd + delta).toFixed(4));
      this.apifyUsd = Number((this.apifyUsd + delta).toFixed(4));
      if (this.usd < 0) this.usd = 0;
      if (this.apifyUsd < 0) this.apifyUsd = 0;
      this.runs += 1;
      this.lookups += opts?.lookups ?? 1;
      if (opts?.cu) this.computeUnits += opts.cu;
      const gb = Number(opts?.proxyGb) || 0;
      if (gb > 0) this.proxyGb = Number((this.proxyGb + gb).toFixed(6));
      if (opts?.companyKey) {
        const next = Number(((this.companies.get(opts.companyKey) || 0) + delta).toFixed(4));
        this.companies.set(opts.companyKey, Math.max(0, next));
      }
      this.flush();
    });
  }

  release(reservedUsd: number, companyKey?: string | null): void {
    const reserved = Number(reservedUsd) || 0;
    if (reserved <= 0) return;
    this.locked(() => {
      this.hydrate();
      this.usd = Number((this.usd - reserved).toFixed(4));
      this.apifyUsd = Number((this.apifyUsd - reserved).toFixed(4));
      if (this.usd < 0) this.usd = 0;
      if (this.apifyUsd < 0) this.apifyUsd = 0;
      if (companyKey) {
        const next = Number(((this.companies.get(companyKey) || 0) - reserved).toFixed(4));
        this.companies.set(companyKey, Math.max(0, next));
      }
      this.flush();
    });
  }

  refuse(): void {
    this.locked(() => {
      this.hydrate();
      this.refused += 1;
      this.flush();
    });
  }

  add(usd: number, opts?: { cu?: number; lookups?: number; proxyGb?: number; companyKey?: string | null }): void {
    const extra = Number(usd) || 0;
    const gb = Number(opts?.proxyGb) || 0;
    if (extra <= 0 && !opts?.cu && gb <= 0) return;
    this.locked(() => {
      this.hydrate();
      this.usd = Number((this.usd + extra).toFixed(4));
      this.apifyUsd = Number((this.apifyUsd + extra).toFixed(4));
      this.runs += 1;
      this.lookups += opts?.lookups ?? 1;
      if (opts?.cu) this.computeUnits += opts.cu;
      if (gb > 0) this.proxyGb = Number((this.proxyGb + gb).toFixed(6));
      if (opts?.companyKey && extra > 0) {
        this.companies.set(
          opts.companyKey,
          Number(((this.companies.get(opts.companyKey) || 0) + extra).toFixed(4)),
        );
      }
      this.flush();
    });
  }

  snapshot(): {
    apify_usd_spent: number;
    total_usd_spent: number;
    apify_runs: number;
    apify_lookups: number;
    apify_compute_units: number;
    apify_proxy_gb: number;
    serper_credits: number;
    serper_queries: number;
    serper_usd: number;
  } {
    if (this.persistPath) this.locked(() => this.hydrate());
    return {
      apify_usd_spent: Number(this.apifyUsd.toFixed(2)),
      total_usd_spent: Number(this.usd.toFixed(4)),
      apify_runs: this.runs,
      apify_lookups: this.lookups,
      apify_compute_units: Number(this.computeUnits.toFixed(4)),
      apify_proxy_gb: Number(this.proxyGb.toFixed(4)),
      serper_credits: this.serperCredits,
      serper_queries: this.serperQueries,
      serper_usd: Number((this.serperCredits * SERPER_USD_PER_QUERY).toFixed(4)),
    };
  }
}

export class SerperCreditTracker {
  credits = 0;
  queries = 0;

  add(credits = 1): void {
    const n = Number(credits) || 0;
    if (n <= 0) return;
    this.credits += n;
    this.queries += 1;
  }

  get usd(): number {
    return Number((this.credits * SERPER_USD_PER_QUERY).toFixed(4));
  }

  snapshot(): { serper_credits: number; serper_queries: number; serper_usd: number } {
    return {
      serper_credits: this.credits,
      serper_queries: this.queries,
      serper_usd: this.usd,
    };
  }
}

export function estimateSerperCredits(rowCount: number): number {
  return Math.max(0, rowCount) * SERPER_QUERIES_PER_ROW;
}

export function estimateSerperUsd(rowCount: number): number {
  return Number((estimateSerperCredits(rowCount) * SERPER_USD_PER_QUERY).toFixed(4));
}

export function proxyGbFromApifyRun(
  run: {
    usage?: Record<string, number>;
    stats?: { netRxBytes?: number; netTxBytes?: number };
  } | null | undefined,
): number {
  const usage = run?.usage || {};
  const fromUsage = Number(
    usage.PROXY_RESIDENTIAL_TRANSFER_GBYTES ||
      usage.PROXY_RESIDENTIAL_GBYTES ||
      usage['proxy-residential-transfer-gbytes'] ||
      0,
  );
  if (fromUsage > 0) return Number(fromUsage.toFixed(6));
  const bytes = Number(run?.stats?.netRxBytes || 0) + Number(run?.stats?.netTxBytes || 0);
  if (bytes > 0) return Number((bytes / 1e9).toFixed(6));
  return 0;
}

export interface ApifyRunPricingEvent {
  eventKey?: string;
  eventName?: string;
  eventTitle?: string;
  eventPriceUsd?: number;
  priceUsd?: number;
}

export interface ApifyRunBillShape {
  usageTotalUsd?: number;
  usageUsd?: number;
  usage?: Record<string, number>;
  stats?: { computeUnits?: number; netRxBytes?: number; netTxBytes?: number };
  status?: string;
  id?: string;
  economics?: { totalUsd?: number };
  chargedEventCounts?: Record<string, number>;
  pricingInfo?: {
    pricingModel?: string;
    pricingPerEvent?: {
      actorChargeEvents?: Record<string, { eventPriceUsd?: number; eventTitle?: string }>;
      actorChargeItems?: ApifyRunPricingEvent[];
    };
  };
}

function reportedUsageTotalUsd(run: ApifyRunBillShape | null | undefined): number {
  const n = Number(run?.usageTotalUsd ?? run?.usageUsd ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function eventPriceMap(run: ApifyRunBillShape | null | undefined): Map<string, number> {
  const prices = new Map<string, number>();
  const events = run?.pricingInfo?.pricingPerEvent?.actorChargeEvents || {};
  for (const [key, row] of Object.entries(events)) {
    const p = Number(row?.eventPriceUsd);
    if (key && Number.isFinite(p) && p > 0) prices.set(key, p);
  }
  for (const item of run?.pricingInfo?.pricingPerEvent?.actorChargeItems || []) {
    const key = String(item.eventKey || item.eventName || item.eventTitle || '').trim();
    const p = Number(item.eventPriceUsd ?? item.priceUsd);
    if (key && Number.isFinite(p) && p > 0) prices.set(key, p);
  }
  return prices;
}

/** Pay-per-event USD: chargedEventCounts × prices from the finished run's pricingInfo. */
export function eventUsdFromApifyRun(run: ApifyRunBillShape | null | undefined): number {
  const counts = run?.chargedEventCounts || {};
  const prices = eventPriceMap(run);
  let sum = 0;
  for (const [key, raw] of Object.entries(counts)) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    const price = prices.get(key);
    if (price == null || !(price > 0)) continue;
    sum += n * price;
  }
  return Number(sum.toFixed(6));
}

export function runHasBillData(run: ApifyRunBillShape | null | undefined): boolean {
  // chargedEventCounts alone is not a complete bill — usageTotalUsd often lands
  // only after a follow-up GET of the finished run.
  if (reportedUsageTotalUsd(run) > 0) return true;
  if (Number(run?.economics?.totalUsd) > 0) return true;
  return false;
}

export function usdFromApifyRun(
  run: ApifyRunBillShape | null | undefined,
  opts?: { succeeded?: boolean; started?: boolean },
): {
  usd: number;
  cu: number;
  proxyGb: number;
  eventUsd: number;
} {
  const cu = Number(run?.stats?.computeUnits || run?.usage?.ACTOR_COMPUTE_UNITS || 0);
  const proxyGb = proxyGbFromApifyRun(run);
  const succeeded = opts?.succeeded ?? run?.status === 'SUCCEEDED';
  const started = opts?.started ?? Boolean(run?.id);
  const usage = reportedUsageTotalUsd(run);
  const eventUsd = eventUsdFromApifyRun(run);
  const economics = Number(run?.economics?.totalUsd);
  // Platform total when Apify reports it; otherwise usageTotalUsd plus PPE events.
  let usd = 0;
  if (Number.isFinite(economics) && economics > 0) usd = economics;
  else if (usage > 0 || eventUsd > 0) usd = Number((usage + eventUsd).toFixed(6));
  else if (cu > 0) usd = cu * APIFY_USD_PER_COMPUTE_UNIT;
  else if (started) usd = APIFY_USD_PER_BLOCKED_LOOKUP;
  else if (succeeded) usd = APIFY_USD_PER_BLOCKED_LOOKUP;
  return { usd, cu, proxyGb, eventUsd };
}

export function estimateCaBatchUsd(companyCount: number): number {
  if (companyCount <= 0) return 0;
  const runs = Math.ceil(companyCount / CA_BATCH_COMPANIES_PER_RUN);
  return Number((runs * CA_BATCH_USD_BASE + companyCount * CA_BATCH_USD_PER_COMPANY).toFixed(2));
}

export const CA_HYBRID_MAX_RESULTS_DEFAULT = 3;

/** Ceiling for dz_omar search+history (one run) plus web-fetch SI PDFs. FREE-tier event prices. */
export function estimateCaHybridUsd(
  companyCount: number,
  maxResultsPerQuery = CA_HYBRID_MAX_RESULTS_DEFAULT,
): number {
  const n = Math.max(0, companyCount);
  if (!n) return 0;
  const perRecord = Math.max(1, Math.min(50, Math.floor(maxResultsPerQuery) || CA_HYBRID_MAX_RESULTS_DEFAULT));
  const start = 0.005;
  const search = 0.025 * n;
  const records = 0.003 * n * perRecord;
  const history = 0.004 * n * perRecord;
  const pdf = 0.002 * n;
  return Number((start + search + records + history + pdf).toFixed(2));
}
