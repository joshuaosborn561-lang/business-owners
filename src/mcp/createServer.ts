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
  lookupBusinessOwner,
} from '../server/services/lookupBusinessOwner.js';
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
    tools: ['health', 'lookup_business_owner', 'get_business_owner_job'],
    when_to_use:
      'Company name + city + state owner/officer lookup for Email Finder name_company mode. No permit number.',
    when_not_to_use:
      'Permits, parcels, calling lists, paid SOS datasets, registered-agent-only states.',
  };
}

export function createBusinessOwnersMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'business-owners',
      version: '0.1.0',
      title: 'Business Owners MCP',
      description:
        'USE FOR: US small-business owner/officer lookup from company + city + state. DO NOT USE FOR: permits, parcels, paid SOS datasets. Prefer Serper over Apify. Never dump officer names.',
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
WHAT IT DOES: DBA→legal name (website footer/privacy/terms/copyright, Serper LLC/Inc query, Maps/GBP, free county FBN) → Serper owner → official SOS (CA hybrid dz_omar + web-fetch SI PDFs) → agent fallback (About page, LinkedIn Serper, find-named-person). Prefer Serper over Apify. APIFY_MAX_USD is a hard cap. Never paid datasets. estimate_only quotes credits/$. ca_batch defaults to hybrid-only. Counts, job_id, per-state hit rates, nameless samples, confidence. Never dump names.
ORDER: free open data first (PA officers, FMCSA by phone, NPPES, state license / liquor / trade-name files, FL + IL bulk) → Serper → official registry (unblocker lane for bot-walled states when UNBLOCKER_API_KEY is set) → About/LinkedIn → unmask. Pass phone from the Maps row: it is the strongest join key.\nQUOTE FIRST: call with estimate_only=true, show quote.total_usd_max to the user, and run only after they approve.\nSKIP STATES: CO OH NY WI MD NJ SC KS DE ME (no officer data exists; trade names, license files and web still run).
NEXT: get_business_owner_job(job_id). Local CSV: npx tsx scripts/owner_lookup_sample.ts --in companies.csv --out results.csv.`,
      inputSchema: {
        source_table: z.string().optional().describe('Later: schema.table. This phase needs rows[].'),
        where: z.string().optional().describe('Later SQL predicate for source_table'),
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
        dry_run: z.boolean().optional().describe('Default true. This phase never writes to Supabase.'),
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
        ca_debug: z.boolean().optional().describe('Log per-step HTTP status. Do not dump names.'),
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
        'Poll lookup_business_owner. Returns status, processed/named/agent_only, remaining, per-state hit rates, serper_credits, apify_usd_spent. Never names.',
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

  return server;
}
