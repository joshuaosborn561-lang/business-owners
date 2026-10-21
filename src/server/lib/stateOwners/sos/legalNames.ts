/**
 * Trade name → legal-name candidates so state registries match.
 *  - nameVariants: free string variants (strip " - City", "(...)", "of City", "| tagline").
 *  - registryLegalNames: one Serper query limited to the state's indexed registry
 *    pages (OpenCorporates public company pages per jurisdiction, or the state's
 *    own business-search domain). Titles carry the registered entity name.
 */
import { normalizeState } from '../names.js';
import type { LookupContext } from './context.js';
import { ilNormName } from './ilLlc.js';
import { serperSearch } from './serper.js';
import type { NameLookupInput } from './types.js';

export const STATE_REGISTRY_SITE: Record<string, string> = {
  FL: 'opencorporates.com/companies/us_fl',
  CO: 'opencorporates.com/companies/us_co',
  NY: 'opencorporates.com/companies/us_ny',
  CA: 'opencorporates.com/companies/us_ca',
  OR: 'opencorporates.com/companies/us_or',
  NM: 'opencorporates.com/companies/us_nm',
  PA: 'opencorporates.com/companies/us_pa',
  SC: 'opencorporates.com/companies/us_sc',
  SD: 'opencorporates.com/companies/us_sd',
  WV: 'opencorporates.com/companies/us_wv',
  CT: 'opencorporates.com/companies/us_ct',
  IL: 'opencorporates.com/companies/us_il',
  TX: 'opencorporates.com/companies/us_tx',
};

export function nameVariants(company: string, city?: string | null): string[] {
  const out = new Set<string>();
  const c = String(company || '').trim();
  const cityRe = city ? new RegExp(`\\b(of\\s+)?${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
  const add = (s: string) => {
    const t = s.replace(/\s+/g, ' ').replace(/[-,|:]+$/, '').trim();
    if (t && ilNormName(t) !== ilNormName(c) && ilNormName(t).length >= 4) out.add(t);
  };
  add(c.split(/\s[-–|:]\s|\s\(|\|/)[0]);
  if (cityRe) add(c.replace(cityRe, ''));
  add(c.replace(/\b(llc|inc|co)\b\.?/gi, ''));
  add(c.replace(/'s\b/gi, 's'));
  add(c.replace(/\b(services?|company|group|and sons|& sons)\s*$/i, ''));
  // Word-prefix truncation: Maps titles append services/taglines to the legal name.
  const words = c.split(/\s[-–|:]\s|\s\(|\|/)[0].replace(/[+]/g, ' ').split(/\s+/).filter(Boolean);
  for (let n = words.length - 1; n >= 2; n--) add(words.slice(0, n).join(' '));
  return [...out].slice(0, 7);
}

function core(company: string): string {
  return String(company).split(/\s[-–|:]\s|\s\(|\|/)[0].replace(/\b(llc|inc)\b\.?/gi, '').replace(/[+]/g, ' ').trim().split(/\s+/).slice(0, 3).join(' ');
}

/** Entity names (with legal suffix) from registry-page titles. */
export function legalNamesFromTitles(titles: string[], company: string): string[] {
  const toks = ilNormName(core(company));
  const out = new Set<string>();
  for (const t of titles) {
    const name = t.split(/\s::\s|\s[|–-]\s|\sin\s[A-Z][a-z]+,|\s-\sSunbiz/)[0].replace(/^Detail by Entity Name\s*/i, '').trim();
    const k = ilNormName(name);
    if (k.length < 4) continue;
    if (k.includes(toks.slice(0, Math.min(toks.length, 8))) || toks.includes(k)) out.add(name);
  }
  return [...out].slice(0, 3);
}

export async function registryLegalNames(input: NameLookupInput, ctx?: LookupContext): Promise<{ names: string[]; credits: number }> {
  const site = STATE_REGISTRY_SITE[normalizeState(input.state) || ''];
  if (!site) return { names: [], credits: 0 };
  const res = await serperSearch(`site:${site} "${core(input.company_name)}"`, ctx);
  const titles = (res.organic || []).map((h) => String(h.title || ''));
  return { names: legalNamesFromTitles(titles, input.company_name), credits: 1 };
}
