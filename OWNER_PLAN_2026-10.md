# Owner-name plan, all 50 states + DC (research of Oct 25 2026)

Goal: from a Google Maps row (business name, street address, city, state, phone, usually a domain) return the **owner's first/last name and title** for at least 60-70% of small and medium businesses in **every** state, then hand the name to the Email Finder Waterfall (`name_company` mode) for email and mobile.

This document supersedes `STATE_PLAYBOOK.md` wherever the two disagree. Nothing in the old playbook or the adapter catalog was taken on trust: every state, every national dataset and every vendor was re-researched from live official pages on Oct 25 2026 by seven research passes, plus direct probes from this datacenter box. The per-state evidence, with VERIFIED / UNVERIFIED tags and URLs, is in `research/2026-10-25/`.

Measured baseline (381 rows, Oct 21): **51% named**. Most hits came from LinkedIn and web search, not registries. Only 11 states were at or above 70%.

---

## 1. What the research changed

Things the repo believed that turned out to be wrong or incomplete:

| Old belief | What is actually true (verified) |
|---|---|
| Illinois bulk files carry no corporate officers | The free corp Master file carries **president and secretary name + address** at positions 41-100 and 101-160 (`proc_corp_data.pdf` v004). Re-parse `cdxallmst.zip`. |
| Pennsylvania needs scraping of a bot-walled site | **data.pa.gov `xvd7-5r2c`** is a free monthly open dataset with one row per business x officer: 814k President, 809k Governor, 414k Organizer, 377k Treasurer rows with first/last names. Probed from this box today. |
| Oregon "authorized representative is usually the owner" | The open registry has **no member/manager/officer rows at all**. The only name types are Principal Place of Business, Registered Agent, Mailing Address and Authorized Representative, and every Authorized Representative row is an **assumed-business-name owner**. The rule only holds for DBAs. For contractors, CCB `g77e-6bhs` `rmi_name` is the owner source. |
| 20 "agent-only" states to skip | Several of them publish officers or governing people (AK, ID, IN, SD, ND corps, TN, MI corps, NM corps, AR corps). The structurally agent-only set is smaller: **CO, OH, WI, MD, DE, NJ, SC, KS, NY (LLCs), plus LLCs in MO, MI, VA, WY, NM, OR**. |
| Only a handful of registries block datacenter IPs | **About 20 state registries** return Cloudflare, Incapsula, Akamai, F5 or captcha pages to this box (list in section 4). Bulk files and open-data APIs sidestep all of it. |
| Registered agent is the only name in most states' bulk | Cheap official bulk files with **officers/managers** exist in MN ($710), RI ($250 + $500 trade names), AZ ($1,000), OK ($500), ND ($40/type), NC ($2,750), MT ($0.02/record), WY ($850/month), KY ($2,000/month or free non-commercial), LA (API ~$500/yr), HI ($0.05/record, possibly free weekly), UT ($0.01/record, fields unconfirmed), SD ($1,500, fields unconfirmed). |
| Google Maps data might expose the owner | It does not. Outscraper's `owner_title` is the GBP display name. Only owner-reply signatures and the "from the business" blurb can be text-mined (first name in roughly 15-25% of replied listings). |
| Paid SOS APIs are the paid fallback | They cost $0.40-2.50 per lookup and mirror the same SOS data. The cheapest verified business-keyed owner API is **Enigma at $0.01 per returned person name**; coverage on micro-businesses is untested. |

New free national owner files nobody was using:

- **FMCSA Company Census** (`data.transportation.gov az4n-8mr2`): 2.24M active USDOT registrants, 93.6% with `COMPANY_OFFICER_1`, 76% with `EMAIL_ADDRESS`, plus `CELL_PHONE`. Daily. Covers trucking, towing, moving, dump, junk removal and any trade running heavy trucks.
- **CMS NPPES** Type-2 records: `Authorized Official First/Last Name`, `Title or Position`, `Telephone`. Covers dental, chiro, PT, pharmacy, optometry, med spas with an NPI. Bulk page was "down for maintenance" today; the free API and the NBER mirror work.
- **SBA PPP FOIA**: 35.9% of loans are sole prop / self-employed / independent contractor, where `BorrowerName` is the person, with street address and NAICS. Address-keyed owner source for sole-prop trades. 2020-21 vintage.
- **DC Basic Business License** ArcGIS layer: `BUSINESSOWNERFIRSTNAME/LASTNAME` on 34,455 of 77,481 active licenses (probed today).
- **Chicago Business Owners** (`ezma-pppn`): owner first/last/title for every licensed Chicago business, joined by account number to the license file.
- **Iowa contractor registrations** (dataset 1052): first/last, business name, email, phone for every contractor earning $2k+.
- **Minnesota DLI** nightly export: 260k contractor/electrical/plumbing licenses with phone and email.
- **Missouri alcohol licenses** (`yyhn-562y`): 23k manager/owner names for bars, restaurants and liquor retailers.
- **New York DMV facilities** (`nhjr-rpi2`): `owner_name` for 54k repair shops, dealers and inspection stations. **NYC DOB licenses** (`t8hj-ruu2`): first/last + business for 103k contractors, plumbers, electricians.

---

## 2. Architecture: bulk first, web last

The pipeline order should become:

0. **Normalize + DBA-to-legal-name.** Keys: normalized name (strip LLC/Inc/punctuation), street+zip, phone (E.164), domain. Resolve trade names through the state's trade-name file where one exists, PPP, sales-tax permit lists (TX), city license files, and the website footer.
1. **Local bulk match (no HTTP, $0).** Officer-bearing files loaded into Supabase, keyed on normalized name + zip, with phone and address as tie-breakers. States: PA, IL, FL, CT, TX (Comptroller + TDLR + TABC), CO/OR/NY (trade names and person RAs), DC, plus every purchased file in section 3.
2. **Vertical overlays ($0).** FMCSA by phone/DOT, NPPES by name/phone/taxonomy, state license boards by business name/phone/address (CSLB, DBPR, TDLR, L&I, CCB, IDFPR, MN DLI, IA 1052, NYC DOB, CT eLicense, Chicago), liquor files (TX, CA, MO, NE, CT, FL), PPP by address.
3. **Live open-data and JSON APIs ($0).** TX Comptroller `data-search/franchise-tax` (officers, no key, open from datacenter), CT SODA, data.pa.gov, ND FirstStop JSON, ID SOSbiz JSON, NM enterprise JSON, WV detail pages, KY FastTrack, MN portal, RI, AL, AR, NE, OK, SD, VT, DE, DC BOSS.
4. **Live HTML behind a residential browser (small cost).** For the ~20 blocked registries that do publish officers: CA (SI PDFs), MA, GA, NC, UT, MO, MS, MI corps, NH, NV, WA (Turnstile), WY, IA, KS, HI, AK, VA, OR detail. Cache every entity hit so each business is fetched once.
5. **Web cascade (Serper, ~$0.01-0.02/row).** Existing: About page, LinkedIn `site:` with owner titles, hard-to-find aggregator search, LLC unmask by address. Add: BBB and D&B profile snippets via Serper (legal note in section 7), Alignable `site:` search, GBP owner-reply signature mining if the Maps scrape already returns reviews.
6. **Paid tier (benchmark before adopting).** Enigma person-name fill ($0.01 per hit), Datazapp B2B contact append ($0.02-0.03 per match, free match report first), Apify website-owner extractors ($0.01-0.03 per hit, misses free). Skip Cobalt, Middesk, Baselayer, OpenCorporates and credentialed skip-trace for this use.

Registered-agent promotion rules stay as they are (person RA at the business address or surname in the company name), and add the same rule for Ohio "business associate names", NY `dos_process_name`, Oregon person RAs, Colorado agent names and Oklahoma incorporator/owner rows.

---

## 3. State tiers and buy list

### Tier A: free officer-bearing bulk or open data. Load it. ($0)

| State | Source | What it gives | Status |
|---|---|---|---|
| PA | data.pa.gov `xvd7-5r2c` (4.17M rows, monthly) | Officers and governors with names for every registered business | Verified today; not loaded |
| IL | ilsos.gov DTA daily zips | Corp president + secretary (Master file), LLC managers/members, assumed names | Loaded, but corp officers never parsed |
| FL | Sunbiz quarterly `cordata` + `ficdata` via public SFTP | 6 officer slots per entity, 10 owner slots per fictitious name | Loaded; refresh quarterly; SFTP creds are on the FL DOS page |
| TX | Comptroller `data-search/franchise-tax` JSON + `9cir-efmm` + TDLR `7358-krk7` + TABC `7hf9-qc9f` | PIR officers with titles (live, free, open), TDLR `OWNER NAME`, TABC owner | Live adapter exists; load the three Socrata files for matching |
| CT | data.ct.gov `ka36-64k6` principals + `n7gp-d28j` master + `ngch-56tr` licenses + `gwv2-eswx` liquor permittees | Principals with titles, business email, license holder + business name | Live SODA exists; load locally for fuzzy matching |
| DC | DCGIS FEEDS/DCRA FeatureServer 0 | Owner first/last on ~44% of active licenses | Verified today; not built |
| CO | `u7sb-g482` trade names, `4ykn-tg5h` entities, `7s5z-vewr` DORA, `ier5-5ms2` liquor, `8upq-58vz` UCC debtors | Trade-name registrant first/last; person RAs; licensee + entity name | Entities live; trade names not used |
| OR | `tckn-sxa6` (ABN owners, person RAs), CCB `g77e-6bhs` `rmi_name`, BCD `vhbr-cuaq`, OLCC `srxe-qkm2` | DBA owners, contractor responsible individual | Live SODA exists; fix the LLC assumption; add CCB |
| NY | `n9v6-gdp6`, DMV `nhjr-rpi2` `owner_name`, NYC DOB `t8hj-ruu2`, DCWP `w7w3-xahh` | Process name (person in ~1/3 of new LLCs), auto-trade owners, NYC trades | Live SODA exists; add the three license files |
| IA | dataset 1052 contractor registrations, dataset 554 entities (RA only) | Contractor owner first/last + email + phone | Not built |
| WA | L&I `4xk5-x9j6` `PrincipalName`, `m8qx-ubtq` `PrimaryPrincipalName`, LCB lists, `9dee-kzm5` renewals | Contractor principals (owners) daily; UBI join key | L&I known, not loaded |
| MN | DLI nightly `MNDLILicRegCertExport.zip` (260k rows, phone, email) | Contractor/electrical/plumbing businesses and qualifying persons | Not built (see Tier B for the SOS file) |
| MO | data.mo.gov `yyhn-562y` alcohol licenses | Manager/owner names for hospitality | Not built |
| NE | NLCC active license roster xlsx | `Manager Name` + licensee for bars/restaurants | Not built |
| CA | CSLB Personnel + License Master (free; download rejected from datacenter, fetch from a residential IP or Apify), ABC daily export, LA County FBN ArcGIS `RegisteredOwnerName`, SF `g8m3-pdis` `ownership_name`, Riverside daily FBN xlsx | Contractor personnel with titles; bar/restaurant licensee; LA/SF DBA owners | None loaded |
| OH | publicfiles.ohiosos.gov monthly `WI0100R`/`WI0050R` new-filing files (agent + business associate names) | Organizer/signer for ~12k new LLCs a month; only new filings | Start archiving monthly via unblocker |
| AK | DCCED corporations + business-license CSVs (403 from datacenter; ArcGIS mirror has `Owners`) | Officials and license owners | Fetch from residential IP |
| IL (city) | Chicago `r5kz-chrr` licenses + `ezma-pppn` owners, IDFPR `pzzh-kp68` | Owner names for all Chicago licensees; salon/roofer/broker business names | Not built |
| PA (city) | Philadelphia Carto `business_licenses`, `com_act_licenses`; PA tobacco `ut72-sft8` | Legal first/last on Philly licenses | Not built |
| National | FMCSA `az4n-8mr2`, NPPES, PPP FOIA, SAM Public V2 | See section 1 | Not built |

### Tier B: cheap official bulk with officers. Buy, in this order.

| Priority | State | Product | Price | Officers/owners included? | Expected move |
|---|---|---|---|---|---|
| 1 | MN | SOS MBLS bulk, monthly CSV | **$710** one-time (free if non-commercial use qualifies) | Yes: President(12), Manager(13), CEO(14), Organizer, Incorporator, Applicant (assumed-name holder). Verified layout. | 44% to 75%+ |
| 2 | RI | Corporate DB active one-time + Trade Name DB active | **$250 + $500** | Yes: primary officer/director/manager; trade names with owner names **and business email**. Verified subscription form. | 0% measured to 75-85% |
| 3 | AZ | ACC full database extraction (form M027) | **$1,000** one-time ($75 partial) | Yes: officer and director names/addresses. LLC member/manager inclusion to confirm before paying. Commercial purpose must be declared. | 20% to ~70% |
| 4 | OK | Business Entities Master Download | **$500** (+$150 weekly if needed) | Partial: table 04 officer rows are mostly incorporator/owner/general partner; no LLC members. Trade names included. | 80% measured on 5 rows; bulk makes it repeatable |
| 5 | ND | Data list requests, Excel | **~$160** (four $40 lists: trade-name owners, active LLC, active corp, contractors) | Trade-name owners have first/last; entity lists RA only. | 20% to 55-65% |
| 6 | LA | SOS Commercial API, 18 calls/min | **~$500/yr** (fee from the LAC rule; confirm at subscriptions.sos.la.gov) | Yes: `Officers[]` with titles, trade-name `ApplicantName`. Verified API guide. | 22% to 65-75% |
| 7 | NV | SOS bulk download | **$125** full dump (pricing seen only on the UAT mirror; confirm) | Unknown. Buy the $125 pull to inspect. | 100% on 4 rows; needs a real sample |
| 8 | NC | Business Registration master files, weekly CSV | **$750 setup + $2,000/FY** | Yes: `CorpOfficers` table + Assumed Names `RealPerson`. Verified layouts. | 67% to 75-80%; also removes the Cloudflare problem |
| 9 | MT | Corporate bulk data | **$0.02/record** (~$4-6k full; filter to active entities + ABNs to cut it) | Yes: PRINCIPAL rows (officers, directors, LLC managers/members) and ABN OWNER rows. Verified spec. | 30% to 75%+ |
| 10 | HI | Entity List Builder | **$0.05/record**; page also lists "All records (weekly) $0.00 flat rate per month" | Yes per page text ("addresses, officers, trade names"). Seen only through a rendered fetch; confirm the $0.00 weekly line first. | 40% to 70%+ |
| 11 | UT | Utah.gov full business-entity download | **$0.01/record** (~$3-4k) | Unknown; ask corporations@utah.gov whether principals are in the file before paying. | 20% to 65-75% if yes |
| 12 | WY | Business Database Download | **$850** single month (max 2/yr) | Yes: officers/directors from annual reports; LLC members not collected. | 20% to 40-55% (shell LLC heavy) |
| 13 | KY | Bulk data service | **$2,000** per month commercial (free non-commercial) | Yes: All Officers file with member/manager codes. Verified layout. | Already 90% live; buy one month only if KY volume is high |
| 14 | SD | Full database | **$1,500** | Unknown; email sos.ucc@state.sd.us for the layout first. | 60% to ? |
| 15 | AR | Tyler Arkansas subscriber bulk download | **$150/yr** | Unknown; cheap enough to test. | 44% to ? |
| 16 | GA | GTA corporations database | **$1,000** one-time or $100 + $500/month | Unknown; email datainnovations@gta.ga.gov for the layout. Do not buy blind. | 50% to 70% if officers present |
| 17 | NE | Full entity DB | **$800/month** or $15 per 1,000 batch | Unknown; confirm layout. Search system is being replaced before end of 2026. | 78% already |
| 18 | ME | InforME corporate records | **$600/month** | Unknown; ask InforME. | 50% to ? |
| 19 | TN | SOS business entity database download | Price not published; ask Division of Business Services | Unknown | 80% measured on 5 rows |

Do **not** buy: IN ($8,000, layout unknown), SC ($12,000/yr, no officers collected), WV ($12,000, live pages are free and open), WI ($40 but explicitly no officers), MD (no officers), CO paid feeds (free dataset is identical), TX SOS Master Unload ($1,350, charter officers only; the Comptroller gives PIR officers free), KS (no product).

Phase-1 spend (priorities 1-7): about **$3,300**. Phase-2 (8-12 once layouts are confirmed): roughly **$8-13k** depending on MT/HI/UT record counts.

### Tier C: officers published, registry open from a datacenter. Live adapters.

WV (detail pages show an Officers section, verified), KY (FastTrack; the old `web.sos.ky.gov` URL is dead, use `sosbes.sos.ky.gov`), AL (arc-sos; annual reports abolished Oct 2024 so data will decay), AR (corps via franchise-tax officers; LLC members confidential), NE (CGI search; replacement system coming), ID (SOSbiz POST API), NM (enterprise JSON; corps only), ND (FirstStop JSON; RA only, buy the $40 owner file), MN (portal reachable; needs exact POST body), RI, VT (Angular SPA), LA and ME (reCAPTCHA on the form; API or purchase instead), OK (summary only; details $5), SD, DE (RA only), DC BOSS.

### Tier D: officers published but the registry blocks datacenter traffic. Residential browser, cached.

CA (Incapsula; SI PDFs via existing Apify hybrid), MA (Incapsula, both hosts), GA (Cloudflare), NC (Cloudflare; or buy Tier B), UT (Cloudflare; or buy), MO (Cloudflare; corps via annual-report images, LLCs organizer only), MS (Cloudflare), MI (Cloudflare on the new MiBusiness Registry; corps only), NH (Akamai on every state host), NV (Incapsula on orion.nv.gov), WA CCFS (Cloudflare Turnstile on the API), WY (captcha), IA (Cloudflare), KS (CloudFront 403), HI (403), AK (403), VA (CIS is JS-only and the DataSales page serves an empty body to datacenter IPs even in a real browser), OR detail pages (F5), PA (HTTP 999; use open data instead), OH (403; agent-only anyway).

The repo's earlier Apify residential attempt still hit challenge pages on GA, MA, UT, NC and PA. What is needed is a real headless browser with a residential egress that holds cookies per site, not a proxied curl. One session per state, hundreds of lookups per session, results cached by entity id. Alternatively run these lookups from an office or home machine on a schedule.

### Tier E: structurally agent-only. No officer data exists in the state. Rely on overlays and web.

CO, OH, WI, MD, DE, NJ, SC, KS; NY for LLCs; LLCs in MO, MI, VA, WY, NM, OR. Expected ceilings are 45-65% even with everything else, so these states lean hardest on: trade-name files (CO, MD, MO, OH search, ND, NY county), license rosters (NJ DCA bulk download, MD MHIC, WI DSPS behind Cloudflare, SC LLR), liquor and city license files, FMCSA/NPPES/PPP, and the web cascade. For OH, archive the monthly new-filing files and promote person agents and business-associate names.

---

## 4. Datacenter reachability (probed from this box, Oct 25 2026)

Open and returning real data: TX Comptroller JSON, data.ct.gov, data.pa.gov, data.oregon.gov, data.colorado.gov, data.ny.gov, data.texas.gov, data.wa.gov, data.mo.gov, DCGIS, WV, KY, MN, MD, SC, NJ, AL, AR, ID, LA, ME, NE, NM, ND, OK, RI, SD, VT, WY form page, DE, DC.

Challenge or 403: FL search.sunbiz.org, GA, NC, UT, MO, IA, MS, MT, HI, AK, OH (all hosts), WI DFI and DSPS, NH (all hosts), PA file.dos.pa.gov, CA bizfile, MA, NV, WA CCFS API, WY search, SC captcha, FMCSA web (use data.transportation.gov instead), BBB, D&B, OpenCorporates, Bizapedia.

Connection failures: ilsos.gov (timeout), AZ ecorp (reset), MI cofs (TLS), TN tnbear (reset; TNCaB works), KS (empty 202), IN (503 maintenance until Oct 26), VA DataSales (empty 200).

Full list: `research/2026-10-25/datacenter-reachability.md`.

---

## 5. Build roadmap

**Phase 0 (this week, $0, biggest lift).**
1. Load PA `xvd7-5r2c` (Socrata CSV, ~4.2M rows). Officer pick order: Owner > Managing Member > Member > Manager > President > CEO > Governor > Treasurer > Secretary > Organizer > Incorporator.
2. Re-parse IL `cdxallmst` for president/secretary (drop names whose first three characters are `I` = incorporator). Keep `llcallmgr`.
3. Load FMCSA census (phone join first, then DBA/legal name + city). Load NPPES Type-2 via NBER mirror or API (phone + name + taxonomy). Both are vertical overlays applied to every Maps list regardless of state.
4. Load TX `9cir-efmm`, TDLR `7358-krk7`, TABC `7hf9-qc9f` for local matching; keep the Comptroller JSON for officers.
5. DC BBL ArcGIS adapter; Chicago owners join; CT, CO, OR, NY local loads; OR CCB and BCD; NY DMV and NYC DOB; IA 1052; WA L&I; MN DLI; MO and NE liquor; CA ABC; CT eLicense/liquor.
6. Fix the Oregon rule (authorized rep = DBA owner only) and the KY URL. Rewrite the skip list per Tier E.
7. Re-run the 381-row benchmark and a new 20-rows-per-state benchmark (about 1,000 rows). Record hits by source.

**Phase 1 (next two weeks, ~$3,300).** Buy MN, RI, AZ, OK, ND, LA API, NV test pull. Fetch CSLB Personnel, AK CSVs and VA DataSales from a residential connection. Load each; write one loader per layout (MN three record types, RI TXT, AZ CSV, OK tilde-delimited tables 01-05, ND Excel, LA JSON per lookup).

**Phase 2 (weeks 3-6, ~$8-13k, after layout confirmations by email).** NC subscription, MT filtered extract, HI list builder (test the $0.00 weekly line first), UT full download if principals are included, WY one month, SD and GA only if their layouts show officers. Stand up the residential headless-browser lane for Tier D states with per-entity caching, and measure its real cost per lookup.

**Phase 3 (ongoing).** PPP address match (10 GB, normalize addresses), county DBA portals for TX (Harris AN.aspx, GovOS for Dallas/Bexar), CA (Orange, San Diego), NY and GA counties; BBB/D&B snippet mining under the legal note below; GBP owner-reply signature mining if the scraper already pulls reviews; Enigma and Datazapp benchmarks on the remaining misses.

Realistic end state by tier (Maps-scraped SMBs, named and waterfall-ready):

| Tier | States | Expected |
|---|---|---|
| A + national overlays | PA, IL, FL, TX, CT, DC, (CA with CSLB), IA, WA, MN, NY/CO/OR for DBAs | 70-85% |
| B after purchase | MN, RI, AZ, OK, LA, NC, MT, HI, UT, KY, NV | 70-85% |
| C live open registries | WV, KY, AL, AR, NE, ID, NM, VT, RI | 65-80% |
| D behind residential browser | CA, MA, GA, NC, UT, MO, MS, MI, NH, NV, WA, IA, HI, AK, VA | 60-75% |
| E agent-only | CO, OH, WI, MD, DE, NJ, SC, KS, NY LLCs, WY | 45-65% |

The 60% floor in every state is achievable; the Tier E states are the ones that need the national overlays, trade names and web cascade to clear it, and NJ, DE, SC and KS are the states most likely to land in the 50s.

---

## 6. Matching rules that matter more than any single source

- **Name key**: uppercase, `&` to AND, strip LLC/INC/CORP/CO/LTD/THE and punctuation, split off descriptors after ` - `, `|`, `(`. Keep a second key with the first two significant tokens for prefix matching (FL prefix lookup already does this).
- **Join order**: exact name + zip; then phone (strongest key for FMCSA, L&I, TDLR, NPPES, liquor files); then name + city; then street number + street name + zip (PPP, trade names, city licenses).
- **Title priority** when a roster has several people: Owner, Managing Member, Sole Member, Member, Manager, President, CEO, Principal, Governor, Partner, Director, Treasurer, Secretary, then Organizer/Incorporator only when the surname is in the company name or no one else exists.
- **Person vs. entity**: reject names matching the commercial-agent regex and formation services; reject generic words; require two name tokens.
- **Freshness**: officer files from annual reports lag 0-12 months; PPP is 2020-21; Ohio new-filing files only cover filings since you began archiving. Carry a `source_date` and prefer newer sources when two disagree.
- **Confidence**: bulk officer match with city match = high; license qualifier = high; trade-name owner = high; person RA at business address = high; PPP sole-prop at same address = medium (needs a second signal or surname in trade name); web = existing rules.

---

## 7. Legal and terms notes

- Florida, Illinois, Pennsylvania, Connecticut, Colorado, Oregon, New York, Texas, DC, Iowa, Washington, Missouri, Minnesota DLI, FMCSA, NPPES, PPP, SAM: public records or open data with no commercial restriction stated.
- Minnesota SOS bulk requires signing the Business Bulk License Agreement (bars reselling access; read before buying). Kentucky's free tier is non-commercial only. Arizona requires a declared commercial purpose and may deny. Kansas statute restricts commercial reuse of bulk. West Virginia resale needs a contract. Illinois forbids automated queries of the website (files are fine).
- **BBB** terms forbid aggregation and "sales and marketing purposes". **D&B** and **Yelp** forbid automated access. **Data Axle Reference Solutions** via libraries is non-commercial only. Using Google snippets instead of fetching pages reduces but does not remove exposure; decide deliberately before building those tiers.
- FMCSA emails and cell phones are public but outreach still has to satisfy CAN-SPAM and TCPA. Skip-trace vendors (BatchData, Skip Sherpa) push TCPA consent onto the buyer. Tracers, IDI, TLO, Accurint, Experian BizID are permissible-purpose products and are not usable for cold outreach.

---

## 8. Paid vendors, if free sources stall

Benchmark on the same 381 rows before adopting anything:

| Vendor | Input | Returns | Price | Verdict |
|---|---|---|---|---|
| Enigma | name + address (+ web, phone) | Person name/role from SOS registrations and contacts | $0.01 per returned name; $20/mo Pro to test | Test first; cheapest business-keyed owner API |
| Datazapp | list match (ask for name + address + phone key) | B2B contact name + title; owner-cell lists | $0.02-0.03 per match, $125 minimum, free match report | Request the free match report |
| Apify website-owner extractors | name + city or domain | Owner name from site text | $0.01-0.03 per hit, misses free | Same source as our own crawl; test on misses only |
| Melissa Business Coder | company + address/phone/web | Contacts with name/title/email/phone | ~$0.05-0.08 | Fallback; Data Axle compiled file |
| Cobalt / Middesk / Baselayer / OpenCorporates | name + state | SOS officers | $0.40-2.50 per lookup | Skip; same data as the files above |
| Credentialed skip-trace | person or property | Deep owner data | $1-10 per hit | Not permitted for marketing |

Full detail: `research/2026-10-25/paid-vendors.md`.

---

## 9. Items to confirm by email before spending

1. AZ ACC: are LLC members/managers in the $1,000 extraction, and is lead generation an acceptable commercial purpose?
2. HI DCCA: what does "All records (weekly) $0.00 flat rate per month" deliver?
3. UT Division of Corporations: are principals in the $0.01/record full download?
4. NV SOS: field list of the $125 corporations dump (pricing page is Incapsula-blocked; call 775-684-5708).
5. GA GTA (datainnovations@gta.ga.gov): record layout; officers included?
6. SD SOS (sos.ucc@state.sd.us): field list of the $1,500 database.
7. NE: layout of the $800 database; timing of the 2026 system replacement.
8. ME InforME: whether officers are in the $600 monthly file.
9. TN Division of Business Services: price and fields of the entity database download.
10. LA SOS: current Commercial API fee and whether `Officers[]` is populated for LLCs.
11. MN SOS: whether this use qualifies as non-commercial (saves $710) and what the license agreement allows.
12. AR Tyler: fields in the $150 bulk download.

---

## 10. Handoff

Every hit written for the waterfall carries: first_name, last_name, title, company_name (legal and trade), domain, source, source_url or dataset id, source_date, confidence_score, state, and the match key used. Email Finder Waterfall `name_company` mode consumes it unchanged. Where a source already supplies an email or phone (FMCSA, NPPES authorized-official phone, MN DLI, IA 1052, CT business email, RI trade names, NYC DOB), pass it through as a candidate so the waterfall can verify instead of buy.

---

## 11. Two modes of use

**Mode 1, enrichment after a Maps scrape.** Input is a Maps row (name, address, phone, domain). Output is the owner. This is everything in sections 2 to 6: local bulk match first, overlays, live registries, web, paid.

**Mode 2, independent owner list, then Jev grades for ICP.** No Maps scrape. The loaded files are the lead source: enumerate every business in a zip set or NAICS/purpose range that already carries an owner name, resolve the domain, and send the list to the ICP website gate. Only owner-bearing files qualify as a source here. Agent-only files (CO, IA, NY, ND entity lists, WI, MD) cannot seed this mode.

What qualifies as a Mode 2 source today:

| Source | Enumerable by | Owner attached | Filterable by vertical |
|---|---|---|---|
| PA `xvd7-5r2c` | county, zip, entity type | yes | no NAICS; use name keywords |
| IL DTA corp + LLC files | zip, county | yes (pres/sec, managers) | yes: corp intent codes (construction, personal services, restaurant, auto repair), LLC IRS 1065 purpose code |
| FL Sunbiz cor + fic | city, zip | yes (6 officers, 10 DBA owners) | no; name keywords |
| CT principals + master | city, zip | yes | yes: master has NAICS and business email |
| TX `9cir-efmm` + Comptroller JSON | zip, NAICS | yes, one JSON call per entity | yes: NAICS on the Socrata file |
| DC BBL | ward, address, business activity | yes (44% of active) | yes: license category |
| Chicago licenses + owners | zip, license description | yes | yes |
| MN DLI, IA 1052, WA L&I, OR CCB, CSLB personnel, TDLR, NYC DOB, MN/RI/AZ/OK/ND purchases | zip, license type | yes | yes: license type is the vertical |
| FMCSA census | zip, cargo flags, power units | yes, plus email and cell | yes: trucking, towing, moving, dump |
| NPPES Type-2 | zip, taxonomy | yes, plus phone | yes: dental, chiro, PT, pharmacy, optometry |
| PPP (sole props) | zip, NAICS | yes (borrower is the person) | yes: NAICS |
| Liquor files (TX, CA, MO, NE, CT, FL) | city | MO/NE/CT yes; TX/CA/FL licensee entity | yes: hospitality |
| Trade-name files (CO, OR, MN, MT, ND, RI, OK) | city, zip | yes (registrant) | no; name keywords |

Mode 2 output per row: company legal name, trade name, address, owner first/last/title, source + date, domain (resolve via Domain Finder Waterfall or DiscoLike bulk match), then Jev. The confidence rules in section 6 still apply; a Mode 2 list should carry only high-confidence owners, because nothing downstream re-checks the name.

Implication for the loaders: every bulk load needs the full roster and address columns indexed for range queries (zip, city, type, NAICS/purpose), not just a name key. Store the files in Supabase tables with a shared shape (`bo_entities`, `bo_people`, `bo_trade_names`, `bo_licenses`) so one query serves both modes.

---

## 12. Apify budget and the four priority verticals

**Apify Scale plan ($199/month, $199 in platform credit, residential proxy about $8/GB).** A headless-browser registry lookup costs roughly $0.01-0.02 compute plus about $0.01 residential bandwidth per page, so the plan covers on the order of 5,000-10,000 walled-registry lookups a month with per-entity caching. That is the whole Tier D lane (CA SI PDFs, MA, GA, NC, UT, MO, MS, MI, NH, NV, WA, IA, VA, OR, TN, IN, LA, OK, SD, WY, ME). The same credit also pays for the one-time residential downloads this plan needs (CSLB personnel file, Alaska CSVs, Virginia DataSales, Ohio monthly files). It does not cover Serper, and it does not replace the bulk purchases in Tier B. The earlier failure (Apify residential still seeing challenge pages on GA, MA, UT, NC, PA) was a proxied fetch, not a browser session; the lane has to be a Playwright actor that keeps cookies per site and solves Turnstile/Incapsula once per session.

**Priority verticals.** Permits already reveal the company; this layer reveals the owner. Status of the owner source per vertical:

| Vertical | Owner source | Status |
|---|---|---|
| Trades (GC, electrical, plumbing, HVAC, roofing) | License qualifier / principal in free bulk: CSLB personnel (CA), DBPR extracts (FL), TDLR `7358-krk7` (TX), L&I `4xk5-x9j6` (WA), CCB `g77e-6bhs` + BCD `vhbr-cuaq` (OR), MN DLI export, IA 1052, IDFPR (IL roofing), CT eLicense, ID DOPL export, NJ DCA bulk roster, NYC DOB `t8hj-ruu2`, VT OPR roster + DFS Socrata. Lookup-only: AZ ROC, NV NSCB, MI Accela, LA LSLBC, MS MSBOC, NC, GA, VA DPOR, UT DOPL ($0.03/record list). | Verified this round. Permits MCP `match_state_owners` already covers CA/WA/NY/MA/MN/PA/TX/FL; extend it with the rest. |
| Home health, hospice, personal care | NPPES Type-2 authorized official (taxonomies 251E00000X home health, 3747P1801X personal care, 251G00000X hospice). **CMS ownership datasets on data.cms.gov ("Home Health Agency All Owners", "Hospice All Owners", from PECOS enrollment) list individual and organizational owners with ownership percentage and role.** State licensure rosters (TX HHSC, FL AHCA, CA CDPH) carry administrator names. | NPPES verified. CMS all-owners datasets NOT yet verified this round; check first, they would be the single best file for this vertical. |
| Insurance agents and agencies | State insurance department producer/agency license files; several publish free bulk (TX TDI agent and agency lists on data.texas.gov, FL DFS, CA CDI, WA OIC, NY DFS). Agency license records name the designated responsible producer, who is the owner at small agencies. NIPR/NAIC SBS is the national lookup (bulk is paid). Carrier agent-locator pages (State Farm, Allstate, Farmers) name the agent on every office listing. | NOT researched this round. Expect high yield because the agency usually carries the owner's name and every producer is individually licensed. |
| CPAs and accounting firms | State boards of accountancy firm + individual rosters: FL DBPR CPA extract (verified free CSV), WA `fnp9-sdhr` (verified), IL IDFPR (public accounting firms, verified dataset), TX TSBPA, CA CBA, NY OP, plus CT eLicense. NASBA CPAverify is lookup-only. Firm license names the licensee-in-charge; small firms carry the surname. | Partly verified (FL, WA, IL, CT). Other boards not researched this round. |

Add to Phase 0: verify the CMS all-owners datasets and the TX/FL/CA insurance producer files, since both are likely free bulk with owner names attached.

---

## 13. Build status (Oct 25 2026)

Shipped in this repo on branch `ccr-c310b674-4icgep`:

- `openDataSources.ts`: 13 free sources wired before Serper (PA officers, CO trade names, OR CCB, NY DMV, NYC DOB, WA L&I, MO liquor, Chicago owners, IL IDFPR, TX TABC, DC BBL, FMCSA, NPPES). Phone is now an input field and the primary join key for FMCSA, L&I, CCB, TABC and NPPES. Confidence and waterfall-ready rules are shared with the SOS adapters; non-owner NPPES titles are flagged for review.
- `unblocker.ts`: residential fetch API lane (Zyte, Bright Data, ScrapingBee, ScraperAPI) for the 22 bot-walled registries, tried before Apify, every request reserved against `TOTAL_MAX_USD` and the per-company ceiling, reported as `unblocker_usd` on the job.
- Quote gate: `estimate_only=true` returns `quote` (rows by state, Serper / Apify / unblocker ceilings, per-row max) and `requires_approval`; the MCP description tells the assistant to show it and wait.
- Illinois: corp Master president/secretary fields parsed (incorporators flagged), `cdxallmst.zip` added to the download set.
- Oregon: authorized representative accepted only on assumed business names; person-RA promotion otherwise.
- Catalog: KY, MN, DC URLs; PA as open data; AK, IN, MI, DC marked officer-bearing; skip list reduced to the 10 structurally agent-only states; 41 jurisdictions in scope.

Not yet built: bulk loaders for purchased files (MN, RI, AZ, OK, ND, NC, MT), Supabase tables for Mode 2 enumeration, Iowa 1052 (the Iowa data hub is no longer Socrata), CT license/liquor files, PPP address match, BBB/D&B snippet mining.
