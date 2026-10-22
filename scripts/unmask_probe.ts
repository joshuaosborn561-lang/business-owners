/** Probe the LLC unmask step alone on a company CSV. Prints counts only. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveUnmaskByAddress } from '../src/server/lib/stateOwners/sos/unmask.js';
import { defaultLookupContext } from '../src/server/lib/stateOwners/sos/context.js';
import { parseCsvLine } from '../src/server/lib/stateOwners/sos/sampleCsv.js';

const [inp, out] = process.argv.slice(2);
const lines = readFileSync(inp, 'utf8').trim().split('\n');
const head = parseCsvLine(lines[0]);
const col = (cells: string[], k: string) => cells[head.indexOf(k)] ?? '';
const rows = lines.slice(1).map((l) => {
  const c = parseCsvLine(l);
  return { company_name: col(c, 'company'), city: col(c, 'city'), state: col(c, 'state'), address: col(c, 'address') || null };
});
const ctx = defaultLookupContext({ live: true });
let hits = 0;
const res: string[] = ['state,ready,credits'];
for (const row of rows) {
  const before = ctx.serper?.credits ?? 0;
  const r = await resolveUnmaskByAddress(row, ctx);
  const c = (ctx.serper?.credits ?? 0) - before;
  if (r.people.length) hits++;
  res.push(`${row.state},${r.people.length > 0},${c}`);
}
if (out) writeFileSync(out, res.join('\n'));
console.log(JSON.stringify({ rows: rows.length, hits, serper_credits: ctx.serper?.credits ?? 0 }));
