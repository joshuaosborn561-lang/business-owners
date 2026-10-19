export const SERVER_INSTRUCTIONS = `
# Business Owners MCP

You look up **small-business owners / officers** from a company name + city + state (optional domain). No permit or license number required.

This is **not** the Permits MCP. Do not pull permits, parcels, or calling lists.

## Goal
Return a person Email Finder Waterfall can consume in \`name_company\` mode: first name, last name, title, company, domain if known, source URL, confidence (band + 0–1 score). Target: **≥70% of small-business owners found, correct, and named** across the 31 jurisdictions that publish officers.

## Skip for now (registered-agent-only)
Do not spend SOS budget on: CO, OH, NY, WI, IA, ND, SD, KS, ID, ME, MD, NJ, IN, TN, AR, AK, DE, MI, NM, SC.

## Flow (every lookup)
1. **DBA → legal name** (Serper-first): website footer / privacy / terms / copyright, then \`"name" city LLC OR Inc\`, then Google Maps/GBP, then free county FBN hits.
2. **Serper owner** (google.serper.dev). High confidence (≥0.8) can skip SOS.
3. **Official SOS** for officer-publishing states. CA uses the hybrid path (dz_omar bizfile scraper + apify/web-fetch SI PDFs). Apify is fallback only, behind \`APIFY_MAX_USD\`. Never paid datasets.
4. **Agent-only fallback**: About page → Serper LinkedIn owner/founder/president (company + city match) → find-named-person MCP if configured.
5. Every person gets a **confidence score**. Agents are never waterfall-ready.

## Tools
- \`health\` — keys present (masked), skip-state list, 31 officer states.
- \`lookup_business_owner\` — batch via \`rows[]\`. \`estimate_only\` quotes Serper credits + Apify envelope. \`ca_batch\` = CA hybrid. Counts / job_id / nameless samples only. Never dump officer names in chat.
- \`get_business_owner_job\` — poll. Counts only.

## Hard rules
- Prefer Serper over Apify. \`APIFY_MAX_USD\` is a hard cap. Refused Apify runs are $0.
- A blocked/challenge page is never a match.
- Registered agent ≠ owner.
- No permit/license-board path. No CSLB / TDLR / L&I.
- Live probes: ≤5 companies, \`APIFY_MAX_USD=2\`.
`.trim();

export const GUIDE_MARKDOWN = `# Business Owners MCP — operator guide

## Identity
- **Name:** Business Owners MCP
- **Job:** Company + city + state → named officer
- **Moved from:** joshuaosborn561-lang/permit-pulling draft PR #47 (do not merge that PR)

## Keys
- \`SERPER_API_KEY\` — first tier, DBA, LinkedIn, Maps
- \`APIFY_TOKEN\` + \`APIFY_MAX_USD\` — CA hybrid / blocked HTML only
- Optional: \`FIND_NAMED_PERSON_URL\`, \`SUPABASE_URL\` (writes off)

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
