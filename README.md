# Business Owners MCP

Standalone US **small-business owner / officer** lookup. Input is `{ company_name, city, state }` (optional `domain`). Output is a named person Email Finder Waterfall can consume in `name_company` mode.

Moved out of [permit-pulling PR #47](https://github.com/joshuaosborn561-lang/permit-pulling/pull/47). This repo has **no permit, parcel, or calling-list code**.

**Target:** 60-70% of small-business owners named in every state. 41 jurisdictions have an official owner source (registry, open data, license or trade-name file); the 10 structurally agent-only states (CO OH NY WI MD NJ SC KS DE ME) run trade-name, license, national-overlay and web steps only. Plan and evidence: `OWNER_PLAN_2026-10.md`, `research/2026-10-25/`.

## Tools

| Tool | Purpose |
|------|---------|
| `health` | Key flags (Serper, Apify, unblocker, open data), 41 officer states, skipped agent-only states |
| `lookup_business_owner` | Batch lookup (`rows[]`, pass `phone`). `estimate_only=true` first returns a `quote` (rows, per-state counts, Serper / Apify / unblocker ceilings); run only after approval. Counts / job_id / nameless samples. Never dump names. |
| `get_business_owner_job` | Poll. Counts only. |

HTTP: `POST /mcp` (Streamable HTTP), `GET /health`, `GET /mcp/health`. Stdio: `npm run mcp`.

## Lookup order

0. **Free public files** (`openDataSources.ts`, $0, no bot walls): national overlays first (FMCSA census by phone/name for anything with a USDOT number; NPPES authorized official for healthcare), then the state's files: PA officers (`xvd7-5r2c`), CO trade names, OR CCB `rmi_name`, NY DMV owner_name + NYC DOB, WA L&I principal, MO liquor OWN/PART/MGR, Chicago license owners, IL IDFPR, TX TABC (passes the LLC name on when the licensee is an entity), DC Basic Business License owner. FL Sunbiz + IL DTA bulk (incl. corp president/secretary) run in the official step. Off with `OPEN_DATA_ENABLED=false`.
1. **DBA → legal name** (Serper-first): site footer / privacy / terms / copyright, then `"<name>" <city> LLC OR Inc`, then Google Maps/GBP, then free county fictitious-business-name snippets.
2. **Serper owner** for every state. High confidence (≥0.8) can skip SOS.
3. **Official registry** after a Serper miss. Open from a datacenter: TX Comptroller JSON, KY, WV, MN, AL, AR, NE, ID, NM, ND, RI, SD, VT, DE, DC. Bot-walled (GA NC UT MO MS MT HI AK NH MA NV WA WY MI AZ IA KS IN TN VA OR SC): routed through the **unblocker** (`unblocker.ts`, Zyte / Bright Data / ScrapingBee / ScraperAPI via `UNBLOCKER_*` env, charged to `TOTAL_MAX_USD`) before Apify. CA hybrid stays on Apify.
4. **Agent-only fallback:** About page → Serper LinkedIn → find-named-person. Registered agents count only when the agent is a person at the business address or the surname is in the company name.
5. **Hard-to-find** and **LLC unmask by address** as before.

## Skip (structurally agent-only)

`CO OH NY WI MD NJ SC KS DE ME` — no officer data exists in the state. Trade-name files, license rosters, FMCSA/NPPES and the web cascade still run for these.

## Env

See `.env.example`. Required for live work: `SERPER_API_KEY`. Recommended: `UNBLOCKER_PROVIDER` + `UNBLOCKER_API_KEY` (bot-walled registries). Optional: `APIFY_TOKEN`, `APIFY_MAX_USD`, `FIND_NAMED_PERSON_URL`, Supabase (writes off).

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

## Plan and research

- `OWNER_PLAN_2026-10.md`: the current 50-state plan (tiers, buy list, roadmap, matching rules). Written from a fresh verification of every source on Oct 25 2026.
- `research/2026-10-25/`: per-state findings with VERIFIED/UNVERIFIED tags and URLs, national datasets, paid vendors, and datacenter reachability.
- `STATE_PLAYBOOK.md`: older notes; superseded by the plan where they disagree.
