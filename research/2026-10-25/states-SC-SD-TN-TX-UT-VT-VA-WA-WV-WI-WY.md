# Group 5 findings: SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY
Researched 2026-10-24/25. Method: WebSearch (budget exhausted after ~40 searches), then direct HTTP fetches of official pages from this container (curl + WebFetch). "VERIFIED" = I fetched the official page/PDF/dataset metadata and saw the text. "UNVERIFIED" = search snippet / secondary only. "OBSERVED" = behavior seen from this container's IP (160.79.106.29) only; it may be a datacenter-IP effect, not a policy.

Per instructions I did NOT rely on BRIEF.md "known facts" or the repo playbook; where I could not reach a page I say so.

---

## TEXAS (TX)

**TL;DR**
1. Best free source: Comptroller franchise-tax JSON at `https://comptroller.texas.gov/data-search/franchise-tax/{11-digit taxpayerId}` and `?name=` search. No key, no captcha, returns `officerInfo[]` (name, title, address, year, SOURCE=SOS) from the latest PIR. VERIFIED live (fetched a real LLC: member name returned).
2. Bulk: SOS "Master Unload" $1,350 (JSON, monthly snapshot), daily update $60/day, weekly new-filings $20/week. VERIFIED. File spec includes `charterOfficerPersonalRecord` (coPersonalTitle/Last/First/Middle) — but these are formation-time ("charter") officers/organizers, not annual PIR officers (PIR officers go to the Comptroller, not SOS). Officers-in-bulk: YES (charter), partially.
3. No official bulk PIR officer file found. Comptroller has a documented keyed API (`api.comptroller.texas.gov/public-data/v1/public/franchise-tax/{id}`) returning officerInfo; key obtained via Comptroller "data-secure" developer profile (cost/terms UNVERIFIED, page is a JS app). Open-records requests for PIR copies go to open.records@cpa.texas.gov (UNVERIFIED pricing).
4. DBA: county-level, names the owner(s). Harris searchable by "Business Owner" field free. Bexar & Dallas on GovOS `*.tx.publicsearch.us`.
5. Est. owner-name rate: 75-85% for registered entities (PIR officers + TDLR OWNER NAME + TABC Owner), lower for unregistered sole props (county DBA). Buy nothing; optionally SOS Master Unload $1,350 if you want offline name->file-number resolution.

**A. Entity registry**
- SOS search is SOSDirect (`https://direct.sos.state.tx.us/`), $1.00 per search (VERIFIED statement on help page). New SOSPortal exists. Not needed: the Comptroller search is free and richer.
- Comptroller "Franchise Tax Account Status" UI: `https://comptroller.texas.gov/taxes/franchise/account-status/search` (VERIFIED). The page is client-rendered; its data endpoint is **`https://comptroller.texas.gov/data-search/franchise-tax/{taxpayerId}`** (JSON) and **`https://comptroller.texas.gov/data-search/franchise-tax?name=<text>`** (JSON list of `{name, taxpayerId, mailingAddressZip}`). VERIFIED unauthenticated on 2026-10-25: response for taxpayer 32063342011 (BULL'S LAWN CARE LLC) included `registeredAgentName`, `sosFileNumber`, `reportYear: 2026`, and `officerInfo: [{AGNT_NM:"JAMES ATWOOD", AGNT_TITL_TX:"MEMBER", AGNT_ACTV_YR:"2026", ...SOURCE:"SOS"}]`. So the free record shows officers/directors/managers/members as reported on the PIR, plus RA and mailing address. No captcha, no key, from a datacenter IP.
- Officially documented API (same data): `https://api-doc.comptroller.texas.gov/public-data/` (VERIFIED). Endpoints: `GET /public-data/v1/public/franchise-tax/{id}` ("Retrieve franchise account and officer details by taxpayer ID", sample shows `officerInfo`), `GET /public-data/v1/public/franchise-tax-list?taxpayerId|name|fileNumber` (413 "Response too large" possible), plus sales-tax-payer endpoints that return `FIRST_NAME/LAST_NAME` of individual (sole-prop) permit holders by `searchType=legalName|name|fein|taxpayerId` and `sales-tax-payer-location?ZIPCODE=`. Requires `x-api-key` ("register here" -> `https://data-secure.comptroller.texas.gov/main/my-profile?section=developer`, JS app; cost/limits UNVERIFIED; unauthenticated call returned 403 "Forbidden").
- Annual report images: N/A (TX has no SOS annual report; PIR data is what you get). Bot protection: none observed on comptroller.texas.gov. `www.sos.state.tx.us/corp/sosda/` returned 403 to WebFetch (OBSERVED).

**B. Bulk data**
- SOS Business Filings Bulk Order (`https://www.sos.state.tx.us/corp/bulk-order.shtml`, VERIFIED): "Master Unload – a 'snapshot' of the entire database... available the first of the month" **$1,350**; "Daily Filing Update" **$60/day** (past 30 days); "Weekly Filing Update" (new formations only) **$20/week** (past 8 weeks). JSON format; ordered through SOSPortal account; files downloadable for 90 days. Record layout: `https://www.sos.state.tx.us/corp/forms/bf-bulk-border-json-spec-v1.2.pdf` (VERIFIED) — records include masterEntity, raBusinessName / raPersonalAgent*, **Record 7 charterOfficerBusinessRecord** and **Record 8 charterOfficerPersonalRecord** (`coPersonalTitle`, `coPersonalLastName`, `coPersonalFirstName`, `coPersonalMiddleName`, address), and a BF_ENTITY_OFFICER table ("Contains information about officers of business entities"). Caveat: these are officers as filed with SOS (formation/charter documents and amendments), not the annual PIR roster; Comptroller is the PIR system of record. Commercial reuse: no restriction stated on the page.
- Comptroller open data (Socrata, data.texas.gov; VERIFIED via `/api/views/{id}.json`):
  - `9cir-efmm` Active Franchise Taxpayers: Taxpayer Number/Name/Address, Org Type, SOS File Number, Charter Date, Status, Right to Transact, NAICS. **No officers.** Use it to map Maps business name -> taxpayerId, then hit the JSON above.
  - `jrea-zgmq` Active Sales Tax Permit Holders: Taxpayer Name/Address, Outlet Name/Address/NAICS, Permit Issue Date. Taxpayer Name for sole proprietors is the individual's name (owner). No separate first/last field.
- No official bulk PIR/officer file found (searched; none advertised). Officer bulk is only via SOS Master Unload (charter officers) or per-record API.

**C. DBA / assumed names**
- County-level for unincorporated (sole prop/partnership) assumed names; incorporated entities file with SOS only (Travis page: "As of September 1, 2019... Incorporated Assumed Names... registered with the Secretary of State's Office only", VERIFIED).
- Harris: `https://www.cclerk.hctx.net/Applications/WebSearch/AN.aspx` — search fields File Number, Film Code, Date, **Business Owner**; filings 1/3/1978–present, images from 1991 (VERIFIED). Record names owner(s).
- Dallas: `dallascounty.org` returned 403 to this container (OBSERVED). Records search via GovOS `https://dallas.tx.publicsearch.us/` (reachable, 200).
- Tarrant: `https://www.tarrantcountytx.gov/en/county-clerk/vital-records/assumed-names.html` (VERIFIED page; online search exists but link is to the county records search, not a dedicated AN portal).
- Bexar: `https://bexar.tx.publicsearch.us/` (Official Public Records search; VERIFIED link from `bexar.org/2958`), fee $13 + $0.50 per additional owner — so owners are on the certificate.
- Travis: `https://countyclerk.traviscountytx.gov/departments/recording/dbas/` (VERIFIED); search of county AN records online via recording records search.
- No county bulk AN files found (UNVERIFIED either way); GovOS publicsearch portals are scrapeable HTML/JSON.

**D. Licensing boards**
- TDLR "All Licenses" `7358-krk7` on data.texas.gov (VERIFIED columns): LICENSE TYPE, LICENSE NUMBER, BUSINESS NAME, BUSINESS ADDRESS/CITY/STATE ZIP, BUSINESS TELEPHONE, **OWNER NAME**, MAILING ADDRESS, OWNER TELEPHONE, LICENSE SUBTYPE, expiration. Free Socrata/CSV. Covers electricians, HVAC, plumbers (no—plumbers are TSBPE), cosmetology/barber, towing, auctioneers, etc. Also `9d9z-ebct` TDLR COS Salons & Schools.
- Other open datasets (VERIFIED existence in catalog, columns not pulled): `s7ft-44qi` TREC Broker and Sales Agent License Holder Information; `tm3v-pfq9` Texas Medical Board all licenses; `tgb2-j935` RN; `bc5r-88dy` HHSC CCL Daycare operations; `ghh2-6wm5` TDI officers/directors of surplus lines agencies.

**E. Liquor**
- TABC License Information `7hf9-qc9f` (VERIFIED columns): Master File ID, License Type/ID/Status, **Trade Name, Owner** (licensee entity/person name), Address, Phone, County, Mail Address, Application Id. Legacy `kguh-7q9z` TABCLicenses: AIMSOwnerName, AIMSTradeName, LocationAddress. Owner = licensee name (often the LLC), not individual officers. Pair with Comptroller JSON for officers.

**F. Business/tax registrations naming owners**
- Comptroller sales-tax-payer API (keyed) exposes individual FIRST/LAST name for sole-prop permit holders (VERIFIED in docs). Open data `jrea-zgmq` has Taxpayer Name only.
- City business-license open data: Austin/Houston/Dallas have no general business license; nothing found.

**G. Other**
- Harris County Clerk also has liquor-license application records; UCC via SOSDirect (paid). Not pursued.

**H. Recommendation (TX)**
1. Maps name -> `data-search/franchise-tax?name=` -> `/{taxpayerId}` -> officerInfo (free, no key). Load `9cir-efmm` locally for fuzzy name/zip matching first. 
2. TDLR `7358-krk7` OWNER NAME join by business name/phone/address (free bulk).
3. TABC `7hf9-qc9f` Owner + phone join (free bulk).
4. County DBA (Harris AN.aspx, GovOS publicsearch for Dallas/Bexar) for unregistered sole props.
Attainable: 75-85%. Buy: nothing required; SOS Master Unload $1,350 only if you need full-state offline entity list with charter officers. Effort: live JSON (exists) + two Socrata bulk loads.

---

## WASHINGTON (WA)

**TL;DR**
1. Best free: L&I contractor open data with **PrincipalName** (`4xk5-x9j6`) and **PrimaryPrincipalName** (`m8qx-ubtq`), updated daily; LCB liquor lists (xlsx) with Licensee entity name; CCFS governors live (but Cloudflare Turnstile in front).
2. Bulk SOS file: NOT FOUND. No bulk/data-download page on sos.wa.gov (several candidate URLs 404); a vendor (Topograph) states SOS retired its bulk extract 2024-08-30 (UNVERIFIED). CCFS front-end bundle contains no "bulk data" string.
3. Officers in bulk: n/a (no bulk). Governors visible free per-entity in CCFS (UNVERIFIED this round — API returned 400 "System verification in progress" because of Turnstile).
4. DBA: trade names registered with DOR Business Licensing Service; DOR Business Lookup searchable by "owners and officers" (VERIFIED description) but it is a GenTax web app requiring cookies/JS; no bulk file.
5. Est. rate 60-70% (contractors ~90% via L&I; others depend on CCFS access). Buy: nothing; solve Turnstile for CCFS (residential/browser) or use L&I/LCB/DOR.

**A. Registry** – CCFS `https://ccfs.sos.wa.gov/` (SPA). API base `https://ccfs-api.prod.sos.wa.gov/api/` (VERIFIED in `apiURL.js`). The page loads `https://challenges.cloudflare.com/turnstile/v0/api.js` (VERIFIED) and a direct POST to `/api/BusinessSearch/GetBusinessSearchList` returned HTTP 400 "System verification in progress, please wait." (OBSERVED) — i.e., a Turnstile token is now required. Governors (officers/members/managers per RCW 23.95.105) are shown on entity records (UNVERIFIED this round, could not render). Annual report images: filed documents are viewable in CCFS (UNVERIFIED).
**B. Bulk** – None found on sos.wa.gov (`/corporations-charities/...data...` URLs 404; VERIFIED 404s). Public records request to `corps@sos.wa.gov` is the only route (UNVERIFIED cost). data.wa.gov has no SOS entity dataset (catalog search VERIFIED: none).
**C. DBA** – Trade names are part of the DOR business license (state-level). DOR Business Lookup `https://secure.dor.wa.gov/gteunauth/_/` ("search by business name, trade name, owners and officers, UBI, license number, address, endorsements" — VERIFIED dataset description `4wur-kfnr`, which is just a link, no columns). Site requires cookies/JS (OBSERVED). No bulk download. DOR also shows "Governing People" on each record (UNVERIFIED).
**D. Licensing** – data.wa.gov (all VERIFIED columns): `m8qx-ubtq` L&I Contractor License Data – General (BusinessName, License#, Address, Phone, UBI, **PrimaryPrincipalName**, status); `4xk5-x9j6` L&I Contractor License – Principal Data (BusinessName, License#, UBI, **PrincipalName**, Start/End dates; "Principles are owners associated with a registered license"); `s7ge-wicw` Authorized Signer Data (AuthorizedSigner, SignerRole). Also DOL professional-license datasets (`ixni-jq78` etc., individual licensees), `4pvz-wrik` vehicle/vessel dealers, `was8-3ni8` DCYF childcare providers, `fnp9-sdhr` CPAs. Free, daily.
**E. Liquor** – LCB Frequently Requested Lists `https://lcb.wa.gov/records/frequently-requested-lists` (VERIFIED): On Premise / Off Premise / Distributors / Winery xlsx. On-Premise file columns (VERIFIED by reading the xlsx): Privilege, Tradename, License #, UBI, **Licensee** (entity name, e.g. "BORN 1 LLC"), Status, Location Address, City, Zip, County, Day Phone, Night Phone, Mail Address, Bus Start, App Date, Expire. No individual officer names. `9dee-kzm5` LCB Liquor Renewal (Socrata) has **DesignatedSignee** and Applicants fields (VERIFIED columns).
**F.** DOR Business Lookup (above). Seattle business license open data: not checked (no budget).
**G.** L&I also publishes contractor bond/insurance datasets; UBI is the universal join key across SOS/DOR/L&I/LCB.
**H.** Order: (1) L&I principal datasets by UBI/name/phone (free bulk); (2) LCB lists for bars/restaurants (entity + phone) then CCFS governors; (3) CCFS live via browser/Turnstile-capable fetch; (4) DOR lookup. Rate 60-70%. Buy nothing. Effort: 3 Socrata loads + headless-browser CCFS adapter.

---

## VIRGINIA (VA)

**TL;DR**
1. Best free: SCC CIS entity records (officers/directors for stock corps; LLCs show RA/principal office only — UNVERIFIED this round) + DPOR license lookup.
2. Bulk: CIS "DataSales/DownloadBEDataSales" page exists (`https://cis.scc.virginia.gov/DataSales/DownloadBEDataSales`) but returned HTTP 200 with a 0-byte body from both this container and WebFetch, even after accepting the cookie banner. Contents, price, and fields: **UNVERIFIED**. (Prior playbook claimed free; I could not confirm.)
3. Officers in bulk: UNVERIFIED.
4. DBA (fictitious names) are filed with SCC since 2020 (state-level; SCC FAQ lists "Fictitious Names") — owner named on certificate (UNVERIFIED fields).
5. Est. 55-65%. Buy: nothing yet; get the DataSales files from a browser session first.

**A.** CIS `https://cis.scc.virginia.gov/` -> `/EntitySearch/Index`. Site forces a cookie-consent page (`/Cookie/CookieConsent`) and the pages are JS-heavy; not fetchable as plain HTML from this box (OBSERVED). Secondary sources say stock-corporation records show a "Principal Information" officer/director table and LLCs show only RA + principal office (UNVERIFIED).
**B.** `https://cis.scc.virginia.gov/DataSales/DownloadBEDataSales` and `/DataSales/Index`: 200/empty body (OBSERVED twice). Need a browser session to list files. Virginia open data portal (CKAN `data.virginia.gov`) has no SCC dataset; it has City of Norfolk "Business Licenses", Virginia Beach "Business Licenses", Lynchburg business-license locations (VERIFIED in catalog; owner fields not checked).
**C.** Fictitious names: SCC (FAQ page lists it; VERIFIED FAQ exists), search in CIS. Owner name on the certificate (statutory; UNVERIFIED field display).
**D.** DPOR License Lookup `https://www.dpor.virginia.gov/LicenseLookup` -> `https://www.dporlicensehome.dpor.virginia.gov/datamart/vadporLogin.do` (VERIFIED link; WebFetch hit a redirect loop, OBSERVED). DPOR historically offered downloadable license lists for a fee via the datamart; current price UNVERIFIED. Contractor records include the Qualified Individual / Responsible Management (UNVERIFIED this round).
**E.** VA ABC `abc.virginia.gov/licenses/...` returned 403 "Enable JavaScript and cookies" (OBSERVED JS challenge). Norfolk publishes an "ABC Licenses" dataset on data.virginia.gov (VERIFIED listing).
**F.** City business-license open data: Norfolk, Virginia Beach, Lynchburg, Dumfries (VERIFIED listings; fields unchecked).
**G.** None verified.
**H.** (1) CIS live (browser-based) for corps; (2) DataSales files once listed; (3) DPOR datamart; (4) city license datasets. Rate 55-65%. Buy: possibly DPOR list if priced low (UNVERIFIED). Effort: medium (JS site).

---

## WISCONSIN (WI)

**TL;DR**
1. Registry shows RA/entity data only; DFI states plainly it has **no LLC members/owners on record** and corp officers from annual reports are **not in the bulk database** (VERIFIED).
2. Bulk: DFI Form CORP51 — full corporate database via ShareFile **$40 per file** (one-time, weekly, or monthly), new-formations file **$5/month** (VERIFIED, form rev. Aug 2024).
3. Officers in bulk: NO (VERIFIED).
4. DBA: Wisconsin has no state DBA registry for sole props (trade names optional via DFI trademark/trade-name registration); county register of deeds optional — owner-naming coverage is poor (UNVERIFIED detail).
5. Est. 40-50% from registries; rely on web/LinkedIn + DSPS. Buy: nothing (bulk is cheap but officer-less).

**A.** DFI search `https://apps.dfi.wi.gov/apps/corpsearch` (VERIFIED URL from search). Record: name, status, RA, type, dates; annual-report filings viewable; officers appear on corporation annual reports (images) only. Bot protection: not tested.
**B.** `https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/CorpDataServices.aspx` (VERIFIED text): "complete corporate database delivered via ShareFile as a .txt file and a monthly record of entities formed... for $5/month. The information in these files includes: Legal entity name, Registered agent/office address, Entity type, Date of formation/registration, Current status, Numeric indicator for most-recent annual report filing. We do not have entity 'owners' or LLC members on record with our department. Additionally, officers/directors of corporations are provided to us on the annual report, but that information is not included in this database." Form CORP51 (VERIFIED): Option I full database "_____ x $40.00" (one time / weekly each Tuesday / monthly 2nd Tuesday); Option II New Formations "_____ x $5.00" (.txt + .xlsx by email, 2nd Monday). Mail check to Corporations Bureau, PO Box 7846, Madison 53707; DFICorporations@dfi.wisconsin.gov, (608) 261-7577.
**C.** No mandatory state DBA for sole proprietors (UNVERIFIED this round).
**D.** DSPS license lookup `https://license.wi.gov/s/license-lookup` (Salesforce) returned Cloudflare 403 "you have been blocked" to this container (OBSERVED). `licensesearch.wi.gov` timed out (OBSERVED). DSPS data requests go through open-records (page URLs changed; not located). No free bulk credential file verified.
**E.** WI DOR alcohol: permits page `/Pages/AlcoholBeverage/home.aspx` exists; a "Statewide Operators Permit Lookup Tool" user guide is linked (VERIFIED); no downloadable licensee list found. Municipal Class B licenses are issued by cities (no state bulk).
**F.** DOR sales-tax (seller's permit) lookup is per-permit only (UNVERIFIED).
**G.** None.
**H.** Skip registry for names; use RA-promotion heuristic only when RA is an individual at the business address; DSPS via browser; web/LinkedIn. Rate 40-50%. Buy: optional DFI $40 file for name->status/RA. Effort: low.

---

## UTAH (UT)

**TL;DR**
1. Registry shows principals (members/managers/officers) free — but `businessregistration.utah.gov/EntitySearch/OnlineEntitySearch` returned HTTP 403 Cloudflare "Just a moment..." challenge to this container (OBSERVED).
2. Bulk: Utah.gov subscriber service — "Full Data Download (entire business entity database)... $.01 per record"; customized lists $5 min (first 200) + $0.05/record (VERIFIED on `https://www.utah.gov/subscription/onlineservices.html`). Whether principals are included: UNVERIFIED (page silent).
3. DOPL: lookup free (`secure.utah.gov/llv`), customized licensee lists $5 first 200 + $0.03/record (VERIFIED).
4. DBA: state-level, filed with Division of Corporations as "DBA" entity type; owner/applicant shown on record (UNVERIFIED display).
5. Est. 65-75% if bulk includes principals; buy the $0.01/record full download (~$3-4k for ~350k records, UNVERIFIED count) after confirming principal fields with the Division.

**A.** Search URL above; Cloudflare challenge observed. Record (per Division description, VERIFIED on utah.gov page: "view principal individuals associated with the business") shows principals + RA.
**B.** `https://www.utah.gov/subscription/onlineservices.html` (VERIFIED): Customized Lists "$5.00 search fee covers the first 200 records... each additional record is $.05"; "Full Data Download (entire business entity database)... You will be assessed $.01 per record." Requires a Utah.gov subscriber account (monthly billing). Principals in download: UNVERIFIED — ask corporations@utah.gov. opendata.utah.gov: no business-entity or license dataset found (catalog queries returned nothing; VERIFIED empty).
**C.** DBAs are registered with the Division of Corporations (state-level; same search). Owner shown as applicant/principal (UNVERIFIED).
**D.** DOPL: Licensee Lookup & Verification `https://secure.utah.gov/llv/search/index.html` (VERIFIED, free, data "current as of 10/23/2026"); "Request a List of Licensees" (DOPL home, VERIFIED link text) priced on utah.gov page: "$5.00 first 200 records, $0.03 per record after 200" (VERIFIED). Contractor records list the qualifier (UNVERIFIED this round). Real-estate licensee list same pricing (VERIFIED).
**E.** Utah DABS licensee lists: page fetched, no list links found (OBSERVED). UNVERIFIED.
**F.** None.
**G.** None.
**H.** (1) Confirm principal fields and buy full download ($0.01/record); (2) DOPL lookup/list for trades; (3) live search only via browser/residential. Rate 65-75%. Effort: bulk load.

---

## TENNESSEE (TN)

**TL;DR**
1. Registry (TNCaB `https://tncab.tnsos.gov/business-entity-search`) is reachable; legacy TNBear (`tnbear.tn.gov`) timed out from here and returned 503 to WebFetch (OBSERVED; site-side, not a block). Officer display: annual reports list officers/directors/governors; snippets say they show on the record (UNVERIFIED this round).
2. Bulk: SOS offers "Download Business Entity Database" via the website (`https://sos.tn.gov/businesses/services/purchase-database-downloads`, VERIFIED page) — price and fields NOT shown; the actual order link was not present in the HTML (likely in the login-gated TNCaB). Price UNVERIFIED.
3. Officers in bulk: UNVERIFIED.
4. DBA: assumed names filed with SOS for entities; sole-prop DBAs at county (UNVERIFIED).
5. Est. 55-65%. Buy: ask SOS for the database price/fields before buying.

**A.** TNCaB search (VERIFIED reachable, grid: Control No., Name, Other Names Used, Entity Type, Status, City, Formed In, Registration Date). Detail/officer display UNVERIFIED. TNBear: timeout/503 (OBSERVED).
**B.** `https://sos.tn.gov/businesses/services/download-business-entity-database` and `/purchase-database-downloads` (VERIFIED): "offers customers the ability to purchase and download the Business Entity Database, Motor Vehicle Temporary Lien Database, UCC Database..." No price, no layout on page. Contact Division of Business Services. 
**C.** UNVERIFIED.
**D.** TDCI "Verify a License" -> `https://search.cloud.commerce.tn.gov/` (VERIFIED redirect; SPA). Contractor roster download page not found on the new tn.gov site (old URL 404). UNVERIFIED availability.
**E.** TN ABC: public-records page lists no licensee list downloads (VERIFIED page; nothing linked).
**F.** None.
**G.** None.
**H.** (1) TNCaB live record (browser if needed); (2) web/LinkedIn; (3) request bulk price. Rate 55-65%.

---

## SOUTH CAROLINA (SC)

**TL;DR**
1. Registry `https://businessfilings.sc.gov/BusinessFiling/Entity/Search` shows RA/agent info; the search page requires a **captcha** before searching ("Please complete the following to continue searching. After completing the captcha, please search again." — VERIFIED text). Officers: not shown for LLCs; corp annual reports go to DOR (CL-1/1120S) not SOS.
2. Bulk: Corporations Bulk Data **$12,000/year**, Corp+UCC combo $20,000/yr, via SCI subscriber agreement (VERIFIED in SC House Oversight PDF, FY2015-19 era; current price UNVERIFIED; `sci.sc.gov` unreachable from here).
3. Officers in bulk: UNVERIFIED (likely no, since SOS doesn't collect them).
4. DBA: SC has no state DBA registry; county-level optional (UNVERIFIED).
5. Est. 45-55%. Buy: nothing.

**A.** Search page VERIFIED (captcha gate). Record content UNVERIFIED this round.
**B.** VERIFIED (dated doc): "Bulk Data Subscriptions: (a) UCC Bulk Data & Images ($4,500.00/month); (b) Corporations Bulk Data ($12,000.00/year); (c) Corporations/UCC Bulk Combo ($20,000.00/year)... subscriptions through SCI... SC Subscriber Agreement" `https://ucconline.sc.gov/UCCFiling/SC%20Subscriber%20Agreement%20v2.2%2008072017.pdf`.
**C.** UNVERIFIED (no state registry found).
**D.** LLR Licensee Lookup `https://verify.llronline.com/LicLookup/LookupMain.aspx` — HTTP 403 from this container and redirect loop via WebFetch (OBSERVED). LLR "licensee data downloads" page: old `llr.sc.gov/licensee.aspx` / `pol/downloads.aspx` now 404-redirect to the new site; no new download page located (UNVERIFIED). Historically LLR offered free per-board licensee CSV downloads (UNVERIFIED today).
**E.** SC DOR ABL page: no list links (OBSERVED).
**F/G.** None.
**H.** Web/LinkedIn first; LLR lookup via browser; SOS only for RA. Rate 45-55%. Buy: no.

---

## WEST VIRGINIA (WV)

**TL;DR**
1. Registry free record shows **Officers** section (type/name/address) — VERIFIED on `https://apps.sos.wv.gov/business/corporations/organization.aspx?org=450000` (shows "Officers... Partner ..." for a GP). Officer-type rows include officers, members, managers, partners. Detail pages fetch fine by `org=` id; name search is a POST form (no captcha seen).
2. Bulk: full Business Organizations database **$12,000 one-time**, monthly updates **$1,750/month** (VERIFIED, 2026-04 request form); commercial resale needs contract (initial $12,000). Statute §11-12C-3 says $1,000/month (discrepancy; UNVERIFIED which governs).
3. Officers in bulk: file set is "All Companies / New Companies (monthly/weekly/daily)" in 9 files; detailed layout is behind login (`FileInformation.aspx` redirects to login) — UNVERIFIED whether officers are in the files (likely yes, since 9 files).
4. DBA: state-level trade names filed online with SOS (VERIFIED menu "Online Trade Name (DBA) Registration Filing"); search results include fictitious names registered with Tax Dept.
5. Est. 70-80% free via live detail pages. Buy: nothing unless you want offline ($12k).

**A.** Search `https://apps.sos.wv.gov/business/corporations/` (VERIFIED) — search by Organization or Agent/Officer/Name; detail page sections: Organization Information, Addresses, **Officers** (Type, Name/Address). Also `https://apps.wv.gov/SOS/BusinessEntitySearch/` (free view; $10 certificates).
**B.** `https://sos.wv.gov/sites/default/files/2026-04/BED_RequestForm.pdf` (VERIFIED): "$12,000" entire database; "$1,750 per month" updates; resale contract. Registration: `https://apps.wv.gov/sos/bulkdata/RegistrationInformation.aspx` (WV.gov monthly account holder). File descriptions `.../Forms/FileDescriptions.aspx` (VERIFIED): business entity bulk = 9 files; "All Companies" monthly, new-companies monthly/weekly/daily. Field layout login-gated. Also a "Business Entity List Service" (custom lists) exists (page 404'd for me; price UNVERIFIED).
**C.** Trade names: state-level via SOS online filing (VERIFIED existence); searchable in the same search.
**D.** WV Contractor Licensing Board (Division of Labor) search `wvlabor.com` — not checked (UNVERIFIED).
**E.** ABCA licensing page: no list links (OBSERVED).
**F/G.** None.
**H.** (1) Live detail pages (fast, free, officers); (2) trade-name search; (3) web. Rate 70-80%. Effort: live HTML adapter.

---

## WYOMING (WY)

**TL;DR**
1. Registry: `https://wyobiz.wyo.gov/Business/FilingSearch.aspx` served a **captcha challenge page** ("What code is in the image? ... Your support ID is ...") to this container (OBSERVED). Records show RA + officers/directors from annual reports; LLC members/managers are not required on filings.
2. Bulk: "Business Database Download" subscription **$10,200/yr, $5,100/6 months, $850 single month (max 2/yr)**; monthly zip via Google Drive link, last Friday of month; includes "each business entity's filing, party, and public annual report information" (VERIFIED form rev. May 2021). SOS FAQ (VERIFIED): "Bulk business entity information including the name and address of the registered agent, **officers and directors**, status, standing, and mailing address, can be purchased through a subscription."
3. Officers in bulk: YES (officers/directors from annual reports). LLC members: not collected ("Member Managed" flag only) — consistent with FAQ wording; UNVERIFIED statute cite.
4. DBA: state-level trade name registration with SOS (applicant named) — UNVERIFIED fields.
5. Est. 40-55% (heavy commercial RA use, many non-resident shell LLCs). Buy: only if WY volume justifies $850 one-month pull.

**A.** wyobiz captcha (OBSERVED). `FilingDetails.aspx` returned 200 but was not inspected for content.
**B.** `https://sos.wyo.gov/Forms/Business/General/WYSOS-BusinessDatabaseDownload.pdf` (VERIFIED prices/terms above; payment by cashier's check/money order/ACH). FAQ `https://sos.wyo.gov/faqs.aspx?root=BUS` (VERIFIED quote).
**C.** Trade names via SOS (UNVERIFIED this round).
**D.** WY has no state contractor license. Other boards individual.
**E.** Wyoming Liquor Division page: no lists (OBSERVED).
**H.** Web/LinkedIn first; one-month bulk pull ($850) if WY matters; RA promotion only for individual RAs. Rate 40-55%.

---

## VERMONT (VT)

**TL;DR**
1. Registry `https://bizfilings.vermont.gov/business/businesssearch` (Angular SPA; empty HTML to curl) — principals shown per prior knowledge; UNVERIFIED this round.
2. Bulk: SOS has a "Bulk Database Download" option in online services (referenced for the Data Broker registry; a records-request reply said no fee) — corporations bulk availability/price UNVERIFIED (not on sos.vermont.gov pages fetched).
3. Officers in bulk: UNVERIFIED.
4. DBA: state-level "Assumed Business Name" filings with SOS (VERIFIED menu item "Assumed Name (DBA)"); owner named (UNVERIFIED fields).
5. Free license bulk: OPR "Profession Roster Download" (VERIFIED text on `https://sos.vermont.gov/opr/find-a-professional`: "If you are looking for a complete exportable list of all licensees in a profession... use the Profession Roster Download option"); DFS electricians/plumbers on data.vermont.gov (`byw8-gs7z`, `7zjt-7s8b`, `cy8e-89cz`: Last/First Name, address, license#, type/level — VERIFIED columns). DLL liquor licensee lists via `dllportal.my.vermont.gov/.../licensing-lists-and-reports` (VERIFIED link). Est. 60-70%.

**H.** (1) bizfilings live (browser/JSON API), (2) OPR roster + DFS datasets for trades, (3) DLL lists for bars. Buy: nothing.

---

## SOUTH DAKOTA (SD)

**TL;DR**
1. Registry `https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx` — not re-tested this round (UNVERIFIED); prior: RA + officers/managers from annual reports.
2. Bulk (VERIFIED, form dated 2025-08-07, `https://sdsos.gov/docs/ucc-docs/NEWBusinessUCCDatabaseSubscriptionForm.pdf`): Business Filings **Full Database $1,500** (initial setup, includes full copy), **Monthly Update $750**, **Weekly Update $250**, **Monthly New Entity Listing $250**, **Monthly DBA/Fictitious Name Listing $500**; zip files on password site, PAD prepaid account.
3. Officers in bulk: UNVERIFIED (form lists no fields).
4. DBA: state-level fictitious names with SOS (VERIFIED "File a DBA" + monthly DBA listing product); owner named on DBA (UNVERIFIED field).
5. Est. 55-65%. Buy: $1,500 full DB is cheap if officers are in it — confirm with sos.ucc@state.sd.us (605-773-4422).

---

## Cross-state table

| State | Registry shows officers free? | Bulk file (price; officers y/n) | DBA names owner (level) | Best license-board bulk | Est. rate | Buy? |
|---|---|---|---|---|---|---|
| TX | YES – Comptroller JSON officerInfo, no key (VERIFIED) | SOS Master Unload $1,350 + $60/day, $20/wk; charter officers Y (VERIFIED); no PIR bulk | County (Harris/Bexar/Dallas portals), owner Y | TDLR 7358-krk7 OWNER NAME (free); TABC Owner (free) | 75-85% | No |
| WA | Governors in CCFS (Turnstile now; UNVERIFIED) | None found (likely retired) | DOR BLS trade names; lookup by owner (no bulk) | L&I 4xk5-x9j6 PrincipalName (free, daily) | 60-70% | No |
| VA | Corps Y / LLC N (UNVERIFIED) | CIS DataSales page empty from here (UNVERIFIED) | SCC fictitious names (state) | DPOR datamart (price UNVERIFIED) | 55-65% | Maybe DPOR list |
| WI | NO (RA only; VERIFIED) | $40/file DFI; officers N (VERIFIED) | No state DBA | DSPS blocked (Cloudflare) | 40-50% | No |
| UT | Principals Y (Cloudflare block OBSERVED) | $0.01/record full DB (VERIFIED); principals UNVERIFIED | State DBA via Div. of Corps | DOPL list $5+$0.03/rec (VERIFIED) | 65-75% | Yes, if principals included |
| TN | Officers on record (UNVERIFIED) | Exists, price UNVERIFIED | Unknown | TDCI search (no bulk found) | 55-65% | Ask first |
| SC | NO (RA; captcha on search VERIFIED) | $12,000/yr via SCI (VERIFIED 2019 doc) | No state DBA | LLR lookup 403 from here | 45-55% | No |
| WV | YES (VERIFIED detail page) | $12,000 + $1,750/mo (VERIFIED); officers likely (9 files) | State trade names (SOS) | n/a | 70-80% | No |
| WY | Officers/directors on AR; captcha OBSERVED | $10,200/yr, $5,100/6mo, $850/mo; officers/directors Y (VERIFIED) | State trade name | None | 40-55% | Only $850 month if needed |
| VT | Principals (UNVERIFIED) | UNVERIFIED | State assumed names | OPR roster download free; DFS Socrata | 60-70% | No |
| SD | Officers/managers (UNVERIFIED) | $1,500 full, $750/mo, $250/wk; DBA list $500/mo (VERIFIED); officers UNVERIFIED | State DBA (SOS) | n/a | 55-65% | Maybe $1,500 |

## Top surprises
1. TX: the Comptroller's `comptroller.texas.gov/data-search/franchise-tax/{id}` JSON is open (no key, no captcha) and already carries the PIR officer roster; the documented `api.comptroller.texas.gov` version needs a key. TX SOS bulk is only $1,350 and its JSON layout has person-officer records.
2. WY sells a genuine officers/directors bulk file at $850 for a single month; SD's full database is only $1,500 (fields unconfirmed); WI's $40 bulk explicitly excludes officers and WI holds no LLC member data at all.
3. Bot walls seen from this container today: UT entity search (Cloudflare), WY wyobiz (captcha), WA CCFS (Turnstile on API), WI DSPS license.wi.gov (Cloudflare block), SC SOS (captcha), SC LLR (403), VA ABC (JS challenge), Dallas County (403). WV, TX Comptroller, TX county GovOS portals, TN TNCaB are open.
