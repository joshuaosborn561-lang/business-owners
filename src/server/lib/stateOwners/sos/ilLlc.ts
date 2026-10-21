/**
 * Illinois LLC Data Transparency Act files (free, ilsos.gov/data/bs):
 * llcallnam (legal names), llcallase (assumed / DBA names), llcallmst (principal
 * city), llcallmgr (managers / members with address). The generic DTA ingester
 * reads corporation layouts only, so LLC managers were never matched.
 */
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { RosterEntry } from './officers.js';
import { lookupIlDb } from './registryDb.js';

export const IL_LLC_URL = 'https://www.ilsos.gov/data/bus-serv-home.html';

export interface IlLlcIndex {
  byName: Map<string, string[]>;
  city: Map<string, string>;
  managers: Map<string, string>;
}

/** Normalize a business name for exact lookup (drops LLC/Inc suffixes and punctuation). */
export function ilNormName(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(L\s*\.?\s*L\s*\.?\s*C\.?|LLC|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|THE|SERIES)\b\.?/g, ' ')
    .replace(/[^A-Z0-9]/g, '');
}

const slice = (l: string, a: number, b: number) => l.slice(a, b).trim();

/** llcallmgr line → file number + manager record. Pure. */
export function parseIlManagerLine(line: string): { file: string; name: string; city: string } | null {
  const file = line.slice(0, 8);
  if (!/^\d{8}$/.test(file)) return null;
  const name = slice(line, 8, 68);
  if (!name) return null;
  return { file, name, city: slice(line, 113, 143) };
}

/** "LAST, FIRST M." → "FIRST M. LAST". Entities (LLC/TRUST/INC) → null. */
export function ilManagerPerson(raw: string): string | null {
  const n = raw.replace(/\s+/g, ' ').trim();
  if (/\b(LLC|L\.L\.C|INC|TRUST|CORP|COMPANY|HOLDINGS|PARTNERS|LP|LTD|FUND|BANK|GROUP|ASSOCIATES|PROPERTIES)\b/i.test(n)) return null;
  const m = n.match(/^([^,]+),\s*(.+)$/);
  const full = m ? `${m[2]} ${m[1]}` : n;
  return full.split(' ').length >= 2 ? full : null;
}

async function eachLine(path: string, fn: (l: string) => void): Promise<void> {
  if (!existsSync(path)) return;
  const rl = createInterface({ input: createReadStream(path, { encoding: 'latin1' }), crlfDelay: Infinity });
  for await (const raw of rl) fn(raw.replace(/\r$/, ''));
}

let cache: { dir: string; index: IlLlcIndex } | null = null;

export async function loadIlLlcIndex(dir: string): Promise<IlLlcIndex | null> {
  const base = existsSync(join(dir, '.extracted', 'llcallnam.txt')) ? join(dir, '.extracted') : dir;
  if (!existsSync(join(base, 'llcallnam.txt')) || !existsSync(join(base, 'llcallmgr.txt'))) return null;
  if (cache?.dir === base) return cache.index;
  const index: IlLlcIndex = { byName: new Map(), city: new Map(), managers: new Map() };
  const add = (name: string, file: string) => {
    const k = ilNormName(name);
    if (k.length < 3) return;
    const arr = index.byName.get(k);
    if (!arr) index.byName.set(k, [file]);
    else if (!arr.includes(file) && arr.length < 20) arr.push(file);
  };
  await eachLine(join(base, 'llcallnam.txt'), (l) => {
    const f = l.slice(0, 8);
    if (/^\d{8}$/.test(f)) add(slice(l, 8, 128), f);
  });
  await eachLine(join(base, 'llcallase.txt'), (l) => {
    const f = l.slice(0, 8);
    if (/^\d{8}$/.test(f)) add(slice(l, 42, 162), f);
  });
  await eachLine(join(base, 'llcallmst.txt'), (l) => {
    const f = l.slice(0, 8);
    if (/^\d{8}$/.test(f)) index.city.set(f, slice(l, 88, 118).toUpperCase());
  });
  await eachLine(join(base, 'llcallmgr.txt'), (l) => {
    const p = parseIlManagerLine(l);
    if (!p) return;
    const prev = index.managers.get(p.file);
    index.managers.set(p.file, prev ? `${prev}\t${p.name}` : p.name);
  });
  cache = { dir: base, index };
  return index;
}

/** Exact normalized-name match; city breaks ties. Returns person managers only. Pure given an index. */
export function matchIlLlc(
  index: IlLlcIndex,
  names: Array<string | null | undefined>,
  city?: string | null,
): { file: string; roster: RosterEntry[]; city_match: boolean } | null {
  const want = String(city || '').toUpperCase().trim();
  for (const name of names) {
    const files = index.byName.get(ilNormName(String(name || '')));
    if (!files?.length) continue;
    const ranked = [...files].sort(
      (a, b) => Number(index.city.get(b) === want) - Number(index.city.get(a) === want),
    );
    if (files.length > 1 && index.city.get(ranked[0]) !== want) continue;
    const file = ranked[0];
    const roster: RosterEntry[] = [];
    for (const raw of (index.managers.get(file) || '').split('\t')) {
      const person = raw && ilManagerPerson(raw);
      if (person) roster.push({ name: person, title: 'Manager', role: 'member', labeled: true });
    }
    if (roster.length) return { file, roster: roster.slice(0, 4), city_match: index.city.get(file) === want };
  }
  return null;
}

/** Same rule as matchIlLlc, against Supabase business_owners.il_llc_*. */
export async function matchIlLlcDb(
  names: Array<string | null | undefined>,
  city?: string | null,
): Promise<{ file: string; roster: RosterEntry[]; city_match: boolean } | null> {
  const want = String(city || '').toUpperCase().trim();
  for (const name of names) {
    const key = ilNormName(String(name || ''));
    if (key.length < 3) continue;
    const rows = (await lookupIlDb([key])) || [];
    if (!rows.length) continue;
    const ranked = [...rows].sort((a, b) => Number(b.city === want) - Number(a.city === want));
    const files = new Set(rows.map((r) => r.file));
    if (files.size > 1 && ranked[0].city !== want) continue;
    const roster: RosterEntry[] = [];
    for (const m of ranked[0].managers || []) {
      const person = ilManagerPerson(m.name);
      if (person) roster.push({ name: person, title: 'Manager', role: 'member', labeled: true });
    }
    if (roster.length) return { file: ranked[0].file, roster: roster.slice(0, 4), city_match: ranked[0].city === want };
  }
  return null;
}
