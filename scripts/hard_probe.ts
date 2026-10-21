/** Run each hard-to-find technique independently on a CSV of misses. Counts only. */
import { readFileSync } from 'node:fs';
import { resolveHardToFind, type HardTechnique } from '../src/server/lib/stateOwners/sos/hardToFind.js';
import { defaultLookupContext } from '../src/server/lib/stateOwners/sos/context.js';
import { parseCsvLine } from '../src/server/lib/stateOwners/sos/sampleCsv.js';
const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n');
const head = parseCsvLine(lines[0]);
const ctx = defaultLookupContext({ live: true });
const T: HardTechnique[] = ['li_title', 'aggregator'];
const stats: Record<string, Record<string, number>> = {};
const debug = process.argv.includes('--debug');
for (const l of lines.slice(1)) {
  const c = parseCsvLine(l); const g = (k: string) => c[head.indexOf(k)];
  const set = g('set'); stats[set] ??= { rows: 0, any: 0, li_title: 0, aggregator: 0, credits: 0 };
  stats[set].rows++; let any = false;
  for (const t of T) {
    const r = await resolveHardToFind({ company_name: g('company'), city: g('city'), state: g('state') }, ctx, [t]);
    stats[set].credits += r.credits;
    if (r.people.length) { stats[set][t]++; any = true; if (debug) console.error(t, g('company'), '=>', r.people[0].first_name, r.people[0].last_name, r.people[0].source_url); }
  }
  if (any) stats[set].any++;
}
console.log(JSON.stringify(stats));
