import {
  extractTitleAdjacentPeople,
  isJobTitlePersonName,
  normalizeCompanyName,
  normalizeState,
  pageMentionsPerson,
  validateOfficerPersonName,
  validateWebsitePersonName,
} from '../names.js';
import type { LookupContext } from './context.js';
import { attachConfidence } from './confidence.js';
import { lookupFindNamedPerson } from './findNamedPerson.js';
import { officersFromSerperBlob } from './serperOwners.js';
import { parseOfficerRoster } from './officers.js';
import { organicFromSerperPayload, serperSearch } from './serper.js';
import { SERPER_USD_PER_QUERY } from './spend.js';
import { domainFromWebsite, fetchSiteText, originFromInput } from './siteFetch.js';
import type { NameLookupInput, NameLookupResult, WaterfallOwnerHit } from './types.js';
import { samePerson } from './waterfall.js';

const ABOUT_PATHS = ['/about', '/about-us', '/our-story', '/team', '/our-team'];

export function linkedinOwnerQuery(input: NameLookupInput): string {
  const company = String(input.company_name || '').trim();
  const city = String(input.city || '').trim();
  const state = normalizeState(input.state);
  return `site:linkedin.com/in owner OR founder OR president "${company}" ${city} ${state}`.replace(/\s+/g, ' ').trim();
}

export function linkedinInSlug(url: string): string | null {
  const raw = String(url || '');
  const m = raw.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).replace(/\/+$/, '');
  } catch {
    return m[1].replace(/\/+$/, '');
  }
}

/** Profile name must appear in the /in/ slug tokens (first and last). */
export function linkedinSlugAgreesWithName(
  url: string,
  first: string | null | undefined,
  last: string | null | undefined,
): boolean {
  const slug = linkedinInSlug(url);
  if (!slug || !first || !last) return false;
  const tokens = slug
    .toLowerCase()
    .split(/[-_]+/)
    .map((t) => t.replace(/\d+/g, ''))
    .filter((t) => t.length >= 2);
  const firstN = String(first).toLowerCase().replace(/[^a-z]/g, '');
  const lastN = String(last).toLowerCase().replace(/[^a-z]/g, '');
  if (firstN.length < 2 || lastN.length < 2 || tokens.length < 2) return false;
  const firstHit = tokens.some((t) => t === firstN || t.startsWith(firstN) || firstN.startsWith(t));
  const lastHit = tokens.some((t) => t === lastN || t.startsWith(lastN) || lastN.startsWith(t));
  return firstHit && lastHit;
}

function hitFromAbout(
  input: NameLookupInput,
  name: string,
  title: string,
  url: string,
  corroborated = false,
): WaterfallOwnerHit | null {
  const verdict = validateWebsitePersonName(name, [input.city]);
  if (!verdict.ok) return null;
  return attachConfidence(
    {
      first_name: verdict.first_name,
      last_name: verdict.last_name,
      title: title || 'Owner',
      company_name: input.company_name,
      domain: input.domain ?? domainFromWebsite(input.website),
      source_url: url,
      confidence: 'medium',
      state: input.state,
      source: 'website',
      role: /founder/i.test(title) ? 'owner' : /president/i.test(title) ? 'officer' : 'owner',
      coverage_reason: null,
      corroborated,
    },
    { title_leadership: true, city_match: true, corroborated },
  );
}

function peopleFromAboutText(
  input: NameLookupInput,
  text: string,
  url: string,
  corroborators: WaterfallOwnerHit[] = [],
): WaterfallOwnerHit[] {
  const out: WaterfallOwnerHit[] = [];
  const push = (hit: WaterfallOwnerHit | null) => {
    if (!hit || !hit.last_name) return;
    if (out.some((p) => samePerson(p, hit))) return;
    out.push(hit);
  };

  for (const row of extractTitleAdjacentPeople(text)) {
    push(hitFromAbout(input, row.name, row.title, url));
  }
  for (const row of parseOfficerRoster(text)) {
    push(hitFromAbout(input, row.name, row.title, url));
  }
  for (const row of officersFromSerperBlob(text, input.company_name, input)) {
    push(hitFromAbout(input, row.name, row.title, url));
  }
  const founded = text.match(
    /\b(?:founded|owned|started)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s*[,–—-]\s*(Owner|Founder|President|CEO|Principal))?/i,
  );
  if (founded?.[1]) {
    push(hitFromAbout(input, founded[1], founded[2] || 'Founder', url));
  }

  for (const person of corroborators) {
    const existing = out.find((p) => samePerson(p, person));
    if (existing) {
      existing.corroborated = true;
      Object.assign(
        existing,
        attachConfidence(existing, { title_leadership: true, city_match: true, corroborated: true }),
      );
      continue;
    }
    if (!pageMentionsPerson(text, person.first_name, person.last_name)) continue;
    const full = `${person.first_name} ${person.last_name}`;
    push(hitFromAbout(input, full, person.title || 'Owner', url, true));
  }
  return out;
}

async function fromAboutPage(
  input: NameLookupInput,
  ctx: LookupContext | undefined,
  corroborators: WaterfallOwnerHit[],
): Promise<WaterfallOwnerHit | null> {
  const origin = originFromInput(input);
  if (!origin) return null;
  for (const path of ABOUT_PATHS) {
    const page = await fetchSiteText(`${origin}${path}`, ctx);
    if (page.blocked || !page.text) continue;
    const people = peopleFromAboutText(input, page.text, page.url, corroborators);
    if (people[0]) return people[0];
  }
  return null;
}

function profileNameFromLinkedInRow(title: string, snippet: string): string {
  const rawTitle = String(title || '').trim();
  const left = rawTitle.split(/\s*[-|–—]\s*/)[0] || '';
  if (left && !isJobTitlePersonName(left) && validateOfficerPersonName(left).ok) return left;
  const officers = officersFromSerperBlob(`${rawTitle} ${snippet}`, '', undefined);
  if (officers[0]?.name && !isJobTitlePersonName(officers[0].name)) return officers[0].name;
  return '';
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
    const name = profileNameFromLinkedInRow(row.title || '', row.snippet || '');
    if (!name || isJobTitlePersonName(name)) continue;
    const verdict = validateOfficerPersonName(name, [input.city]);
    if (!verdict.ok) continue;
    if (!linkedinSlugAgreesWithName(url, verdict.first_name, verdict.last_name)) continue;
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
          confidence: 'high',
          state: input.state,
          source: 'linkedin',
          role: 'owner',
          coverage_reason: null,
        },
        { title_leadership: true, city_match: true, serper_score: 0.8, slug_agreed: true },
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
  corroborators: WaterfallOwnerHit[] = [],
): Promise<NameLookupResult> {
  let credits = 0;
  const li = await fromLinkedInSerper(input, ctx);
  credits += li.credits;
  const about = await fromAboutPage(input, ctx, [...corroborators, ...(li.hit ? [li.hit] : [])]);

  if (about && li.hit && samePerson(about, li.hit)) {
    about.corroborated = true;
    li.hit.corroborated = true;
    const scoredAbout = attachConfidence(about, {
      title_leadership: true,
      city_match: true,
      corroborated: true,
    });
    const scoredLi = attachConfidence(li.hit, {
      title_leadership: true,
      city_match: true,
      serper_score: 0.8,
      slug_agreed: true,
      corroborated: true,
    });
    return {
      people: [scoredLi, scoredAbout],
      coverage_reason: null,
      source: 'linkedin',
      source_url: scoredLi.source_url,
      implemented: true,
      via_serper: credits > 0,
      serper_credits: credits,
      serper_usd: Number((credits * SERPER_USD_PER_QUERY).toFixed(4)),
    };
  }
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
  if (about) {
    return {
      people: [about],
      coverage_reason: null,
      source: 'website',
      source_url: about.source_url,
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
