# US business-owner lookup — standalone service plan

Status: **moved from permit-pulling PR #47**. This repo is the SOS / name path only. Do not merge that PR; it stays a draft for Josh to close.

Goal: **≥70% of small-business owners found, correct, and named** across the 31 officer-publishing jurisdictions. CA baseline on the old PR: ~50% entity matches, ~30% officers. Biggest misses: trade/DBA names ≠ legal name, and filings that list only an agent.

No permit code. Prefer Serper over Apify. No paid datasets. Live tests ≤5 companies, `APIFY_MAX_USD=2`.

---

## Skip for now (20)

Registered-agent-only (or no public officer roster):

`CO, OH, NY, WI, IA, ND, SD, KS, ID, ME, MD, NJ, IN, TN, AR, AK, DE, MI, NM, SC`

Do not spend SOS/Apify budget here. Serper + DBA + About/LinkedIn fallback may still run if a row is passed explicitly.

## Officer-publishing (31)

`AL AZ CA CT DC FL GA HI IL KY LA MA MN MO MS MT NC NE NH NV OK OR PA RI TX UT VA VT WA WV WY`

---

## Shared layers (all 31)

These are not per-state scrapers. They are how we get from 30% CA officers toward 70%.

| Layer | What | Cost |
|-------|------|------|
| DBA → legal name | Footer / privacy / terms / copyright; Serper `"name" city LLC OR Inc`; Maps/GBP; free county FBN snippets | Serper credits |
| Serper owner | Officer/owner Google + OpenCorporates / Bizapedia / Sunbiz / SOS host | ~5 credits/row |
| Agent fallback | About page; LinkedIn Serper (company+city); find-named-person HTTP | Serper + optional FNP |
| Confidence | 0–1 score on every person. Agents stay 0.2 / not waterfall-ready | $0 |

---

## Tier A — working in this PR

Adapters that already run (fixture-tested; CA hybrid live-proven on the old PR).

| Code | Source | Officers | Notes |
|------|--------|----------|-------|
| **CA** | bizfileOnline + SI PDF | filings_pdf | Hybrid: `dz_omar/california-bizfile-scraper` (`maxResultsPerQuery=3`) + `apify/web-fetch` SI. Playwright still Incapsula-blocked. Name validation + query normalize + city-gated trigram. |
| **IL** | DTA bulk zips | officers | Auto-download `ilsos.gov/data/bs`. Never scrape the search UI. |
| **GA** | eCorp HTML | officers | Direct HTML, Apify only if blocked. |
| **NC** | SOS HTML | officers | Challenge pages ≠ matches. |
| **AZ** | Business Center JSON/HTML | officers | SPA shell is not a match. |

Plus Serper-first + DBA + agent fallback on every officer-publishing state.

**CA next levers (still Tier A):** DBA resolver on trade names (the 50% entity miss), agent fallback on SI-agent-only (the officer miss), keep `maxResultsPerQuery=3`, distinctive local names, never famous-brand queries.

---

## Tier B — free official HTML / open data, next adapters

Wire these as SOS adapters (direct HTTP first, Apify HTML fallback only after Serper miss). No paid bulk.

| Code | Source | Why B |
|------|--------|-------|
| **FL** | Sunbiz HTML (reuse later; public SFTP has officers) | High volume, officers on record |
| **TX** | Comptroller PIR (free) | Officers on franchise search; do not pay SOSDirect |
| **MA** | SOS corp search | Officers; Imperva — residential only if blocked |
| **PA** | DOS business search | Officers; do not enable HIC/Turnstile |
| **CT** | data.ct.gov master + principals | Open data join |
| **KY** | web.sos.ky.gov/ftsearch | Mostly open HTML |
| **VA** | SCC CIS | Corps officers; LLC members often absent |
| **UT** | businessregistration.utah.gov | Officers; skip metered bulk |
| **RI** | DOS CorpSearch | Officers; skip $250 SFTP |
| **NH** | quickstart.sos.nh.gov | Officers |
| **NV** | esos.nv.gov | Officers; skip $125 bulk |
| **MS** | corp.sos.ms.gov | Officers; host moved — use current URL |
| **MO** | bsd.sos.mo.gov | Officers; many LLCs will be not_found |
| **MT** | biz.sosmt.gov | Officers |
| **NE** | nebraska.gov/sos/ccorp | Officers |
| **AL** | arc-sos.alabama.gov | Officers; some citizen-only records |
| **WV** | apps.sos.wv.gov | Officers |
| **HI** | hbe.ehawaii.gov | filings_pdf (like CA SI) |

Rollout order inside B: FL, TX, MA, PA, then CT open data, then the HTML cluster.

---

## Tier C — gated, PDF-heavy, or thin roster

Build after B is hitting. Still no paid datasets.

| Code | Constraint | Approach |
|------|------------|----------|
| **MN** | SOS portal challenged; DLI is permit-only (out of this repo) | HTML/Apify SOS governors after Serper |
| **WA** | CCFS captcha; L&I is permit-only | SOS governors via Apify HTML fallback |
| **OK** | Statutory $5 detail | Search-only + Serper/DBA/fallback. Do not scrape around the fee. |
| **OR** | Open-data extract is agent-only | Treat as DBA + About/LinkedIn unless a free officer filing appears |
| **LA** | Search gated; ~18/min if JSON | Paced HTML after Serper |
| **VT** | Bot; login for some bulk | HTML fallback |
| **WY** | LLC members never filed | Corps only; LLCs → agent fallback |
| **DC** | BOSS portal; governors in UI not bulk | HTML after Serper; may land closer to agent-only |
| **CA leftover** | Remaining DBA + agent-only after A | County FBN (LA/OC/SD free portals), more About/LinkedIn |

---

## Confidence (0–1)

| Band | Score | Waterfall-ready |
|------|-------|-----------------|
| high | ≥ 0.8 | Yes (if name validates, not agent) |
| medium | 0.55–0.79 | SOS substring / website About / LinkedIn with city match |
| low | < 0.55 | No. Agents are 0.2 |

Serper hits are waterfall-ready only at **high**. CA trigram is not ready unless the city also matches.

---

## Hard rules

- Official SOS / Corporation Commission only for the SOS tier.
- Blocked/challenge HTML is never a match.
- Registered agent ≠ owner.
- MCP replies: counts, job ids, nameless samples. No officer names in chat.
- `APIFY_MAX_USD` hard cap; refused runs $0.
- Writes stay off until a later persist PR.
