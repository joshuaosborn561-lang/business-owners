import {
  coreCompanySearchName,
  normalizeCompanyName,
  splitLegalAndDba,
  trigramSimilarity,
} from '../names.js';
import type { LookupContext } from './context.js';
import { ctxSerper } from './context.js';
import { copyrightLine, fetchSiteText, footerSlice, originFromInput } from './siteFetch.js';
import { organicFromSerperPayload, serperSearch } from './serper.js';
import type { DbaSource, NameLookupInput, SerperOrganicHit } from './types.js';

export interface DbaResolution {
  input_name: string;
  legal_name: string;
  dba_name: string | null;
  source: DbaSource;
  source_url: string | null;
  serper_credits: number;
  notes: string[];
}

const LEGAL_ENTITY = /\b(LLC|L\.?L\.?C\.?|INC\.?|INCORPORATED|LTD|LP|LLP|PLLC|CORP\.?|CORPORATION|CO\.?)\b/i;

function looksLegal(name: string): boolean {
  const n = String(name || '').trim();
  if (n.length < 5) return false;
  return LEGAL_ENTITY.test(n);
}

function stripLegalTrailer(name: string): string {
  return String(name || '')
    .replace(/\b(all rights reserved|privacy policy|terms of (use|service)|home|about).*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function betterLegal(current: string, candidate: string, input: string): boolean {
  const c = stripLegalTrailer(candidate);
  if (!looksLegal(c)) return false;
  const inNorm = normalizeCompanyName(input);
  const cNorm = normalizeCompanyName(c);
  if (!cNorm || cNorm === inNorm) return false;
  if (current && normalizeCompanyName(current) === cNorm) return false;
  // Candidate should share some tokens with the trade name, or be a strict legal form of it.
  const sim = trigramSimilarity(inNorm, cNorm);
  if (sim < 0.28 && !cNorm.includes(inNorm.split(' ')[0] || '___')) return false;
  return true;
}

export function dbaLlcIncQuery(input: NameLookupInput): string {
  const name = coreCompanySearchName(input.company_name);
  const city = String(input.city || '').trim();
  return `"${name}" ${city} LLC OR Inc`.replace(/\s+/g, ' ').trim();
}

export function dbaFbnQuery(input: NameLookupInput): string {
  const name = coreCompanySearchName(input.company_name);
  const city = String(input.city || '').trim();
  const state = String(input.state || '').trim();
  return `"${name}" ${city} ${state} "fictitious business name" OR "doing business as" OR DBA`.replace(/\s+/g, ' ').trim();
}

function legalFromOrganic(hits: SerperOrganicHit[], inputName: string): { name: string; url: string } | null {
  for (const hit of hits) {
    const blob = `${hit.title || ''} ${hit.snippet || ''}`;
    const dba = splitLegalAndDba(blob);
    if (dba.dba && looksLegal(dba.legal) && betterLegal('', dba.legal, inputName)) {
      return { name: stripLegalTrailer(dba.legal), url: hit.link || '' };
    }
    const quoted = blob.match(
      /(?:legal name|filed as|registered as|entity name)[:\s]+([A-Z][^.]{4,80}(?:LLC|INC|INCORPORATED|LTD|LP|CORP|CORPORATION))/i,
    );
    if (quoted?.[1] && betterLegal('', quoted[1], inputName)) {
      return { name: stripLegalTrailer(quoted[1]), url: hit.link || '' };
    }
    if (looksLegal(hit.title || '') && betterLegal('', hit.title || '', inputName)) {
      return { name: stripLegalTrailer(hit.title || ''), url: hit.link || '' };
    }
  }
  return null;
}

function legalFromSiteText(text: string, html: string, inputName: string): string | null {
  const copy = copyrightLine(text) || copyrightLine(footerSlice(html));
  if (copy && betterLegal('', copy, inputName)) return stripLegalTrailer(copy);
  const dba = text.match(
    /([A-Z][A-Za-z0-9&.,' -]{3,80}(?:LLC|Inc\.?|Incorporated|Ltd|LP|LLP|Corp\.?|Corporation))\s+(?:d\/?b\/?a|doing business as)\s+/i,
  );
  if (dba?.[1] && betterLegal('', dba[1], inputName)) return stripLegalTrailer(dba[1]);
  const reverse = text.match(
    /(?:d\/?b\/?a|doing business as)\s+[^.]+?\s+is\s+(?:a\s+)?(?:d\/?b\/?a\s+of\s+)?([A-Z][A-Za-z0-9&.,' -]{3,80}(?:LLC|Inc\.?|Incorporated))/i,
  );
  if (reverse?.[1] && betterLegal('', reverse[1], inputName)) return stripLegalTrailer(reverse[1]);
  return null;
}

/**
 * Resolve a trade/DBA name to a legal SOS name. Order: input DBA split,
 * site footer/privacy/terms/copyright, Serper LLC/Inc, Maps/GBP, free FBN snippets.
 */
export async function resolveDbaLegalName(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<DbaResolution> {
  const inputName = String(input.company_name || '').trim();
  const notes: string[] = [];
  const before = ctxSerper(ctx).credits;
  const split = splitLegalAndDba(inputName);
  if (split.dba && looksLegal(split.legal)) {
    return {
      input_name: inputName,
      legal_name: split.legal,
      dba_name: split.dba,
      source: 'input_dba',
      source_url: null,
      serper_credits: 0,
      notes: ['split input DBA'],
    };
  }

  if (looksLegal(inputName)) {
    return {
      input_name: inputName,
      legal_name: inputName,
      dba_name: split.dba,
      source: null,
      source_url: null,
      serper_credits: 0,
      notes: ['already legal name'],
    };
  }

  const origin = originFromInput(input);
  if (origin) {
    const pages = ['', '/privacy', '/privacy-policy', '/terms', '/terms-of-service'];
    for (const path of pages) {
      const page = await fetchSiteText(`${origin}${path || '/'}`, ctx);
      if (page.blocked || !page.text) continue;
      const legal = legalFromSiteText(page.text, page.html, inputName);
      if (legal) {
        return {
          input_name: inputName,
          legal_name: legal,
          dba_name: inputName,
          source: 'website',
          source_url: page.url,
          serper_credits: 0,
          notes: [`website ${path || 'home'}`],
        };
      }
    }
    notes.push('website miss');
  }

  if (ctx && ctx.live === false) {
    return {
      input_name: inputName,
      legal_name: inputName,
      dba_name: split.dba,
      source: null,
      source_url: null,
      serper_credits: 0,
      notes: [...notes, 'offline'],
    };
  }

  const llcHits = await serperSearch(dbaLlcIncQuery(input), ctx);
  const fromSerper = legalFromOrganic(organicFromSerperPayload(llcHits), inputName);
  if (fromSerper) {
    return {
      input_name: inputName,
      legal_name: fromSerper.name,
      dba_name: inputName,
      source: 'serper',
      source_url: fromSerper.url,
      serper_credits: ctxSerper(ctx).credits - before,
      notes,
    };
  }

  const fbnHits = await serperSearch(dbaFbnQuery(input), ctx);
  const fromFbn = legalFromOrganic(organicFromSerperPayload(fbnHits), inputName);
  if (fromFbn) {
    return {
      input_name: inputName,
      legal_name: fromFbn.name,
      dba_name: inputName,
      source: 'fbn',
      source_url: fromFbn.url,
      serper_credits: ctxSerper(ctx).credits - before,
      notes,
    };
  }

  return {
    input_name: inputName,
    legal_name: inputName,
    dba_name: split.dba,
    source: null,
    source_url: null,
    serper_credits: ctxSerper(ctx).credits - before,
    notes: [...notes, 'no legal-name upgrade'],
  };
}
