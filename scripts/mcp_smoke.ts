/**
 * Live test of the hosted MCP, the same way Claude or an agent connects.
 *
 *   npx tsx scripts/mcp_smoke.ts --in companies.csv            # quote only (no spend)
 *   npx tsx scripts/mcp_smoke.ts --in companies.csv --run      # quote, then run for real
 *   MCP_URL=https://... npx tsx scripts/mcp_smoke.ts --in x.csv
 *
 * CSV columns: company (or company_name), city, state, optional phone, website.
 * Prints the quote, then the owners found, per-state hit rates and spend.
 * --out owners.csv saves every owner (via get_owner_results format=csv).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsvLine } from '../src/server/lib/stateOwners/sos/sampleCsv.js';

const URL_ = process.env.MCP_URL || 'https://business-owners.up.railway.app/mcp';
const args = process.argv.slice(2);
const inPath = args[args.indexOf('--in') + 1];
const run = args.includes('--run');
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!inPath || args.indexOf('--in') === -1) {
  console.error('usage: npx tsx scripts/mcp_smoke.ts --in companies.csv [--run]');
  process.exit(1);
}

const lines = readFileSync(inPath, 'utf8').trim().split(/\r?\n/);
const head = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
const col = (cells: string[], ...names: string[]) => {
  for (const n of names) {
    const i = head.indexOf(n);
    if (i >= 0 && cells[i]?.trim()) return cells[i].trim();
  }
  return undefined;
};
const rows = lines.slice(1).map((l) => {
  const c = parseCsvLine(l);
  return {
    company_name: col(c, 'company_name', 'company', 'name') || '',
    city: col(c, 'city'),
    state: col(c, 'state') || '',
    phone: col(c, 'phone', 'phone_number'),
    website: col(c, 'website', 'domain', 'url'),
  };
}).filter((r) => r.company_name && r.state);

let sid = '';
let id = 0;
async function rpc(method: string, params?: unknown): Promise<any> {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sid ? { 'mcp-session-id': sid } : {}),
    },
    body: JSON.stringify(method.startsWith('notifications/') ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }),
  });
  sid = res.headers.get('mcp-session-id') || sid;
  const text = await res.text();
  const json = text.split('\n').map((l) => l.replace(/^data: /, '')).find((l) => l.startsWith('{'));
  return json ? JSON.parse(json) : null;
}
const tool = async (name: string, a: Record<string, unknown>) => {
  const r = await rpc('tools/call', { name, arguments: a });
  return JSON.parse(r.result.content[0].text);
};

await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-smoke', version: '1' } });
await rpc('notifications/initialized');
const health = await tool('health', {});
console.log(`server: ${URL_}`);
console.log(`serper=${health.serper_configured} unblocker=${health.unblocker_provider ?? 'off'} open_data=${health.open_data_enabled} states=${health.officer_publishing_states?.length}`);

const est = await tool('lookup_business_owner', { rows, estimate_only: true });
const q = est.quote;
console.log(`\nQUOTE  rows=${q.rows}  max=$${q.total_usd_max}  per_row_max=$${q.per_row_usd_max}  (serper $${q.serper_usd_max}, unblocker $${q.unblocker_usd_max}, apify $${q.apify_usd_max})`);
console.log(`by state: ${JSON.stringify(q.rows_by_state)}`);
if (!run) {
  console.log('\nQuote only. Re-run with --run to spend.');
  process.exit(0);
}

const t0 = Date.now();
const out = await tool('lookup_business_owner', { rows, dry_run: true, wait: true });
const spent = (out.serper_usd || 0) + (out.unblocker_usd || 0) + (out.apify_usd_spent || 0);
console.log(`\nRESULT  named=${out.named}/${out.processed} (${Math.round((100 * out.named) / Math.max(1, out.processed))}%)  spent=$${spent.toFixed(3)}  in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`via open_data=${out.via_open_data} serper=${out.via_serper} unblocker_requests=${out.unblocker_requests} apify=${out.via_apify}`);
for (const [st, s] of Object.entries(out.hit_rate_by_state as Record<string, { named: number; attempted: number }>)) {
  console.log(`  ${st}: ${s.named}/${s.attempted}`);
}
console.log(`\nOWNERS (${out.owners_total})`);
for (const o of out.owners as Array<Record<string, unknown>>) {
  console.log(`  ${String(o.company_name).padEnd(36)} ${o.first_name} ${o.last_name}  (${o.title}; ${o.source}; ${o.confidence_score})`);
}
if (outPath) {
  const csv = await tool('get_owner_results', { job_id: out.job_id, format: 'csv', limit: 5000 });
  writeFileSync(outPath, csv.csv + '\n');
  console.log(`\nsaved ${csv.returned} owners to ${outPath}`);
}
console.log(`\njob_id=${out.job_id}  (saved to Supabase: ${out.results_saved ?? 0} rows)`);
