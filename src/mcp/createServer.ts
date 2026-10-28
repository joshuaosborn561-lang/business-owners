import { unblockerConfigFromEnv } from '../server/lib/stateOwners/sos/unblocker.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { config, hasSupabase } from '../server/config.js';
import { apifyResidentialProxyConfigured } from '../server/lib/stateOwners/http.js';
import {
  AGENT_ONLY_SKIP_CODES,
  OFFICER_PUBLISHING_CODES,
  apifyTokenFromEnv,
  serperKeyFromEnv,
} from '../server/lib/stateOwners/sos/index.js';
import {
  getBusinessOwnerJob,
  getOwnerResults,
  lookupBusinessOwner,
} from '../server/services/lookupBusinessOwner.js';
import {
  cancelTableJob,
  exportTableJobSummary,
  getTableJobStatus,
  resumeTableJob,
  startTableJob,
} from '../server/services/tableJobs.js';
import { rpcConfigFromEnv } from '../server/lib/tableJobs/store.js';
import { GUIDE_MARKDOWN, SERVER_INSTRUCTIONS, WHEN_TO_USE_MARKDOWN } from './instructions.js';

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

export function healthPayload() {
  return {
    ok: true,
    product: 'Business Owners MCP',
    supabaseConfigured: hasSupabase(),
    serper_configured: Boolean(config.serperApiKey || serperKeyFromEnv()),
    apify_configured: Boolean(config.apifyToken || apifyTokenFromEnv()),
    apify_max_usd: config.apifyMaxUsd,
    apify_usd_per_company: config.apifyUsdPerCompany,
    apify_residential_proxy_configured: apifyResidentialProxyConfigured(),
    find_named_person_configured: Boolean(config.findNamedPersonUrl),
    unblocker_configured: unblockerConfigFromEnv() !== null,
    unblocker_provider: unblockerConfigFromEnv()?.provider ?? null,
    open_data_enabled: process.env.OPEN_DATA_ENABLED !== 'false',
    writes_enabled: config.writesEnabled,
    officer_publishing_states: [...OFFICER_PUBLISHING_CODES],
    skipped_agent_only_states: [...AGENT_ONLY_SKIP_CODES],
    tools: [
      'health',
      'lookup_business_owner',
      'get_business_owner_job',
      'get_owner_results',
      'start_table_job',
      'get_table_job_status',
      'export_table_job_summary',
      'resume_table_job',
      'cancel_table_job',
    ],
    table_jobs_configured: Boolean(rpcConfigFromEnv()),
    results_table: 'business_owners.owner_hits',
    results_db_configured: Boolean(process.env.BO_SUPABASE_URL && process.env.BO_SUPABASE_KEY && process.env.BO_REGISTRY_TOKEN),
    when_to_use:
      'Company name + city + state owner/officer lookup for Email Finder name_company mode. No permit number.',
    when_not_to_use:
      'Permits, parcels, calling lists.',
  };
}

export function createBusinessOwnersMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'business-owners',
      version: '0.1.0',
      title: 'Business Owners MCP',
      description:
        'USE FOR: US small-business owner/officer lookup from company + city + state. DO NOT USE FOR: permits, parcels. Returns owner first/last name + title for Email Finder Waterfall name_company mode.',
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerResource(
    'bo_guide',
    'business-owners://guide',
    {
      title: 'Business Owners MCP operator guide',
      description: 'Serper-first SOS lookup, DBA resolver, agent fallback, CA hybrid.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE_MARKDOWN }],
    }),
  );

  server.registerResource(
    'bo_when_to_use',
    'business-owners://when-to-use',
    {
      title: 'When to use Business Owners MCP',
      description: 'Yes/no decision.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: WHEN_TO_USE_MARKDOWN }],
    }),
  );

  server.registerTool(
    'health',
    {
      title: 'Health check',
      description: 'Readiness: Serper/Apify key flags, 31 officer states, skipped agent-only states. Call first.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => jsonResult(healthPayload()),
  );

  server.registerTool(
    'lookup_business_owner',
    {
      title: 'Lookup US business owners by company + city + state',
      description: `WHEN TO USE: Need an owner/officer name with no permit or license number. Input is company name + city + state (optional domain).
WHAT IT DOES: DBA→legal name (website footer/privacy/terms/copyright, Serper LLC/Inc query, Maps/GBP, free county FBN) → Serper owner → official SOS (CA hybrid dz_omar + web-fetch SI PDFs) → agent fallback (About page, LinkedIn Serper, find-named-person). Prefer Serper over Apify. APIFY_MAX_USD is a hard cap. Never paid datasets. estimate_only quotes credits/$. ca_batch defaults to hybrid-only. RETURNS: owners[] (first_name, last_name, title, company, domain, source, confidence) plus counts, cost and per-state hit rates. Every result is saved to business_owners.owner_hits; get_owner_results pages the rest or returns CSV.
ORDER: free open data first (PA officers, FMCSA by phone, NPPES, state license / liquor / trade-name files, FL + IL bulk) → Serper → official registry (unblocker lane for bot-walled states when UNBLOCKER_API_KEY is set) → About/LinkedIn → unmask. Pass phone from the Maps row: it is the strongest join key.\nQUOTE FIRST: call with estimate_only=true, show quote.total_usd_max to the user, and run only after they approve.\nSKIP STATES: CO OH NY WI MD NJ SC KS DE ME (no officer data exists; trade names, license files and web still run).
NEXT: get_business_owner_job(job_id). Local CSV: npx tsx scripts/owner_lookup_sample.ts --in companies.csv --out results.csv.`,
      inputSchema: {
        source_table: z.string().optional().describe('Not used here. To run on a Supabase table without pasting rows, use start_table_job.'),
        where: z.string().optional().describe('Not used here. start_table_job takes structured filters.'),
        rows: z
          .array(
            z.object({
              company_name: z.string().min(1),
              city: z.string().optional(),
              state: z.string().min(2),
              domain: z.string().optional(),
              phone: z.string().optional().describe('Business phone from Maps. Joins FMCSA, license and liquor files.'),
              website: z.string().optional().describe('Company website URL or host. Used for DBA + About fallback.'),
              address: z.string().optional().describe('Principal address. Used by the LLC unmask step.'),
              mailing_address: z.string().optional().describe('Parcel / tax-bill mailing address (e.g. permit-pulling parcels). Preferred by the LLC unmask step.'),
            }),
          )
          .optional()
          .describe('Small batch. Prefer ≤5 on live Apify probes.'),
        states: z
          .array(z.string())
          .optional()
          .describe('Optional state codes. Default: the 41 jurisdictions with an official owner source.'),
        max_rows: z.number().int().min(1).max(5000).optional(),
        dry_run: z.boolean().optional().describe('Ignored; results are always saved.'),
        client_tag: z.string().optional().describe('Tag results (e.g. a client name) so get_owner_results can pull them by client.'),
        inline_limit: z.number().int().min(0).max(1000).optional().describe('Owners returned inline in the reply. Default 200.'),
        estimate_only: z.boolean().optional().describe('Quote only: rows, per-state counts, Serper/Apify/unblocker ceilings. No fetches, no spend. Always run first.'),
        include_agents: z.boolean().optional().describe('Default false. Agents are never waterfall-ready.'),
        wait: z.boolean().optional().describe('Default true. If false, return job_id and poll get_business_owner_job.'),
        ca_batch: z
          .boolean()
          .optional()
          .describe('CA only: hybrid dz_omar + web-fetch SI PDFs by default. Enforces APIFY_MAX_USD.'),
        ca_hybrid_only: z.boolean().optional().describe('Default true with ca_batch: skip Playwright.'),
        ca_playwright: z.boolean().optional().describe('Opt into the Incapsula-blocked Playwright UI path.'),
        ca_max_results: z.number().int().min(1).max(50).optional().describe('dz_omar maxResultsPerQuery. Default 3.'),
        ca_debug: z.boolean().optional().describe('Log per-step HTTP status.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return jsonResult(await lookupBusinessOwner(args));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'lookup_business_owner failed');
      }
    },
  );

  server.registerTool(
    'get_business_owner_job',
    {
      title: 'Business owner lookup — job status',
      description:
        'Poll lookup_business_owner. Returns status, processed/named, remaining, per-state hit rates, spend, owners_available. When completed, call get_owner_results.',
      inputSchema: { job_id: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return jsonResult(await getBusinessOwnerJob(args.job_id));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'get_business_owner_job failed');
      }
    },
  );

  server.registerTool(
    'get_owner_results',
    {
      title: 'Business owner lookup — owner names',
      description:
        'Owner names from a lookup job (or every job for a client_tag): first_name, last_name, title, company, legal_name, domain, phone, owner_email/owner_phone when a public file had one, source, confidence. Default only waterfall-ready owners; only_named=false includes misses. format=csv returns a CSV string. Page with limit/offset (max 5000).',
      inputSchema: {
        job_id: z.string().optional(),
        client_tag: z.string().optional(),
        only_named: z.boolean().optional().describe('Default true: only owners ready for the email waterfall.'),
        format: z.enum(['json', 'csv']).optional(),
        limit: z.number().int().min(1).max(5000).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return jsonResult(await getOwnerResults(args));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : 'get_owner_results failed');
      }
    },
  );

  const TABLE_JOB_ID = z.string().regex(/^tj-[a-f0-9]{10}(-\d{1,3})?$/).describe('job_id returned by start_table_job');

  server.registerTool(
    'start_table_job',
    {
      title: 'Owner lookup on a Supabase table (server-side, no rows in chat)',
      description: `WHEN TO USE: more than a handful of companies, or any time lead rows must not pass through chat. The server reads the rows from a Supabase table, runs the same owner lookup as lookup_business_owner, and writes one result row per source row to dest_table. This tool never returns lead rows or names: only counts, costs and a nameless sample.
ALWAYS dry_run first (the default): returns the row counts by state, a per-row and total cost ceiling, expected spend, runtime and warnings, and spends/writes/creates nothing. Show it to the user. Run only after they approve: call again with dry_run=false and max_usd = the approved dollar ceiling. The job stops by itself at max_usd (status "capped"; done rows are kept).
SAFE TO REPEAT: results are keyed by id_column in dest_table. Rows already done are skipped and never charged again; calling again with the same source/dest/filters continues the same job. Start with limit=100 as a pilot.
TABLES: source_table and dest_table are schema.table in an allowlisted schema (sources: scratch, client_*, lp, public; destinations: scratch, client_* and the table name must start with bo_). dest_table defaults to <schema>.bo_owners_<source table>. The destination table is created for you with a fixed shape: source_id, status (named|miss|error), owner_first, owner_last, owner_title, owner_email, owner_phone, legal_name, source, confidence, waterfall_ready, cost_usd...
COLUMNS: company name, city, state, phone, domain, website, address are auto-detected; pass column_map {company_name:'name', state:'st', ...} to override. If the table has no state column pass default_state (e.g. "CA").
FILTERS: structured, never SQL: [{column:'state', op:'eq', value:'CA'}, {column:'status', op:'in', values:['a','b']}]. ops: eq neq gt gte lt lte like ilike in not_in is_null not_null.
NEXT: get_table_job_status(job_id), then export_table_job_summary(job_id).`,
      inputSchema: {
        source_table: z.string().describe('schema.table to read, e.g. client_emcor.owner_netnew_20261010'),
        id_column: z.string().describe('Unique key column of the source table (e.g. place_id or id). Must be unique among matching rows.'),
        filters: z
          .array(
            z.object({
              column: z.string(),
              op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'not_in', 'is_null', 'not_null']).optional(),
              value: z.union([z.string(), z.number(), z.boolean()]).optional(),
              values: z.array(z.union([z.string(), z.number(), z.boolean()])).max(1000).optional(),
            }),
          )
          .max(20)
          .optional(),
        limit: z.number().int().min(1).max(20000).optional().describe('Max rows to run in this job (default 500). Done rows do not count.'),
        dest_table: z.string().optional().describe('schema.bo_<name>. Created if missing. Default <schema>.bo_owners_<source table>.'),
        dry_run: z.boolean().optional().describe('Default true: estimate only, spends nothing, writes nothing.'),
        max_usd: z.number().positive().optional().describe('Required when dry_run=false: the dollar ceiling the user approved. The job stops at this amount.'),
        column_map: z
          .object({
            company_name: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            phone: z.string().optional(),
            domain: z.string().optional(),
            website: z.string().optional(),
            address: z.string().optional(),
            mailing_address: z.string().optional(),
          })
          .optional()
          .describe('Override auto-detected source columns.'),
        default_state: z.string().optional().describe('State used when the table has no state column or the value is blank, e.g. "CA".'),
        client_tag: z.string().optional(),
        ca_batch: z.boolean().optional().describe('CA rows through the hybrid CA BizFile batch (same as lookup_business_owner). Default false.'),
        ca_max_results: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => jsonResult(await startTableJob(args)),
  );

  server.registerTool(
    'get_table_job_status',
    {
      title: 'Table job status',
      description:
        'Progress of a start_table_job run: status (queued|running|completed|capped|failed|cancelled), processed/total, named, misses, errors, hit rate overall and by state, spend vs max_usd. Counts only, no names. Survives server restarts.',
      inputSchema: { job_id: TABLE_JOB_ID },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => jsonResult(await getTableJobStatus(args.job_id)),
  );

  server.registerTool(
    'export_table_job_summary',
    {
      title: 'Table job summary (counts only)',
      description:
        'Aggregate counts from the destination table for a job: rows, named, waterfall_ready, misses, errors, with email/phone, spend, breakdown by source / confidence / miss reason, hit rate. Never returns rows or names; downstream steps read dest_table directly.',
      inputSchema: { job_id: TABLE_JOB_ID },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => jsonResult(await exportTableJobSummary(args.job_id)),
  );

  server.registerTool(
    'resume_table_job',
    {
      title: 'Resume a capped, failed or stalled table job',
      description:
        'Continue a job that stopped at its cap, failed, or stalled after a restart. Only the rows without a result are run. To go past a cap, pass a higher max_usd that the user approved.',
      inputSchema: { job_id: TABLE_JOB_ID, max_usd: z.number().positive().optional().describe('New approved ceiling (must be >= the current one).') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => jsonResult(await resumeTableJob(args.job_id, args.max_usd)),
  );

  server.registerTool(
    'cancel_table_job',
    {
      title: 'Cancel a table job',
      description: 'Stop a running table job after its current batch. Nothing is deleted: results so far stay in dest_table.',
      inputSchema: { job_id: TABLE_JOB_ID },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => jsonResult(await cancelTableJob(args.job_id)),
  );

  return server;
}
