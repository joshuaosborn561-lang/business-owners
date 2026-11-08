/** Shared owner-name and title rules for universe rows. */
import { checkPlausiblePersonName, isNonOwnerTitle } from '../stateOwners/personName.js';
import { splitPersonName, validateOfficerPersonName } from '../stateOwners/names.js';

export interface OwnerName {
  first: string | null;
  last: string | null;
  ok: boolean;
}

/** Validate a person name from a public file. ok=false means it is a company, a place, a title or junk. */
export function ownerName(raw: string | null | undefined, extraPlaces: Array<string | null | undefined> = []): OwnerName {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return { first: null, last: null, ok: false };
  const v = validateOfficerPersonName(s, extraPlaces);
  const split = v.ok ? { first_name: v.first_name, last_name: v.last_name } : splitPersonName(s);
  const first = split.first_name || null;
  const last = split.last_name || null;
  const ok = Boolean(v.ok && first && last && checkPlausiblePersonName(first, last).ok);
  return { first, last, ok };
}

/** Ready for paid enrichment: a plausible person whose title is not a staff title. */
export function readyOwner(name: OwnerName, title: string | null | undefined): boolean {
  return name.ok && !isNonOwnerTitle(title || null);
}

/** Commercial registered agents and filing services never count as owners. */
const COMMERCIAL_AGENT =
  /\b(CT CORPORATION|C T CORPORATION|CORPORATION SERVICE COMPANY|CSC\b|NORTHWEST REGISTERED|REGISTERED AGENTS? INC|LEGALZOOM|INCFILE|ZENBUSINESS|NATIONAL REGISTERED AGENTS|COGENCY GLOBAL|UNITED STATES CORPORATION AGENTS|HARBOR COMPLIANCE)\b/i;

export function isCommercialAgent(raw: string | null | undefined): boolean {
  return COMMERCIAL_AGENT.test(String(raw || ''));
}
