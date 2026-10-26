export const SERVER_INSTRUCTIONS = `
# Business Owners MCP

You find the **owner of a small business** (first name, last name, title) from company name + city + state, plus phone and website when you have them (phone is the strongest match key). The owner name is the deliverable: it goes to Email Finder Waterfall in \`name_company\` mode for email and mobile.

## Flow
1. **Quote first.** Call \`lookup_business_owner\` with \`estimate_only=true\`. Show the user \`quote.total_usd_max\` and the per-state row counts. Run only after they approve.
2. **Run.** Same rows, \`estimate_only=false\`. Optional \`client_tag\` so results can be pulled by client later. For more than ~200 rows pass \`wait=false\` and poll \`get_business_owner_job\`.
3. **Get the owners.** The reply's \`owners\` array holds each named owner (first_name, last_name, title, company_name, legal_name, domain, phone, owner_email/owner_phone when a public file carried one, source, confidence_score). \`get_owner_results(job_id)\` pages the rest; \`format=csv\` returns a CSV. Every result is also saved in Supabase \`business_owners.owner_hits\`.
4. **Hand off.** Send owners to Email Finder Waterfall as name_company rows (first_name, last_name, company_name, domain).

## What runs per row
Free public files first (PA officers, FMCSA, NPPES, state license / liquor / trade-name files, FL + IL bulk) → Serper → official registry (bot-walled states through the unblocker) → About page / LinkedIn → LLC unmask by address. Registered agents count only when they are a person at the business address or their surname is in the company name.

## Rules
- Only \`waterfall_ready=true\` owners are returned by default; \`only_named=false\` includes misses and low-confidence candidates.
- \`TOTAL_MAX_USD\` caps Serper + unblocker + Apify spend per run.
- Agent-only states (CO OH NY WI MD NJ SC KS DE ME) still run the free files and web steps; expect lower hit rates there.
`.trim();

export const GUIDE_MARKDOWN = `# Business Owners MCP — operator guide

## Identity
- **Name:** Business Owners MCP
- **Job:** Company + city + state → named officer
- **Moved from:** joshuaosborn561-lang/permit-pulling draft PR #47 (do not merge that PR)

## Keys
- \`SERPER_API_KEY\` — first tier, DBA, LinkedIn, Maps
- \`APIFY_TOKEN\` + \`APIFY_MAX_USD\` — CA hybrid / blocked HTML only
- \`UNBLOCKER_PROVIDER\` + \`UNBLOCKER_API_KEY\` — bot-walled registries
- \`BO_SUPABASE_URL\` / \`BO_SUPABASE_KEY\` / \`BO_REGISTRY_TOKEN\` — FL/IL bulk and the owner_hits results table

## CA
Hybrid default: \`dz_omar/california-bizfile-scraper\` then \`apify/web-fetch\` SI PDFs. Playwright UI is Incapsula-blocked; \`ca_playwright\` is opt-in only.

## Local CSV
\`npx tsx scripts/owner_lookup_sample.ts --in companies.csv --out results.csv\`
`;

export const WHEN_TO_USE_MARKDOWN = `# When to use Business Owners MCP

## Yes
- "Who owns this HVAC shop in Fresno?"
- Top-up bots that have company + city + state and no license number
- CA BizFile / IL DTA / GA NC AZ HTML SOS

## No
- Permit / license-board lookup (that stays on Permits MCP)
- Registered-agent-only states listed in health
- Paid SOS datasets, SOSfinder, OpenSOSData
`;
