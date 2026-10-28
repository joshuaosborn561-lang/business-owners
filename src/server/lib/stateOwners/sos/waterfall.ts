import { isNonOwnerTitle, checkPlausiblePersonName } from '../personName.js';
import { isRegistryAgentName, splitPersonName, validateOfficerPersonName } from '../names.js';
import type { BoardSource, CoverageReason, OwnerConfidence, OwnerPerson, OwnerRole } from '../types.js';
import { attachConfidence } from './confidence.js';
import type { NameLookupInput, WaterfallOwnerHit } from './types.js';

const ROLE_TITLE: Record<OwnerRole, string> = {
  owner: 'Owner',
  qualifying_individual: 'Qualifying Individual',
  officer: 'Officer',
  registered_agent: 'Registered Agent',
  member: 'Member',
  sole_proprietor: 'Sole Proprietor',
};

export function waterfallHitFromPerson(
  input: NameLookupInput,
  person: OwnerPerson,
  coverage: CoverageReason | null,
): WaterfallOwnerHit {
  return attachConfidence({
    first_name: person.first_name,
    last_name: person.last_name,
    title: ROLE_TITLE[person.role] || person.role,
    company_name: input.company_name,
    domain: input.domain ?? null,
    source_url: person.source_url,
    confidence: person.confidence,
    state: input.state,
    source: person.source,
    role: person.role,
    coverage_reason: coverage,
    review_flag: person.review_flag,
  });
}

export function agentOnlyHit(
  input: NameLookupInput,
  rawName: string,
  source: BoardSource,
  sourceUrl: string,
): WaterfallOwnerHit | null {
  const cleaned = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || isRegistryAgentName(cleaned)) return null;
  const split = splitPersonName(cleaned);
  return attachConfidence({
    first_name: split.first_name,
    last_name: split.last_name,
    title: ROLE_TITLE.registered_agent,
    company_name: input.company_name,
    domain: input.domain ?? null,
    source_url: sourceUrl,
    confidence: 'low',
    state: input.state,
    source,
    role: 'registered_agent',
    coverage_reason: 'agent_only',
  });
}

const NON_REGISTRY_SOURCES = new Set(['linkedin', 'website', 'serper', 'hard_to_find', 'find_named_person', 'unmask_address', 'maps', 'dba']);

export function isWaterfallReady(hit: WaterfallOwnerHit): boolean {
  if (hit.coverage_reason === 'agent_only' || hit.role === 'registered_agent') return false;
  if (
    hit.coverage_reason === 'blocked' ||
    hit.coverage_reason === 'not_found' ||
    hit.coverage_reason === 'no_source' ||
    hit.coverage_reason === 'not_implemented'
  ) {
    return false;
  }
  if (!hit.source_url) return false;
  if (hit.review_flag) return false;
  if (!hit.first_name || !hit.last_name) return false;
  if (!validateOfficerPersonName(`${hit.first_name} ${hit.last_name}`).ok) return false;
  if (!checkPlausiblePersonName(hit.first_name, hit.last_name).ok) return false;
  // Web-sourced hits: a Manager / Supervisor / Assistant is not the owner. Registry rosters keep their own role logic.
  if (NON_REGISTRY_SOURCES.has(String(hit.source)) && isNonOwnerTitle(hit.title)) return false;
  if (hit.source === 'serper' && hit.confidence !== 'high') return false;
  if (hit.confidence === 'low') return false;
  if (hit.source === 'website' && hit.corroborated !== true && (hit.confidence_score ?? 0) < 0.8) {
    return false;
  }
  if (hit.source === 'ca_bizfile' && hit.match_method === 'trigram' && hit.city_match !== true) {
    return false;
  }
  return true;
}

export function samePerson(
  a: { first_name?: string | null; last_name?: string | null },
  b: { first_name?: string | null; last_name?: string | null },
): boolean {
  const firstA = String(a.first_name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const lastA = String(a.last_name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const firstB = String(b.first_name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const lastB = String(b.last_name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!firstA || !lastA || !firstB || !lastB) return false;
  return firstA === firstB && lastA === lastB;
}

export function ownerConfidenceFromMatch(method: 'exact' | 'substring' | 'trigram' | 'license' | undefined): OwnerConfidence {
  if (method === 'trigram') return 'low';
  if (method === 'substring') return 'medium';
  return 'high';
}

const COMMERCIAL_AGENT =
  /\b(LLC|L\.L\.C|INC|CORP|COMPANY|SERVICES?|AGENTS?|REGISTERED|INCORPORAT|LAW|LEGAL|ATTORNEYS?|CPA|ACCOUNTING|TAX|TRUST|BANK|GROUP|PARTNERS|LLP|PLLC|P\.?C\.?|ASSOCIATES)\b/i;

function normAddr(a: string | null | undefined): string {
  return String(a || '').toUpperCase().replace(/\b(SUITE|STE|UNIT|APT|#)\b.*$/, '').replace(/[^A-Z0-9]/g, '');
}

/**
 * A registered agent who is an individual is an owner candidate on small
 * entities. Auto-accept when the agent sits at the business's own address, or
 * the agent's surname is in the company name. Otherwise not waterfall-ready.
 */
export function promoteAgentCandidate(
  input: NameLookupInput,
  rawName: string,
  source: BoardSource,
  sourceUrl: string,
  opts: { agentAddress?: string | null; businessAddress?: string | null } = {},
): { hit: WaterfallOwnerHit; accepted: boolean; reason: 'same_address' | 'surname' | 'candidate' } | null {
  const cleaned = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || isRegistryAgentName(cleaned) || COMMERCIAL_AGENT.test(cleaned)) return null;
  if (!validateOfficerPersonName(cleaned).ok) return null;
  const split = splitPersonName(cleaned);
  if (!split.first_name || !split.last_name) return null;
  const a = normAddr(opts.agentAddress);
  const b = normAddr(opts.businessAddress);
  const sameAddress = Boolean(a && b && a.length >= 6 && a === b);
  const companyKey = String(input.company_name || '').toUpperCase().replace(/[^A-Z]/g, '');
  const last = String(split.last_name).toUpperCase().replace(/[^A-Z]/g, '');
  const surname = last.length >= 3 && companyKey.includes(last);
  const accepted = sameAddress || surname;
  const hit = attachConfidence({
    first_name: split.first_name,
    last_name: split.last_name,
    title: 'Owner (registered agent)',
    company_name: input.company_name,
    domain: input.domain ?? null,
    source_url: sourceUrl,
    confidence: accepted ? 'high' : 'low',
    state: input.state,
    source,
    role: accepted ? 'owner' : 'registered_agent',
    coverage_reason: accepted ? null : 'agent_only',
    review_flag: !accepted,
  });
  return { hit, accepted, reason: sameAddress ? 'same_address' : surname ? 'surname' : 'candidate' };
}
