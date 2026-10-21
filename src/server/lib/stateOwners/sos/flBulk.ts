/**
 * Florida Sunbiz quarterly bulk files (free; sftp.floridados.gov, public login
 * published by FL DOS). Built by scripts/build_fl_sunbiz.py into two TSVs sorted
 * by normalized name: corporations (officers + RA) and fictitious names (DBA →
 * registrant). Lookups are a binary search, so no Sunbiz HTTP (403 from
 * datacenter IPs) and no Apify.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ilNormName } from './ilLlc.js';
import { canonicalOfficerTitle, hitsFromRoster, type RosterEntry } from './officers.js';
import { sortedTsvLookup } from './sortedTsv.js';
import type { NameLookupInput, NameLookupResult } from './types.js';
import { promoteAgentCandidate } from './waterfall.js';

export const FL_BULK_URL = 'https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/';

export function flBulkDir(): string | null {
  const dir = process.env.FL_SUNBIZ_DIR?.trim() || '/tmp/fl-sunbiz';
  return existsSync(join(dir, 'fl_active.sorted.tsv')) ? dir : null;
}

function ficPath(dir: string): string {
  const p = join(dir, 'fic_active.sorted.tsv');
  return existsSync(p) ? p : join(process.env.FL_FIC_DIR?.trim() || '/tmp/fl-fic', 'fic_active.sorted.tsv');
}

const TITLE: Record<string, string> = { MGR: 'Manager', AMBR: 'Member', MBR: 'Member', MGRM: 'Managing Member', P: 'President', PRES: 'President', CEO: 'CEO', D: 'Director', VP: 'Vice President', T: 'Treasurer', S: 'Secretary', AP: 'Authorized Person', OWN: 'Owner' };

function pickCity<T extends string[]>(rows: T[], city: string | null | undefined, cityCol: number): T | null {
  if (!rows.length) return null;
  const want = String(city || '').toUpperCase().trim();
  const same = rows.filter((r) => String(r[cityCol] || '').toUpperCase() === want);
  if (same.length) return same[0];
  return rows.length === 1 ? rows[0] : null;
}

function rosterFromCorp(row: string[]): RosterEntry[] {
  return String(row[8] || '')
    .split('|')
    .filter(Boolean)
    .map((o) => {
      const [t, name] = o.split(':');
      return { name, title: canonicalOfficerTitle(TITLE[t] || t || 'Officer'), role: 'officer' as const, labeled: true };
    })
    .filter((o) => o.name);
}

export function resolveFloridaBulk(input: NameLookupInput, dir: string, names: string[]): NameLookupResult | null {
  const corpPath = join(dir, 'fl_active.sorted.tsv');
  for (const name of names) {
    const key = ilNormName(name);
    if (key.length < 3) continue;
    // corp: key, doc, city, principal street, mail street, RA, RA type, RA street, officers
    const corp = pickCity(sortedTsvLookup(corpPath, key), input.city, 2);
    if (corp) {
      const people = hitsFromRoster(input, rosterFromCorp(corp), 'sunbiz', FL_BULK_URL, 'exact', {
        cityMatch: String(corp[2]).toUpperCase() === String(input.city || '').toUpperCase(),
      });
      if (people.length) {
        return { people, coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', entity_id: corp[1], implemented: true, mailing_address: corp[4] ? `${corp[4]}, ${corp[2]}, FL` : null };
      }
      if (corp[6] === 'P') {
        const p = promoteAgentCandidate(input, corp[5], 'sunbiz', FL_BULK_URL, { agentAddress: corp[7], businessAddress: corp[3] });
        if (p?.accepted) {
          return { people: [p.hit], coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', entity_id: corp[1], implemented: true, agent_promoted: p.reason };
        }
      }
      return { people: [], coverage_reason: 'agent_only', source: 'sunbiz', source_url: FL_BULK_URL, entity_id: corp[1], implemented: true, mailing_address: corp[4] ? `${corp[4]}, ${corp[2]}, FL` : null };
    }
    // fictitious: key, doc, city, street, owner, owner type, owner street, owner corp doc
    const fic = pickCity(sortedTsvLookup(ficPath(dir), key), input.city, 2);
    if (fic) {
      if (fic[5] === 'P' && fic[4]) {
        const people = hitsFromRoster(input, [{ name: fic[4], title: 'Owner', role: 'owner', labeled: true }], 'sunbiz', FL_BULK_URL, 'exact', { cityMatch: true });
        if (people.length) return { people, coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', implemented: true, legal_name: null, dba_source: 'fbn' };
      } else if (fic[4] && !names.includes(fic[4])) {
        const viaOwner = resolveFloridaBulk({ ...input, city: null }, dir, [fic[4]]);
        if (viaOwner?.people.length) return { ...viaOwner, legal_name: fic[4], dba_source: 'fbn' };
      }
    }
  }
  return null;
}
