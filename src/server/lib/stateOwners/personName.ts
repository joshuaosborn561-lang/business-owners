/**
 * Last line of defence against "names" that are really business words, page text or job titles.
 * Used by validateOfficerPersonName (so every source and isWaterfallReady go through it) and re-checked
 * on every row a table job writes.
 */

/** Words that are essentially never part of a person's name. Real surnames (Baker, Mason, Cook, Church...) are NOT listed. */
const NON_PERSON_WORDS = new Set(
  (
    'storage self brewing brewery brewers dental dentistry orthodontics lounge sports grill auto automotive repair apartments apartment realty estate ' +
    'insurance restaurant restaurants hospital university college school schools academy ministries ministry motel hotel inn suites cafe coffee pizza pizzeria ' +
    'bakery market store shop supply supplies equipment systems technologies technology labs laboratory studio studios salon spa fitness gym club ' +
    'association foundation society center centre centers clinic medical health healthcare care wellness pharmacy veterinary animal pets cleaners cleaning ' +
    'laundry carwash wash tire tires glass paint painting heating cooling air plumbing electric electrical roofing construction building builders ' +
    'contractors contracting landscaping lawn trucking transport transportation logistics freight express delivery service services solutions consulting ' +
    'partners group holdings enterprises industries international global national american family associates company corp inc llc ltd llp lp pllc ' +
    'celebrating progress era joins dealer net official website home about contact phone email staff team story page hours open closed review reviews ' +
    'response the and of for at in on by with to from our your my we us unknown anonymous admin info sales support customer customers office offices ' +
    'department dept division branch location locations headquarters hq mobile wireless internet network networks media marketing design designs ' +
    'properties property management mgmt investments investment capital ventures realtors realtor mortgage lending financial finance bank credit union ' +
    'church temple mosque parish chapel funeral cemetery memorial cremation florist flowers nursery garden gardens farm farms ranch ranches orchard winery ' +
    'vineyard distillery tavern pub bar bistro diner kitchen catering deli donut donuts bagel bagels sushi taco tacos burger burgers wings'
  ).split(' '),
);

const NAME_TOKEN = /^[A-Za-z][A-Za-z'’.-]*$/;

export interface PersonNameCheck {
  ok: boolean;
  reason?: 'empty' | 'chars' | 'short' | 'nonperson_word' | 'repeated';
  word?: string;
}

/** Plausibility check on already-split first/last name strings. Pure. */
export function checkPlausiblePersonName(first: string | null | undefined, last: string | null | undefined): PersonNameCheck {
  const f = String(first || '').replace(/\s+/g, ' ').trim();
  const l = String(last || '').replace(/\s+/g, ' ').trim();
  if (!f || !l) return { ok: false, reason: 'empty' };
  const toks = `${f} ${l}`.split(' ').filter(Boolean);
  for (const t of toks) {
    if (!NAME_TOKEN.test(t)) return { ok: false, reason: 'chars', word: t };
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (!letters) return { ok: false, reason: 'chars', word: t };
  }
  const lastLetters = l.replace(/[^A-Za-z]/g, '');
  if (lastLetters.length < 2) return { ok: false, reason: 'short', word: l };
  const firstToken = f.split(' ')[0].replace(/[^A-Za-z]/g, '');
  if (firstToken.length < 2 && !/\.$/.test(f.split(' ')[0])) return { ok: false, reason: 'short', word: f };
  for (const t of toks) {
    const w = t.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (NON_PERSON_WORDS.has(w)) return { ok: false, reason: 'nonperson_word', word: w };
  }
  const low = toks.map((t) => t.replace(/[^A-Za-z]/g, '').toLowerCase()).filter((t) => t.length > 1);
  if (low.length >= 2 && new Set(low).size === 1) return { ok: false, reason: 'repeated' };
  return { ok: true };
}

/** Titles that mean the person is staff, not the owner. "Managing Member"/"General Partner"/owner-ish titles are fine. */
const OWNERISH = /\b(owner|co-?owner|founder|co-?founder|president|ceo|chief\s+executive|principal|proprietor|partner|managing\s+(member|partner|director)|chairman|chairwoman|chair)\b/i;
const STAFF = /\b(manager|supervisor|assistant|associate|coordinator|specialist|representative|rep|technician|tech|receptionist|clerk|secretary|analyst|agent|administrator|admin|foreman|lead|intern|employee|staff|stylist|server)\b/i;

/** True for "Manager", "General Manager", "Office Manager"... unless the same title also says owner/president/etc. */
export function isNonOwnerTitle(title: string | null | undefined): boolean {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (OWNERISH.test(t)) return false;
  return STAFF.test(t);
}
