# Business Owners MCP

Standalone US **small-business owner / officer** lookup. Input is `{ company_name, city, state }` (optional `domain`). Output is a named person Email Finder Waterfall can consume in `name_company` mode.

Moved out of [permit-pulling PR #47](https://github.com/joshuaosborn561-lang/permit-pulling/pull/47). This repo has **no permit, parcel, or calling-list code**.

**Target:** ≥70% of small-business owners found, correct, and named across the **31 jurisdictions that publish officers**. Registered-agent-only states are skipped for now.

## Tools

| Tool | Purpose |
|------|---------|
| `health` | Key flags, 31 officer states, skipped agent-only states |
| `lookup_business_owner` | Batch lookup (`rows[]`). Counts / job_id / nameless samples. Never dump names. |
| `get_business_owner_job` | Poll. Counts only. |

HTTP: `POST /mcp` (Streamable HTTP), `GET /health`, `GET /mcp/health`. Stdio: `npm run mcp`.

## Lookup order

1. **DBA → legal name** (Serper-first): site footer / privacy / terms / copyright, then `"<name>" <city> LLC OR Inc`, then Google Maps/GBP, then free county fictitious-business-name snippets.
2. **Serper owner** for every state. High confidence (≥0.8) can skip SOS.
3. **Official SOS** for officer-publishing states. **CA hybrid:** `dz_omar/california-bizfile-scraper` then `apify/web-fetch` Statement of Information PDFs. Playwright UI is Incapsula-blocked (`ca_playwright` is opt-in).
4. **Agent-only fallback:** About page → Serper LinkedIn (`owner OR founder OR president` + company + city) → find-named-person HTTP if `FIND_NAMED_PERSON_URL` is set.
5. Every person gets a **confidence band + 0–1 score**. Registered agents are never waterfall-ready.

Prefer **Serper over Apify**. Never paid Store datasets. `APIFY_MAX_USD` is a hard cap. Live probes: **≤5 companies**, `APIFY_MAX_USD=2`.

## Skip (agent-only, later phase)

`CO OH NY WI IA ND SD KS ID ME MD NJ IN TN AR AK DE MI NM SC`

## Officer-publishing (31)

`AL AZ CA CT DC FL GA HI IL KY LA MA MN MO MS MT NC NE NH NV OK OR PA RI TX UT VA VT WA WV WY`

## Env

See `.env.example`. Required for live work: `SERPER_API_KEY`. Optional: `APIFY_TOKEN`, `APIFY_MAX_USD`, `FIND_NAMED_PERSON_URL`, Supabase (writes off).

## Run

```bash
npm install
npx tsc -p tsconfig.json --noEmit && npm test
npm start   # :8080  /health  /mcp
```

CSV probe:

```bash
export SERPER_API_KEY=... APIFY_TOKEN=... APIFY_MAX_USD=2
npx tsx scripts/owner_lookup_sample.ts --in companies.csv --out results.csv
```

CA hybrid smoke (≤5 companies):

```bash
npx tsx scripts/owner_lookup_sample.ts \
  --in ca-3.csv --out ca-3-results.csv \
  --ca-batch --ca-hybrid-only --states CA --no-serper --ca-debug \
  --checkpoint /tmp/ca-batch-3.json
```

## Deploy

Dockerfile + `railway.toml`. Health check: `/health`.

## Per-state tiers

See [PLAN.md](PLAN.md) for tiers A / B / C.
