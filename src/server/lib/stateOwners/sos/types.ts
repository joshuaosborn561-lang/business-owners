import type { BoardSource, CoverageReason, OwnerConfidence, OwnerRole } from '../types.js';

export interface SerperOrganicHit {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
}

export interface SerperSearchResponse {
  organic?: SerperOrganicHit[];
  knowledgeGraph?: { title?: string; description?: string | null };
  credits?: number;
}

export interface SerperPlaceHit {
  title?: string;
  address?: string;
  website?: string;
  link?: string;
  phoneNumber?: string;
}

export interface SerperPlacesResponse {
  places?: SerperPlaceHit[];
  credits?: number;
}

export type DbaSource = 'input_dba' | 'website' | 'serper' | 'maps' | 'fbn' | null;

export type OfficerYield = 'officers' | 'agent_only' | 'filings_pdf' | 'none';
export type SosAccess = 'api_key' | 'open_data' | 'bulk_file' | 'html' | 'reuse_adapter' | 'none';
export type ApifyPolicy = 'fallback' | 'never' | 'already_proxied';

export interface StateSosCatalogEntry {
  code: string;
  name: string;
  office: string;
  search_url: string;
  access: SosAccess;
  officers: OfficerYield;
  signup: string;
  rate_limit: string;
  anti_bot: string;
  apify: ApifyPolicy;
  implement_order: number;
  notes: string;
  existing_adapter?: string;
}

export interface NameLookupInput {
  company_name: string;
  city?: string | null;
  state: string;
  domain?: string | null;
  /** Company website URL or host. Passed through from CSV / MCP `website`. */
  website?: string | null;
  /** Business phone from the Maps row. Joins FMCSA / license / liquor files. */
  phone?: string | null;
  /** Optional mailing / principal address. Used by the LLC unmask step. */
  address?: string | null;
  /** Parcel / tax-bill mailing address (e.g. from permit-pulling parcels). Preferred by the unmask step. */
  mailing_address?: string | null;
  list_id?: string;
  lead_id?: number;
}

/** Fields Email Finder Waterfall name_company mode can consume. Never dump in chat. */
export interface WaterfallOwnerHit {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string;
  domain: string | null;
  source_url: string;
  confidence: OwnerConfidence;
  /** 0–1. Serper high-confidence waterfall_ready requires >= 0.8. */
  confidence_score?: number;
  state: string;
  source: BoardSource;
  role: OwnerRole;
  coverage_reason: CoverageReason | null;
  review_flag?: boolean;
  match_method?: 'exact' | 'substring' | 'trigram' | 'license';
  city_match?: boolean;
  /** Website/About hits need a second source before waterfall_ready. */
  corroborated?: boolean;
  /** Contact fields some public files carry (FMCSA, NPPES, NYC DOB). Candidates for the waterfall to verify. */
  email?: string | null;
  phone?: string | null;
}

export interface NameLookupResult {
  people: WaterfallOwnerHit[];
  coverage_reason: CoverageReason | null;
  source: BoardSource;
  source_url?: string | null;
  match_method?: 'exact' | 'substring' | 'trigram' | 'license';
  match_score?: number;
  entity_id?: string | null;
  business_name?: string | null;
  implemented: boolean;
  apify_usd?: number;
  via_apify?: boolean;
  ocr_used?: boolean;
  via_serper?: boolean;
  serper_credits?: number;
  serper_usd?: number;
  legal_name?: string | null;
  dba_name?: string | null;
  dba_source?: DbaSource;
  /** Registered agent promoted to owner (same_address / surname). */
  agent_promoted?: 'same_address' | 'surname' | 'candidate';
  /** Entity mailing address from the registry; feeds the unmask step. */
  mailing_address?: string | null;
  /** Which open-data source produced the hit (pa_dos, fmcsa, nppes, ...). */
  open_data_source?: string | null;
  /** USD spent on the unblocker (residential fetch API) for this row. */
  unblocker_usd?: number;
  via_unblocker?: boolean;
}

export type BusinessOwnerJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'stopped';

export interface BusinessOwnerJobHitRate {
  attempted: number;
  named: number;
  agent_only: number;
  hit_rate: number;
}

export interface BusinessOwnerNamelessSample {
  source: BoardSource;
  coverage_reason: CoverageReason | null;
  implemented: boolean;
  match_method: NameLookupResult['match_method'] | null;
  people_count: number;
  waterfall_ready: boolean;
  via_apify?: boolean;
  via_serper?: boolean;
  ocr_used?: boolean;
}

export interface BusinessOwnerJobSnapshot {
  job_id: string;
  status: BusinessOwnerJobStatus;
  dry_run: boolean;
  estimate_only: boolean;
  processed: number;
  named: number;
  agent_only: number;
  remaining: number;
  hit_rate_by_state: Record<string, BusinessOwnerJobHitRate>;
  apify_estimate_usd: number;
  apify_usd_spent: number;
  apify_compute_units?: number;
  apify_proxy_gb?: number;
  ca_batch?: boolean;
  ca_debug?: boolean;
  via_apify: number;
  serper_estimate_credits: number;
  serper_estimate_usd: number;
  serper_credits: number;
  serper_usd: number;
  via_serper: number;
  results_saved?: number;
  results_db?: boolean;
  results_save_error?: string;
  unblocker_estimate_usd?: number;
  unblocker_usd?: number;
  unblocker_requests?: number;
  via_open_data?: number;
  ocr_used: number;
  writes_enabled: boolean;
  phase: number;
  sample?: BusinessOwnerNamelessSample[];
  error?: string;
  started_at?: string;
  finished_at?: string;
}
