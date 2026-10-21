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

export type HardTechnique = 'li_title' | 'aggregator';
const OWNER_TITLE = /\b(owner|co-owner|founder|co-founder|president|ceo|principal|proprietor|managing member)\b/i;
const OWNER_CLAUSE = '("Owner" OR "Founder" OR "President" OR "CEO" OR "Principal" OR "Co-Owner")';

export function hardQuery(t: HardTechnique, company: string): string {
  if (t === 'li_title') return `site:linkedin.com/in "${company}" ${OWNER_CLAUSE}`;
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

const GENERIC = new Set(
  'AUTO SHOP REPAIR SERVICE SERVICES DENTAL ORAL ADVANCED CARE HOME HOMES PLUMBING HEATING COOLING AIR ELECTRIC ROOFING CLEANING MAIDS POOL LAWN LANDSCAPING CONSTRUCTION GROUP CENTER CAFE CAFFE BAKERY CITY COUNTY NORTH SOUTH EAST WEST CAROLINA DAKOTA VIRGINIA JERSEY YORK FLORIDA TEXAS GEORGIA ARIZONA CALIFORNIA BEST TOP GREAT FAMILY OWNED LOCAL TEAM STAFF CONTACT REVIEWS MECHANICAL PEST CONTROL'.split(' '),
);
/** Place / generic-word "names" scraped off pages. Pure. */
export function isGenericName(raw: string): boolean {
  const toks = raw.toUpperCase().replace(/[^A-Z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  return !toks.length || toks.some((t) => GENERIC.has(t));
}
const FRANCHISE =
  /\b(two maids|molly maid|merry maids|servpro|servicemaster|roto-rooter|mr\.? rooter|one hour|benjamin franklin|mister sparky|aire serv|mr\.? electric|mosquito joe|lawn doctor|weed man|chem-?dry|stanley steemer|jani-?king|coverall|the grounds guys|window genie|glass doctor|precision garage|meineke|midas|jiffy lube|valvoline|maaco|aspen dental|orkin|terminix|truly nolen|re\/?max|keller williams|century 21|coldwell banker|state farm|allstate|edward jones|h&r block|jackson hewitt|great clips|supercuts|anytime fitness|orangetheory|kumon|mathnasium|the ups store|sir speedy|minuteman press|fastsigns|1-800|mr\.? handyman|handyman connection|budget blinds|bath fitter|re-bath|five star painting|certapro|college hunks|junk king)\b/i;
export function isFranchiseBrand(company: string): boolean {
  return FRANCHISE.test(company);
}
/** Accept rule: surname appears in the company name, or two techniques agree. Pure. */
export function acceptHardName(name: string, company: string, agreeCount: number): boolean {
  if (isGenericName(name)) return false;
  if (agreeCount >= 2) return true;
  const last = name.trim().split(/\s+/).pop() || '';
  return last.length >= 3 && normCompany(company).includes(last.toUpperCase().replace(/[^A-Z]/g, ''));
}

export async function resolveHardToFind(
  input: NameLookupInput,
  ctx?: LookupContext,
  techniques: HardTechnique[] = ['li_title', 'aggregator'],
): Promise<{ people: WaterfallOwnerHit[]; technique: HardTechnique | 'both' | null; credits: number }> {
  const company = coreCompanySearchName(input.company_name) || input.company_name;
  if (isFranchiseBrand(input.company_name)) return { people: [], technique: null, credits: 0 };
  let credits = 0;
  const found = new Map<string, { techs: Set<HardTechnique>; url: string }>();
  for (const t of techniques) {
    const res = await serperSearch(hardQuery(t, company), ctx);
    credits += 1;
    for (const hit of res.organic || []) {
      const raw = parseHardHit(t, hit, company);
      if (!raw || isGenericName(raw)) continue;
      if (!validateOfficerPersonName(raw, [input.city]).ok) continue;
      const key = raw.toUpperCase().replace(/\s+/g, ' ').trim();
      const v = found.get(key) || { techs: new Set<HardTechnique>(), url: String(hit.link || '') };
      v.techs.add(t);
      found.set(key, v);
    }
    // Stop early on a surname-in-company hit.
    if ([...found.entries()].some(([n, v]) => acceptHardName(n, input.company_name, v.techs.size))) break;
  }
  const ranked = [...found.entries()]
    .filter(([n, v]) => acceptHardName(n, input.company_name, v.techs.size))
    .sort((a, b) => b[1].techs.size - a[1].techs.size);
  const best = ranked[0];
  if (!best) return { people: [], technique: null, credits };
  const split = splitPersonName(best[0]);
  if (!split.first_name || !split.last_name) return { people: [], technique: null, credits };
  const techs = [...best[1].techs];
  const person = {
    ...attachConfidence({
      first_name: split.first_name,
      last_name: split.last_name,
      title: 'Owner',
      company_name: input.company_name,
      domain: input.domain ?? null,
      source_url: best[1].url,
      confidence: 'high',
      state: input.state,
      source: 'hard_to_find',
      role: 'owner',
      coverage_reason: null,
    } as WaterfallOwnerHit),
    confidence: 'high' as const,
    confidence_score: techs.length >= 2 ? 0.85 : 0.8,
  };
  return { people: [person], technique: techs.length >= 2 ? 'both' : techs[0], credits };
}
