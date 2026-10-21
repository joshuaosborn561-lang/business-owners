/**
 * LLC unmasking (ported from topup skills/unmask-shell-llc).
 *
 * A shell / single-purpose LLC has no web presence, so name-based owner
 * searches miss. Its mailing address is the operator's real office. Find the
 * entity's address, list the other businesses at that address, and run the
 * normal Serper owner search on the operator instead.
 *
 * Serper only (≈2 Places + ≤8 search credits per row). Runs last, only when
 * nothing earlier is waterfall-ready. Never paid datasets.
 */
import { normalizeState } from '../names.js';
import type { LookupContext } from './context.js';
import { serperPlaces } from './serper.js';
import { resolveSerperOwner } from './serperOwners.js';
import type { NameLookupInput, NameLookupResult, SerperPlaceHit } from './types.js';
import { isWaterfallReady } from './waterfall.js';

/** Address-named, numbered, or holding-style entity names. */
export function looksLikeShellEntity(name: string): boolean {
  const n = String(name || '').trim();
  if (!n) return false;
  if (/^\d{1,6}\s+\S+/.test(n)) return true;
  if (/\b(holdings?|propert(y|ies)|investments?|realty|ventures|capital|equities|assets|land|partners)\b/i.test(n)) return true;
  if (/\b(llc|l\.l\.c\.|lp|llp|ltd)\b/i.test(n) && n.split(/\s+/).length <= 3) return true;
  return false;
}

const VIRTUAL_OFFICE =
  /(registered agent|incorp|corporation service|ct corporation|ups store|regus|wework|spaces|mail ?box|postnet|post office|usps|fedex|virtual office|business center|executive suites|law (firm|office)|attorney|cpa|accounting|tax service|bank|credit union|apartment|condominium|plaza$|tower$|building$|center$)/i;

export function normCompany(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/\b(LLC|L L C|INC|CO|CORP|CORPORATION|COMPANY|LTD|LP|LLP|PLLC|PC|THE)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Street line of a Maps address ("123 Main St Ste 4, City, ST 12345" → "123 Main St Ste 4"). */
export function streetLine(address: string | undefined | null): string | null {
  const a = String(address || '').trim();
  if (!a) return null;
  const street = a.split(',')[0].trim();
  return /^\d+\s+\S+/.test(street) ? street : null;
}

/** Pick operating businesses sharing the entity's address, best first. Pure. */
export function operatorsAtAddress(
  company: string,
  street: string,
  places: SerperPlaceHit[],
  max = 2,
): string[] {
  const self = normCompany(company);
  const key = street.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const out: string[] = [];
  for (const p of places) {
    const title = String(p.title || '').trim();
    if (!title) continue;
    const t = normCompany(title);
    if (!t || t === self || t.includes(self) || self.includes(t)) continue;
    if (VIRTUAL_OFFICE.test(title)) continue;
    const addr = String(p.address || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (key && !addr.startsWith(key.slice(0, Math.min(key.length, 12)))) continue;
    if (!out.includes(title)) out.push(title);
    if (out.length >= max) break;
  }
  return out;
}

export interface UnmaskOptions {
  /** Run even when the name does not look like a shell. Default true; the waterfall passes false. */
  allNames?: boolean;
  maxOperators?: number;
}

export async function resolveUnmaskByAddress(
  input: NameLookupInput & { address?: string | null },
  ctx?: LookupContext,
  opts: UnmaskOptions = {},
): Promise<NameLookupResult> {
  const company = String(input.company_name || '').trim();
  const state = normalizeState(input.state);
  const empty: NameLookupResult = {
    people: [],
    coverage_reason: 'not_found',
    source: 'unmask_address',
    implemented: true,
    serper_credits: 0,
  };
  if (!company || !state) return empty;
  if (opts.allNames === false && !looksLikeShellEntity(company)) return empty;

  const before = ctx?.serper?.credits ?? 0;
  const credits = () => Math.max(0, (ctx?.serper?.credits ?? 0) - before);

  let street = streetLine(input.address);
  if (!street) {
    const self = await serperPlaces(`${company} ${input.city || ''} ${state}`, ctx);
    const target = normCompany(company);
    const hit = (self.places || []).find((p) => {
      const t = normCompany(p.title || '');
      return t && (t === target || t.includes(target) || target.includes(t));
    });
    street = streetLine(hit?.address);
  }
  if (!street) return { ...empty, serper_credits: credits(), via_serper: credits() > 0 };

  const near = await serperPlaces(`${street} ${input.city || ''} ${state}`, ctx);
  const operators = operatorsAtAddress(company, street, near.places || [], opts.maxOperators ?? 2);
  for (const op of operators) {
    const res = await resolveSerperOwner({ ...input, company_name: op, domain: null, website: null }, ctx);
    const ready = res.people.filter((p) => isWaterfallReady(p));
    if (ready.length) {
      return {
        people: ready.map((p) => ({
          ...p,
          company_name: company,
          source: 'unmask_address' as const,
          review_flag: false,
        })),
        coverage_reason: null,
        source: 'unmask_address',
        source_url: ready[0].source_url,
        business_name: op,
        implemented: true,
        via_serper: true,
        serper_credits: credits(),
      };
    }
  }
  return { ...empty, serper_credits: credits(), via_serper: credits() > 0 };
}
