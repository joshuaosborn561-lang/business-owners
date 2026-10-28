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
| `start_table_job` | Table mode: read a Supabase table server-side, write results to a table. `dry_run` (default) = estimate only. See [Table jobs](#table-jobs). |
| `get_table_job_status` / `export_table_job_summary` | Progress and aggregate counts. Never rows or names. |
| `resume_table_job` / `cancel_table_job` | Continue a capped/failed/stalled job (optionally with a higher approved `max_usd`) or stop one. |

HTTP: `POST /mcp` (Streamable HTTP), `GET /health`, `GET /mcp/health`. Stdio: `npm run mcp`.

## Table jobs

For big lists (e.g. ~9.5K EMCOR owner companies from claude.ai) lead rows must not pass through chat. Table mode keeps them server-side:

```
start_table_job(source_table, id_column, dest_table?, filters?, limit?, column_map?, default_state?, dry_run=true, max_usd?)
```

1. **Dry run (default):** counts by state, per-row and total cost ceiling, expected spend, runtime, warnings. Reads counts only; creates, writes and spends nothing.
2. **Run:** same call with `dry_run=false` and `max_usd` (the dollar ceiling the user approved, at most `TABLE_JOBS_MAX_USD`, default 100). Returns a `job_id` immediately; the job runs in the background (50 rows per batch, `LOOKUP_CONCURRENCY` lanes).
3. **Poll / finish:** `get_table_job_status(job_id)`, then `export_table_job_summary(job_id)` (counts only). Results are rows in `dest_table`; `waterfall_ready = true` rows feed Email Finder `name_company` mode.

Guarantees

- **No lead data in replies.** Tool output is counts, dollars and ids of jobs only.
- **Hard cap.** The job stops as `capped` at `max_usd`. A row is started only if every in-flight row could still finish inside the cap, so a row that ran out of budget stays pending (not recorded as a miss). `resume_table_job(job_id, max_usd)` continues after a higher ceiling is approved. `spend_usd` (spend tracker) is authoritative; `dest.cost_usd` is per-row attribution.
- **Idempotent per row.** Results are keyed by `source_id` (= `id_column`) in `dest_table`. Rows already `named`/`miss` are never fetched or charged again; `error` rows retry up to 3 times; a later miss never overwrites a named row. Calling `start_table_job` again continues the same job; a finished job starts the next chunk (`limit` counts only rows still to do).
- **Resumable.** Progress is in Postgres (`bo_jobs.job` + the destination table), not memory. A heartbeat + claim fence lets a restarted or second instance take over a stalled job (boot + 60s sweeper, or `resume_table_job`). At most one in-flight batch of work is lost on a crash.
- **Allowlists.** Sources: schemas `scratch, client_emcor, client_salesglider, client_peterson, client_techevo, lp, public`. Destinations: `scratch, client_*`, table name must start with `bo_`; the table is created with a fixed shape (`source_id, status, owner_first, owner_last, owner_title, owner_email, owner_phone, legal_name, source, source_url, confidence, confidence_score, waterfall_ready, coverage_reason, cost_usd, attempts, error, processed_at`). Identifiers must be lowercase `[a-z_][a-z0-9_]{0,62}`; filters are structured (`column`, `op`, `value`), never SQL. Enforced twice: here, and in SQL (`bo_jobs.allowed_schema`, `%I`/`%L` only).
- **Pilot first.** `limit=100` measures the real cost per row before a big run.

Database side: `supabase/migrations/20261028_table_jobs.sql` (schema `bo_jobs`, token-checked RPCs `public.bo_tj_*`; RLS on, no grants on the tables). Same pattern as the FL/IL registry RPCs.

Env (all required for table mode; without them the tools answer "not configured"):

| Var | Value |
|-----|-------|
| `TABLE_JOBS_SUPABASE_URL` | URL of the project holding the lead tables (`https://azpapwtnrbzywlnxxecz.supabase.co`) |
| `TABLE_JOBS_SUPABASE_KEY` | that project's publishable/anon key |
| `TABLE_JOBS_TOKEN` | random secret; its sha256 is in `bo_jobs.api_token` |
| `MCP_AUTH_TOKEN` | optional but recommended: require `Authorization: Bearer` or `?key=` on `/mcp` (add the connector in claude.ai as `https://.../mcp?key=...`) |
| `TABLE_JOBS_MAX_USD` | per-job `max_usd` ceiling (default 100) |
| `TABLE_JOBS_READ_SCHEMAS` / `TABLE_JOBS_WRITE_SCHEMAS` | optional narrower allowlists |
| `TABLE_JOBS_BATCH`, `TABLE_JOBS_AUTORESUME=false` | optional |

Smoke test (counts only): `MCP_URL=... MCP_KEY=... npx tsx scripts/table_jobs_smoke.ts --source schema.table --id place_id [--limit 100] [--run --max-usd 3]`.

SQL integration tests run against a throwaway Postgres + PostgREST (`TJ_TEST_*`, see `src/server/lib/tableJobs/rpc.integration.test.ts`); they are skipped otherwise.

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
