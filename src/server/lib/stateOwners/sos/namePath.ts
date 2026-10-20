import { normalizeState } from '../names.js';
import { catalogByCode, isAgentOnlySkipState } from './catalog.js';
import { resolveAgentFallback } from './agentFallback.js';
import { resolveDbaLegalName } from './dbaResolver.js';
import {
  caBizfileSourceUrl,
  matchCaBizfileFromPayload,
  searchCaBizfileOnline,
  type CaBizfileEntity,
} from './caBizfile.js';
import { fetchCaStatementOfficers } from './caSi.js';
import type { LookupContext } from './context.js';
import { ensureIlDtaIndex, matchIlDta, IL_DTA_HOME } from './ilDta.js';
import { HTML_REGISTRY_STATES, resolveHtmlOfficerState, type HtmlOfficerState } from './htmlStates.js';
import { domainFromWebsite } from './siteFetch.js';
import { resolveColoradoAgentOnly, resolveOhioAgentOnly } from './agentStates.js';
import { hitsFromRoster } from './officers.js';
import { SERPER_USD_PER_QUERY } from './spend.js';
import { resolveSerperOwner, serperIsHighConfidence } from './serperOwners.js';
import type { NameLookupInput, NameLookupResult } from './types.js';
import { agentOnlyHit, isWaterfallReady, samePerson } from './waterfall.js';

export function emptyNameResult(
  input: NameLookupInput,
  coverage: NameLookupResult['coverage_reason'],
  source: NameLookupResult['source'] = 'us_sos',
  extra?: Partial<NameLookupResult>,
): NameLookupResult {
  return {
    people: [],
    coverage_reason: coverage,
    source,
    implemented: extra?.implemented ?? false,
    ...extra,
  };
}

function withSpend(result: NameLookupResult, usd: number, via: boolean, ocr?: boolean): NameLookupResult {
  return {
    ...result,
    apify_usd: Number(((result.apify_usd || 0) + usd).toFixed(4)),
    via_apify: result.via_apify || via,
    ocr_used: result.ocr_used || ocr,
  };
}

function withSerperMeta(result: NameLookupResult, serper: NameLookupResult): NameLookupResult {
  return {
    ...result,
    via_serper: Boolean(result.via_serper || serper.via_serper || (serper.serper_credits || 0) > 0),
    serper_credits: (result.serper_credits || 0) + (serper.serper_credits || 0),
    serper_usd: Number(((result.serper_usd || 0) + (serper.serper_usd || 0)).toFixed(4)),
  };
}

function withOfficialSpend(serper: NameLookupResult, official: NameLookupResult): NameLookupResult {
  return {
    ...serper,
    apify_usd: Number(((serper.apify_usd || 0) + (official.apify_usd || 0)).toFixed(4)),
    via_apify: Boolean(serper.via_apify || official.via_apify),
    ocr_used: Boolean(serper.ocr_used || official.ocr_used),
  };
}

async function resolveCalifornia(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult> {
  let payload = ctx?.caPayload;
  let searchUsd = 0;
  let searchViaApify = false;
  if (payload == null) {
    const got = await searchCaBizfileOnline(input.company_name, ctx);
    searchUsd = got.usd;
    searchViaApify = got.via_apify;
    payload = got.payload;
    if (got.blocked && payload == null) {
      return emptyNameResult(input, 'blocked', 'ca_bizfile', {
        implemented: true,
        source_url: caBizfileSourceUrl(null),
        via_apify: searchViaApify,
        apify_usd: searchUsd,
      });
    }
  }
  if (payload == null) {
    return emptyNameResult(input, 'not_found', 'ca_bizfile', {
      implemented: true,
      source_url: caBizfileSourceUrl(null),
      via_apify: searchViaApify,
      apify_usd: searchUsd,
    });
  }

  const matched = matchCaBizfileFromPayload(input.company_name, input.city, payload);
  if (!matched.entity) {
    return emptyNameResult(input, 'not_found', 'ca_bizfile', {
      implemented: true,
      source_url: matched.source_url,
      via_apify: searchViaApify,
      apify_usd: searchUsd,
    });
  }

  const entity: CaBizfileEntity = matched.entity;
  const si = await fetchCaStatementOfficers(entity, ctx);
  const officers = hitsFromRoster(input, si.entries, 'ca_bizfile', si.source_url || matched.source_url, matched.match_method);
  const viaApify = searchViaApify || si.via_apify;
  const usd = Number((searchUsd + (si.usd || 0)).toFixed(4));
  if (officers.length) {
    return withSpend(
      {
        people: officers,
        coverage_reason: null,
        source: 'ca_bizfile',
        source_url: si.source_url || matched.source_url,
        match_method: matched.match_method,
        match_score: matched.match_score,
        entity_id: entity.EntityID || null,
        business_name: entity.EntityName || null,
        implemented: true,
        ocr_used: si.ocr_used,
        via_apify: viaApify,
        apify_usd: usd,
      },
      0,
      viaApify,
      si.ocr_used,
    );
  }

  const agent =
    ctx?.includeAgents === true
      ? agentOnlyHit(input, entity.AgentName || '', 'ca_bizfile', matched.source_url)
      : null;
  return withSpend(
    {
      people: agent ? [agent] : [],
      coverage_reason: 'agent_only',
      source: 'ca_bizfile',
      source_url: matched.source_url,
      match_method: matched.match_method,
      match_score: matched.match_score,
      entity_id: entity.EntityID || null,
      business_name: entity.EntityName || null,
      implemented: true,
      ocr_used: si.ocr_used,
      via_apify: viaApify,
      apify_usd: usd,
    },
    0,
    viaApify,
    si.ocr_used,
  );
}

async function resolveIllinois(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult> {
  const index = await ensureIlDtaIndex(ctx);
  if (!index || !index.list.length) {
    return emptyNameResult(input, 'no_source', 'us_sos', {
      implemented: true,
      source_url: IL_DTA_HOME,
    });
  }
  const matched = matchIlDta(input, index);
  if (!matched) {
    return emptyNameResult(input, 'not_found', 'us_sos', { implemented: true, source_url: IL_DTA_HOME });
  }
  const people = hitsFromRoster(input, matched.entity.officers, 'us_sos', IL_DTA_HOME, matched.method);
  if (people.length) {
    return {
      people,
      coverage_reason: null,
      source: 'us_sos',
      source_url: IL_DTA_HOME,
      match_method: matched.method,
      match_score: matched.score,
      entity_id: matched.entity.file_number,
      business_name: matched.entity.legal_name,
      implemented: true,
    };
  }
  const agent =
    ctx?.includeAgents === true
      ? agentOnlyHit(input, matched.entity.agent_name || '', 'us_sos', IL_DTA_HOME)
      : null;
  return {
    people: agent ? [agent] : [],
    coverage_reason: 'agent_only',
    source: 'us_sos',
    source_url: IL_DTA_HOME,
    match_method: matched.method,
    match_score: matched.score,
    entity_id: matched.entity.file_number,
    business_name: matched.entity.legal_name,
    implemented: true,
  };
}

async function resolveOfficialNameLookup(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<NameLookupResult> {
  const state = normalizeState(input.state);
  const entry = catalogByCode().get(state);
  if (!entry) {
    return emptyNameResult(input, 'no_source');
  }

  if (isAgentOnlySkipState(state)) {
    return emptyNameResult(input, 'agent_only', 'us_sos', {
      implemented: true,
      source_url: entry.search_url,
    });
  }

  if (state === 'CA') return resolveCalifornia(input, ctx);
  if (state === 'IL') return resolveIllinois(input, ctx);
  if ((HTML_REGISTRY_STATES as readonly string[]).includes(state)) {
    return resolveHtmlOfficerState(input, state as HtmlOfficerState, ctx);
  }
  if (state === 'OH') return resolveOhioAgentOnly(input, ctx);
  if (state === 'CO') return resolveColoradoAgentOnly(input, ctx);

  if (entry.officers === 'agent_only' || entry.officers === 'none') {
    return emptyNameResult(input, entry.officers === 'none' ? 'no_source' : 'agent_only', 'us_sos', {
      source_url: entry.search_url,
      implemented: false,
    });
  }

  return emptyNameResult(input, 'not_implemented', 'us_sos', {
    source_url: entry.search_url,
    implemented: false,
  });
}

/**
 * Serper-first for every state. High-confidence Google hits skip SOS/Apify.
 * Apify stays the blocked-HTML fallback behind APIFY_MAX_USD when Serper
 * cannot return a waterfall-ready owner.
 */
function withDba(result: NameLookupResult, dba: Awaited<ReturnType<typeof resolveDbaLegalName>>): NameLookupResult {
  return {
    ...result,
    legal_name: dba.legal_name,
    dba_name: dba.dba_name,
    dba_source: dba.source,
    serper_credits: (result.serper_credits || 0) + (dba.serper_credits || 0),
    serper_usd: Number(((result.serper_usd || 0) + (dba.serper_credits || 0) * SERPER_USD_PER_QUERY).toFixed(4)),
    via_serper: Boolean(result.via_serper || (dba.serper_credits || 0) > 0),
  };
}

function needsAgentFallback(result: NameLookupResult): boolean {
  if (result.people.some((p) => isWaterfallReady(p))) return false;
  return (
    result.coverage_reason === 'agent_only' ||
    result.coverage_reason === 'not_found' ||
    result.coverage_reason === 'not_implemented' ||
    result.coverage_reason === 'no_source' ||
    !result.people.length
  );
}

export async function resolveNameLookup(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<NameLookupResult> {
  const company = String(input.company_name || '').trim();
  const state = normalizeState(input.state);
  if (!company || !state) {
    return emptyNameResult(input, 'not_found');
  }
  if (!input.domain && input.website) {
    input = { ...input, domain: domainFromWebsite(input.website) };
  }

  const dba = await resolveDbaLegalName(input, ctx);
  const lookupInput: NameLookupInput =
    dba.legal_name && dba.legal_name !== company
      ? { ...input, company_name: dba.legal_name }
      : input;

  const serper = await resolveSerperOwner(lookupInput, ctx);
  if (serperIsHighConfidence(serper)) {
    return withDba(serper, dba);
  }

  const official = await resolveOfficialNameLookup(lookupInput, ctx);
  if (official.people.some((p) => isWaterfallReady(p))) {
    return withDba(withSerperMeta(official, serper), dba);
  }

  if (needsAgentFallback(official) || needsAgentFallback(serper)) {
    const fallback = await resolveAgentFallback(lookupInput, ctx);
    for (const person of fallback.people) {
      if (person.source !== 'website') continue;
      if (serper.people.some((p) => samePerson(p, person)) || official.people.some((p) => samePerson(p, person))) {
        person.corroborated = true;
      }
    }
    if (fallback.people.some((p) => isWaterfallReady(p))) {
      return withDba(withSerperMeta(withOfficialSpend(fallback, official), serper), dba);
    }
    if (fallback.people.some((p) => p.source === 'website')) {
      official.people = [...fallback.people, ...official.people];
    }
    if (fallback.serper_credits) {
      official.serper_credits = (official.serper_credits || 0) + fallback.serper_credits;
      official.serper_usd = Number(((official.serper_usd || 0) + (fallback.serper_usd || 0)).toFixed(4));
      official.via_serper = true;
    }
  }

  if (serper.people.length) {
    return withDba(withOfficialSpend(serper, official), dba);
  }
  if (!official.implemented && (serper.via_serper || (serper.serper_credits || 0) > 0)) {
    return withDba(
      withSerperMeta(
        emptyNameResult(input, 'not_found', 'serper', {
          implemented: true,
          source_url: official.source_url,
        }),
        serper,
      ),
      dba,
    );
  }
  return withDba(withSerperMeta(official, serper), dba);
}

export { waterfallHitFromPerson } from './waterfall.js';
