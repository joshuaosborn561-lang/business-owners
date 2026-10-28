/**
 * Live test of the table-job tools over MCP, the way Claude connects. Prints counts only, never rows.
 *
 *   MCP_URL=https://business-owners.up.railway.app/mcp MCP_KEY=<MCP_AUTH_TOKEN if set> \
 *   npx tsx scripts/table_jobs_smoke.ts --source scratch.some_table --id place_id [--dest scratch.bo_x] [--limit 100]
 *       -> dry run only (no spend, nothing written)
 *   ... --run --max-usd 3      -> pilot run: starts the job, polls until done/capped, prints the summary
 */
const base = process.env.MCP_URL || 'http://localhost:8080/mcp';
const URL_ = process.env.MCP_KEY ? `${base}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(process.env.MCP_KEY)}` : base;
const args = process.argv.slice(2);
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const source = arg('--source');
const idCol = arg('--id');
if (!source || !idCol) {
  console.error('usage: npx tsx scripts/table_jobs_smoke.ts --source schema.table --id id_column [--dest schema.bo_x] [--limit N] [--default-state CA] [--run --max-usd N]');
  process.exit(1);
}

let sid = '';
let id = 0;
async function rpc(method: string, params?: unknown): Promise<any> {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}) },
    body: JSON.stringify(method.startsWith('notifications/') ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }),
  });
  sid = res.headers.get('mcp-session-id') || sid;
  const text = await res.text();
  const json = text.split('\n').map((l) => l.replace(/^data: /, '')).find((l) => l.startsWith('{'));
  return json ? JSON.parse(json) : { error: { message: `http ${res.status}` } };
}
const tool = async (name: string, a: Record<string, unknown>) => {
  const r = await rpc('tools/call', { name, arguments: a });
  if (!r.result) throw new Error(JSON.stringify(r.error));
  return JSON.parse(r.result.content[0].text);
};

await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'table-jobs-smoke', version: '1' } });
await rpc('notifications/initialized');
const health = await tool('health', {});
console.log(`server: ${base}  table_jobs_configured=${health.table_jobs_configured}`);

const common = {
  source_table: source,
  id_column: idCol,
  ...(arg('--dest') ? { dest_table: arg('--dest') } : {}),
  ...(arg('--limit') ? { limit: Number(arg('--limit')) } : {}),
  ...(arg('--default-state') ? { default_state: arg('--default-state') } : {}),
};
const dry = await tool('start_table_job', { ...common, dry_run: true });
if (!dry.ok) {
  console.log('dry run failed:', dry.error, dry.missing_env || '');
  process.exit(1);
}
const e = dry.estimate;
console.log(`\nDRY RUN  spent=$${dry.spent_usd}  matching=${dry.matching_rows} already_done=${dry.already_done} selected=${dry.selected}`);
console.log(`dest=${dry.dest_table}  columns=${JSON.stringify(dry.column_map)}`);
console.log(`estimate: rows=${e.rows} ceiling=$${e.total_usd_max} per_row_max=$${e.per_row_usd_max} expected=$${e.expected_usd_low}-$${e.expected_usd_high} runtime~${Math.round(e.runtime_seconds / 60)}min`);
console.log(`by state: ${JSON.stringify(e.rows_by_state)}`);
for (const w of dry.warnings || []) console.log(`warning: ${w}`);
if (!args.includes('--run')) {
  console.log('\nDry run only. Add --run --max-usd N to start.');
  process.exit(0);
}

const maxUsd = Number(arg('--max-usd'));
const started = await tool('start_table_job', { ...common, dry_run: false, max_usd: maxUsd });
console.log(`\nstarted ${started.job_id} ok=${started.ok} ${started.error || ''}`);
if (!started.ok) process.exit(1);
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await tool('get_table_job_status', { job_id: started.job_id });
  console.log(`${s.status} ${s.processed}/${s.total} named=${s.named} errors=${s.errors} spend=$${s.spend_usd}/$${s.max_usd}`);
  if (['completed', 'capped', 'failed', 'cancelled'].includes(s.status)) break;
}
console.log(JSON.stringify((await tool('export_table_job_summary', { job_id: started.job_id })).results, null, 2));
