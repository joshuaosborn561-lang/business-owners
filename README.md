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

1. **DBA → legal name** (Serper-first): site footer / privacy / terms / copyright, then `"<name>" <city> LLC OR Inc`, then Google Maps/GBP, then free county fictitious-business-name snippets. Passes the input `website` column through.
2. **Serper owner** for every state. High confidence (≥0.8) can skip SOS. Sunbiz snippets drop dates/labels and normalize LAST FIRST.
3. **Official SOS** after a Serper miss, including free HTML/bulk for **TX, GA, IL, MN, UT, WA**. **CA hybrid:** `dz_omar/california-bizfile-scraper` then `apify/web-fetch` SI PDFs. CA prefers owner/CEO/President over CFO. Playwright UI is Incapsula-blocked (`ca_playwright` is opt-in).
4. **Agent-only fallback:** About page (title-adjacent owner/President/CEO is accepted; otherwise needs LinkedIn/SOS) → Serper LinkedIn (`owner OR founder OR president` + company + city) → find-named-person HTTP if `FIND_NAMED_PERSON_URL` is set.
5. **Hard-to-find** (topup `hard-to-find-dm-discovery`): `site:linkedin.com/in "{company}" (Owner OR Founder …)` and `"{company}" "owner"`. Accept only when the surname is in the company name or both agree; reject place/generic names; skip franchise brands. Off with `HARD_TO_FIND_ENABLED=false`.
5b. **FL bulk**: `scripts/build_fl_sunbiz.py` builds sorted TSVs from the free Sunbiz quarterly corp + fictitious-name files (`FL_SUNBIZ_DIR`); lookups are a binary search, no Sunbiz HTTP. **IL LLC**: manager files from the IL DTA set (needs ~1.3 GB heap).
5c. **LLC unmask by address** (from topup `skills/unmask-shell-llc`): only for shell-looking names (address-named, numbered, Holdings/Properties/etc.) with no waterfall-ready owner. Gets the entity's address (input `address` column, else Maps), lists the other businesses at that address, and runs the Serper owner search on the operator. ~2 Places + ≤8 search credits. Disable with `UNMASK_ENABLED=false`. Probe alone: `npx tsx scripts/unmask_probe.ts shells.csv out.csv`.
6. Every person gets a **confidence band + 0–1 score**. Owner/President/CEO rank above VP/CFO on every route. Registered agents are never waterfall-ready.

Prefer **Serper over Apify**. Never paid Store datasets. `TOTAL_MAX_USD` is the unified Apify + Serper cap (falls back to `APIFY_MAX_USD`). Apify is billed from each finished run (`usageTotalUsd` + pay-per-event). Serper is **$0.001**/query, **≤8 queries/company**, stop at 0.8. Direct SOS HTTP first (≤15s); residential proxy only for bot-block states; Apify only on 403 / captcha / Incapsula. TX Comptroller FTAS JSON and FL Sunbiz ByName are direct HTTP. Live probes: **≤5 companies**, `TOTAL_MAX_USD=3`.

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

CSV probe (appends each row as it finishes; re-runs skip ids already in `--out`):

```bash
export SERPER_API_KEY=... APIFY_TOKEN=... APIFY_MAX_USD=2
npx tsx scripts/owner_lookup_sample.ts --in companies.csv --out results.csv --concurrency 5 --max-seconds 1200
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
