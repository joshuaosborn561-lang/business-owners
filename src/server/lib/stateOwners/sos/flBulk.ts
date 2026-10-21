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
import { flCrossDb, lookupFlDb, registryDbConfigured } from './registryDb.js';
import type { NameLookupInput, NameLookupResult } from './types.js';
import { promoteAgentCandidate } from './waterfall.js';

export const FL_BULK_URL = 'https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/';

export interface FlRows { corp: string[][]; fic: string[][] }
export type FlLookup = (key: string) => Promise<FlRows>;

/** Supabase first (no memory), else local sorted files. Null when neither is configured. */
export function flLookupProvider(): FlLookup | null {
  if (registryDbConfigured()) {
    return async (key) => {
      const r = await lookupFlDb([key]);
      return {
        corp: (r?.entities || []).map((e) => [e.name_key, e.doc, e.city, e.principal_street, e.mail_street, e.ra_name, e.ra_type, e.ra_street, (e.officers || []).map((o) => `${o.title}:${o.name}:${o.street || ''}`).join('|')]),
        fic: (r?.fictitious || []).map((f) => [f.name_key, f.doc, f.city, f.street, f.owner_name, f.owner_type, f.owner_street, f.owner_doc]),
      };
    };
  }
  const dir = flBulkDir();
  if (!dir) return null;
  return async (key) => ({ corp: sortedTsvLookup(join(dir, 'fl_active.sorted.tsv'), key), fic: sortedTsvLookup(ficPath(dir), key) });
}

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

export async function resolveFloridaBulk(input: NameLookupInput, lookup: FlLookup, names: string[]): Promise<NameLookupResult | null> {
  for (const name of names) {
    const key = ilNormName(name);
    if (key.length < 3) continue;
    // corp: key, doc, city, principal street, mail street, RA, RA type, RA street, officers
    const rows = await lookup(key);
    const corp = pickCity(rows.corp, input.city, 2);
    if (corp) {
      const people = hitsFromRoster(input, rosterFromCorp(corp), 'sunbiz', FL_BULK_URL, 'exact', {
        cityMatch: String(corp[2]).toUpperCase() === String(input.city || '').toUpperCase(),
      });
      if (people.length) {
        return { people, coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', entity_id: corp[1], implemented: true, mailing_address: corp[4] ? `${corp[4]}, ${corp[2]}, FL` : null };
      }
      if (corp[6] === 'P') {
        const p = promoteAgentCandidate(input, corp[5], 'sunbiz', FL_BULK_URL, { agentAddress: corp[7], businessAddress: corp[3] });
        // Auto-reject: the agent is also agent/officer for a different business in the same city.
        let otherBiz = false;
        if (p?.accepted && registryDbConfigured()) {
          const x = await flCrossDb(corp[5], null, corp[2]);
          otherBiz = [...(x?.by_ra || []), ...(x?.by_person || [])].some((e) => e.name_key !== corp[0]);
        }
        if (p?.accepted && !otherBiz) {
          return { people: [p.hit], coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', entity_id: corp[1], implemented: true, agent_promoted: p.reason };
        }
      }
      const viaAddr = await crossByAddress(input, corp);
      if (viaAddr) return viaAddr;
      return { people: [], coverage_reason: 'agent_only', source: 'sunbiz', source_url: FL_BULK_URL, entity_id: corp[1], implemented: true, mailing_address: corp[4] ? `${corp[4]}, ${corp[2]}, FL` : null };
    }
    // fictitious: key, doc, city, street, owner, owner type, owner street, owner corp doc
    const fic = pickCity(rows.fic, input.city, 2);
    if (fic) {
      if (fic[5] === 'P' && fic[4]) {
        const people = hitsFromRoster(input, [{ name: fic[4], title: 'Owner', role: 'owner', labeled: true }], 'sunbiz', FL_BULK_URL, 'exact', { cityMatch: true });
        if (people.length) return { people, coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', implemented: true, legal_name: null, dba_source: 'fbn' };
      } else if (fic[4] && !names.includes(fic[4])) {
        const viaOwner = await resolveFloridaBulk({ ...input, city: null }, lookup, [fic[4]]);
        if (viaOwner?.people.length) return { ...viaOwner, legal_name: fic[4], dba_source: 'fbn' };
      }
    }
  }
  return null;
}

/**
 * RA / mailing-address cross-reference: other active entities at the same
 * mailing or RA street. A person who is an officer on 2+ of them is the
 * operator behind the address. Supabase only.
 */
async function crossByAddress(input: NameLookupInput, corp: string[]): Promise<NameLookupResult | null> {
  if (!registryDbConfigured()) return null;
  const streets = [...new Set([corp[4], corp[7]].filter((v) => v && /^\d/.test(v)))];
  const counts = new Map<string, number>();
  for (const street of streets) {
    const x = await flCrossDb(null, street, null);
    const docs = (x?.by_street || []).filter((e) => e.doc !== corp[1]).slice(0, 15);
    for (const e of docs) {
      const r = await lookupFlDb([e.name_key]);
      const ent = (r?.entities || []).find((y) => y.doc === e.doc);
      for (const o of ent?.officers || []) counts.set(o.name, (counts.get(o.name) || 0) + 1);
    }
  }
  const best = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const people = hitsFromRoster(input, [{ name: best[0], title: 'Manager (shared address)', role: 'officer', labeled: true }], 'sunbiz', FL_BULK_URL, 'exact', { cityMatch: true });
  return people.length
    ? { people, coverage_reason: null, source: 'sunbiz', source_url: FL_BULK_URL, match_method: 'exact', entity_id: corp[1], implemented: true, agent_promoted: 'candidate' }
    : null;
}
