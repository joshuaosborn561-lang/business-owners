import { normalizeCompanyName, normalizeState, validateOfficerPersonName } from '../names.js';
import type { LookupContext } from './context.js';
import { attachConfidence } from './confidence.js';
import { lookupFindNamedPerson } from './findNamedPerson.js';
import { officersFromSerperBlob } from './serperOwners.js';
import { organicFromSerperPayload, serperSearch } from './serper.js';
import { SERPER_USD_PER_QUERY } from './spend.js';
import { fetchSiteText, originFromDomain } from './siteFetch.js';
import type { NameLookupInput, NameLookupResult, WaterfallOwnerHit } from './types.js';

const ABOUT_PATHS = ['/about', '/about-us', '/our-story', '/team', '/our-team'];

export function linkedinOwnerQuery(input: NameLookupInput): string {
  const company = String(input.company_name || '').trim();
  const city = String(input.city || '').trim();
  const state = normalizeState(input.state);
  return `site:linkedin.com/in owner OR founder OR president "${company}" ${city} ${state}`.replace(/\s+/g, ' ').trim();
}

function hitFromAbout(input: NameLookupInput, name: string, title: string, url: string): WaterfallOwnerHit | null {
  const verdict = validateOfficerPersonName(name, [input.city]);
  if (!verdict.ok) return null;
  return attachConfidence(
    {
      first_name: verdict.first_name,
      last_name: verdict.last_name,
      title: title || 'Owner',
      company_name: input.company_name,
      domain: input.domain ?? null,
      source_url: url,
      confidence: 'medium',
      state: input.state,
      source: 'website',
      role: /founder/i.test(title) ? 'owner' : /president/i.test(title) ? 'officer' : 'owner',
      coverage_reason: null,
    },
    { title_leadership: true, city_match: true },
  );
}

function peopleFromAboutText(input: NameLookupInput, text: string, url: string): WaterfallOwnerHit[] {
  const officers = officersFromSerperBlob(text, input.company_name, input);
  const out: WaterfallOwnerHit[] = [];
  for (const row of officers) {
    const hit = hitFromAbout(input, row.name, row.title, url);
    if (hit) out.push(hit);
  }
  const founded = text.match(
    /\b(?:founded|owned|started)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s*[,–—-]\s*(Owner|Founder|President|CEO))?/i,
  );
  if (founded?.[1]) {
    const hit = hitFromAbout(input, founded[1], founded[2] || 'Founder', url);
    if (hit && !out.some((p) => p.last_name === hit.last_name)) out.unshift(hit);
  }
  return out;
}

async function fromAboutPage(input: NameLookupInput, ctx?: LookupContext): Promise<WaterfallOwnerHit | null> {
  const origin = originFromDomain(input.domain);
  if (!origin) return null;
  for (const path of ABOUT_PATHS) {
    const page = await fetchSiteText(`${origin}${path}`, ctx);
    if (page.blocked || !page.text) continue;
    const people = peopleFromAboutText(input, page.text, page.url);
    if (people[0]) return people[0];
  }
  return null;
}

async function fromLinkedInSerper(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<{ hit: WaterfallOwnerHit | null; credits: number }> {
  const payload = await serperSearch(linkedinOwnerQuery(input), ctx);
  const credits = payload.organic ? 1 : 0;
  const city = String(input.city || '').trim().toLowerCase();
  const company = normalizeCompanyName(input.company_name);
  for (const row of organicFromSerperPayload(payload)) {
    const url = String(row.link || '');
    if (!/linkedin\.com\/in/i.test(url)) continue;
    const blob = `${row.title || ''} ${row.snippet || ''}`;
    const blobNorm = normalizeCompanyName(blob);
    if (company && !blobNorm.includes(company.split(' ')[0] || '___')) continue;
    if (city && !blob.toLowerCase().includes(city) && !blob.includes(normalizeState(input.state))) continue;
    const officers = officersFromSerperBlob(blob, input.company_name, input);
    const rowName = (row.title || '').split(/[-|–—]/)[0] || '';
    const name = officers[0]?.name || rowName;
    const verdict = validateOfficerPersonName(name, [input.city]);
    if (!verdict.ok) continue;
    return {
      credits,
      hit: attachConfidence(
        {
          first_name: verdict.first_name,
          last_name: verdict.last_name,
          title: officers[0]?.title || 'Owner',
          company_name: input.company_name,
          domain: input.domain ?? null,
          source_url: url,
          confidence: 'medium',
          state: input.state,
          source: 'linkedin',
          role: 'owner',
          coverage_reason: null,
        },
        { title_leadership: true, city_match: true, serper_score: 0.68 },
      ),
    };
  }
  return { hit: null, credits };
}

/**
 * When SOS returns agent-only (or no officer), try website About, LinkedIn Serper,
 * then find-named-person. Never treats a registered agent as waterfall-ready.
 */
export async function resolveAgentFallback(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<NameLookupResult> {
  let credits = 0;
  const about = await fromAboutPage(input, ctx);
  if (about) {
    return {
      people: [about],
      coverage_reason: null,
      source: 'website',
      source_url: about.source_url,
      implemented: true,
      via_serper: false,
      serper_credits: 0,
      serper_usd: 0,
    };
  }

  const li = await fromLinkedInSerper(input, ctx);
  credits += li.credits;
  if (li.hit) {
    return {
      people: [li.hit],
      coverage_reason: null,
      source: 'linkedin',
      source_url: li.hit.source_url,
      implemented: true,
      via_serper: credits > 0,
      serper_credits: credits,
      serper_usd: Number((credits * SERPER_USD_PER_QUERY).toFixed(4)),
    };
  }

  const named = await lookupFindNamedPerson(input, ctx);
  if (named) {
    return {
      people: [named],
      coverage_reason: null,
      source: 'find_named_person',
      source_url: named.source_url,
      implemented: true,
      via_serper: credits > 0,
      serper_credits: credits,
      serper_usd: Number((credits * SERPER_USD_PER_QUERY).toFixed(4)),
    };
  }

  return {
    people: [],
    coverage_reason: 'agent_only',
    source: 'us_sos',
    implemented: true,
    via_serper: credits > 0,
    serper_credits: credits,
    serper_usd: Number((credits * SERPER_USD_PER_QUERY).toFixed(4)),
  };
}
