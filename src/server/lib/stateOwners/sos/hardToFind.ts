/**
 * Techniques from topup skills/hard-to-find-dm-discovery + serp-dm-discovery,
 * aimed at owners. Each is one Serper query; results are kept only when the
 * parsed company matches the queried company AND the parsed title is an owner
 * title (the skill's mandatory company+title filter).
 *  A  site:linkedin.com/in "{Company}" ("Owner" OR "Founder" ...)  (no city)
 *  B  site:facebook.com "{Company}" owner
 *  C  "{Company}" "owner"  — aggregator key-contact pages (ZoomInfo, RocketReach…)
 */
import { coreCompanySearchName, splitPersonName, validateOfficerPersonName } from '../names.js';
import type { LookupContext } from './context.js';
import { serperSearch } from './serper.js';
import type { NameLookupInput, SerperOrganicHit, WaterfallOwnerHit } from './types.js';
import { attachConfidence } from './confidence.js';
import { normCompany } from './unmask.js';

export type HardTechnique = 'li_title' | 'facebook' | 'aggregator';
const OWNER_TITLE = /\b(owner|co-owner|founder|co-founder|president|ceo|principal|proprietor|managing member)\b/i;
const OWNER_CLAUSE = '("Owner" OR "Founder" OR "President" OR "CEO" OR "Principal" OR "Co-Owner")';

export function hardQuery(t: HardTechnique, company: string): string {
  if (t === 'li_title') return `site:linkedin.com/in "${company}" ${OWNER_CLAUSE}`;
  if (t === 'facebook') return `site:facebook.com "${company}" owner`;
  return `"${company}" "owner" -site:linkedin.com -site:facebook.com`;
}

function companyMatches(text: string, company: string): boolean {
  const want = normCompany(company);
  const got = normCompany(text);
  if (!want || want.length < 4 || !got) return false;
  return got.includes(want) || (got.length >= 6 && want.includes(got));
}

/** Parse one organic hit into a candidate owner name. Pure. */
export function parseHardHit(t: HardTechnique, hit: SerperOrganicHit, company: string): string | null {
  const title = String(hit.title || '');
  const snippet = String(hit.snippet || '');
  // "First Last - Owner - Company | LinkedIn" / "First Last - Owner - Company | ZoomInfo"
  const parts = title.split(/\s+\|\s+/)[0].split(/\s+[-–]\s+/);
  if (parts.length >= 2 && OWNER_TITLE.test(parts[1]) && companyMatches(parts.slice(1).join(' ') + ' ' + snippet, company)) {
    if (t === 'li_title' || companyMatches(parts.slice(2).join(' ') || parts[1], company) || companyMatches(snippet, company)) {
      return parts[0];
    }
  }
  if (t === 'li_title') return null;
  const text = `${title}. ${snippet}`;
  if (!companyMatches(text, company)) return null;
  const pats = [
    /\b([A-Z][a-z]+(?:\s[A-Z]\.?)?\s[A-Z][a-zA-Z'’-]+),?\s+(?:is\s+the\s+|the\s+)?(?:proud\s+)?(?:co-)?(?:owner|founder|president|ceo)\b/,
    /\b(?:owner|founder|president|ceo)(?:\s+and\s+\w+)?\s*(?:is|:|,|-)?\s+([A-Z][a-z]+(?:\s[A-Z]\.?)?\s[A-Z][a-zA-Z'’-]+)\b/,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function resolveHardToFind(
  input: NameLookupInput,
  ctx?: LookupContext,
  techniques: HardTechnique[] = ['li_title', 'aggregator', 'facebook'],
): Promise<{ people: WaterfallOwnerHit[]; technique: HardTechnique | null; credits: number }> {
  const company = coreCompanySearchName(input.company_name) || input.company_name;
  let credits = 0;
  for (const t of techniques) {
    const res = await serperSearch(hardQuery(t, company), ctx);
    credits += 1;
    const votes = new Map<string, { n: number; url: string }>();
    for (const hit of res.organic || []) {
      const raw = parseHardHit(t, hit, company);
      if (!raw) continue;
      if (!validateOfficerPersonName(raw, [input.city]).ok) continue;
      const key = raw.toUpperCase();
      const v = votes.get(key) || { n: 0, url: String(hit.link || '') };
      v.n += 1;
      votes.set(key, v);
    }
    const best = [...votes.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (!best) continue;
    const split = splitPersonName(best[0]);
    if (!split.first_name || !split.last_name) continue;
    const person = attachConfidence({
      first_name: split.first_name,
      last_name: split.last_name,
      title: 'Owner',
      company_name: input.company_name,
      domain: input.domain ?? null,
      source_url: best[1].url,
      confidence: 'medium',
      confidence_score: t === 'li_title' ? 0.8 : 0.7,
      state: input.state,
      source: t === 'li_title' ? 'linkedin' : 'serper',
      role: 'owner',
      coverage_reason: null,
    } as WaterfallOwnerHit);
    return { people: [person], technique: t, credits };
  }
  return { people: [], technique: null, credits };
}
