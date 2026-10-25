# Group 4 findings: NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI
Researched Oct 25 2026 from this (datacenter) box. VERIFIED = I fetched the official page/API/file and saw it. UNVERIFIED = search snippet, vendor doc, or could not reach. Per the coordinator's correction, nothing from BRIEF.md "known facts" or the repo playbook is assumed; each claim below is re-sourced. The WebSearch budget ran out part-way (200/turn shared cap), so a few items (NY county DBA portals, NJ county trade-name clerks, OH cosmetology/real-estate rosters, NM/ND liquor) are marked UNVERIFIED rather than researched.

Datacenter reachability observed today (curl, plain UA): ohiosos.gov + businesssearch.ohiosos.gov + publicfiles.ohiosos.gov = 403 "security service" block page (VERIFIED); sosnc.gov search pages = 403 (VERIFIED) but sosnc.gov PDFs under /webfiles and /manual = 200; file.dos.pa.gov = HTTP 999 (VERIFIED, bot block); apps.dos.ny.gov = connection dropped (VERIFIED); egov.sos.state.or.us Business Registry = F5 "cyber-security service" block page (VERIFIED via WebFetch); business.sos.ri.gov, sos.ok.gov, firststop.sos.nd.gov, enterprise.sos.nm.gov, njportal.com, newjersey.mylicense.com all 200 (VERIFIED). hic.attorneygeneral.gov returned 503 / bad TLS chain from both WebFetch and Apify (VERIFIED today; may be transient). apps2.com.ohio.gov liquor lookup 503 (VERIFIED today).

---

## PENNSYLVANIA (PA)

**TL;DR**
1. Best free source: data.pa.gov `xvd7-5r2c` "Registered Businesses in PA Current by County" — one row per business x officer, with `party_type`, `first_name`, `middle_name`, `last_name`, business street address. 4.17M rows, monthly. VERIFIED. This is effectively a free officer/governor bulk file for the whole state.
2. Bulk file: FREE (Socrata, CSV/API). DOS also sells a "Business List" at $0.25/name (fees page, VERIFIED) — unnecessary given the open dataset.
3. Officers in bulk: YES. party_type distribution: President 814k, Governor 809k, Organizer 414k, Treasurer 377k, Secretary 226k, VP 201k, Member/Managing Member/Manager/Owner ~90k combined; 960k rows with blank party_type. Domestic LLCs: 1.69M rows, 1.14M with a last_name. VERIFIED.
4. DBA names owner: PA fictitious names are filed with DOS (state level) — they appear in the live search but are NOT in xvd7-5r2c as a separate type (typeofbusinessregistration has no fictitious-name value). UNVERIFIED whether a fictitious-name owner export exists.
5. Estimated rate: 70-80% for PA entities (open data officer join + Philly L&I), assuming decent name matching.

**A. Registry.** https://file.dos.pa.gov/search/business (Business Filing Services). From this box: HTTP 999 (VERIFIED blocked). Free record shows officers on some filings (annual-report / decennial / DBA filings list officers; LLC certificates list organizer). UNVERIFIED today because of the block; rely on the open dataset instead.

**B. Bulk.** data.pa.gov:
- `xvd7-5r2c` Registered Businesses in PA Current by County (Dept. of State). Fields: business_name, filing_number, address_line1/2, city, state, zip, typeofbusinessregistration, creationdate, party_type ("Governor/Principal Officer"), last_name, middle_name, first_name, shortcountyname, county_code, georeferenced lat/long. Monthly. ~4.17M rows. VERIFIED (api/views + SODA group-bys). Sample of Jan 2024 LLCs: 14/15 rows had a named person (Governor/Member/Manager/President). VERIFIED.
- `3urc-uaba` Filtered view, distinct businesses (2.38M rows, no names). VERIFIED.
- Caveat in dataset description: defunct businesses are not always removed, so counts run high. Address is the registered/principal address on file.
- Paid: pa.gov fees page lists "Business List $.25 per name", record search $15, plain copies $15+$3/pg. VERIFIED. Older FAQ mention of monthly new-association lists at 25c/name: UNVERIFIED (search snippet only). No separate "bulk data" price found on the fee page.
- Reuse restriction: none stated on the Socrata page (standard open-data terms). UNVERIFIED beyond that.

**C. DBA.** Fictitious names are a state DOS filing (Fictitious Names Act); searchable in file.dos.pa.gov (blocked from here). Fictitious-name filings list the owners (individuals or entities) on the filing image. Not in the open dataset. UNVERIFIED whether DOS will sell a fictitious-name list under the $0.25/name list fee (likely yes, "lists evidencing specialized data" per FAQ snippet, UNVERIFIED).

**D. Licensing boards.**
- Home Improvement Contractors (Attorney General, HICPA): registration portal hic.attorneygeneral.gov; public verification at https://hicsearch.attorneygeneral.gov/ (URL VERIFIED from attorneygeneral.gov page; the search site itself returned 503/bad TLS to me today). No downloadable registrant list is mentioned (VERIFIED on the AG page). Registration records contain owner names but bulk only via Right-to-Know request (UNVERIFIED).
- PALS (Dept of State professional boards: cosmetology, barber, real estate, funeral, vehicle dealers, engineers, etc.): verification at pals.pa.gov. Board FAQ letters (Podiatry, Osteopathic) state lists of licensees can be bought via PALS "Other Services – List Sales" for a fee (UNVERIFIED price/format; search snippet from official PDFs). data.pa.gov has no professional-license datasets (catalog search returned 0, VERIFIED).
- Tobacco licenses `ut72-sft8` (Dept of Revenue): 17.3k rows, legal_name + trade_name + address, daily. VERIFIED. legal_name is sometimes an individual (sole props).
- Philadelphia (Carto / OpenDataPhilly): `com_act_licenses` (Commercial Activity Licenses) fields include legalfirstname, legallastname, companyname, legalentitytype, ownercontact1name/2name (owner contacts were null in sample). `business_licenses` fields include legalname, business_name, legalfirstname, legallastname, opa_owner, ownercontact1name. Both free via https://phl.carto.com/api/v2/sql. VERIFIED.

**E. Liquor.** PLCB+ public license search: https://plcbplus.pa.gov/pub/Default.aspx?PossePresentation=LicenseSearch (URL VERIFIED on pa.gov). Officer/owner display in results: UNVERIFIED. No open dataset of licensees (data.pa.gov liquor search returns only FWGS store sales `fhz7-8ncd`, VERIFIED). Bulk officer data only via Right-to-Know (PLCB page lists RTK process, VERIFIED).

**F. General business license.** Philadelphia CAL/business licenses above. No statewide business license.

**G. Other.** Nothing additional verified.

**H. Recommendation.** (1) Load `xvd7-5r2c` monthly (~4.2M rows) into Postgres; index on normalized business_name + zip; pick officer by party_type priority (Owner > Managing Member > Member > Manager > President > CEO > Governor > Organizer > Incorporator). (2) Philly Carto tables for Philadelphia-area names. (3) Tobacco `ut72-sft8` for convenience stores. (4) Live PALS/HIC lookups only via residential proxy if needed. Buy: nothing. Build: bulk load (easy, Socrata). Expected 70-80% named for PA-registered entities; sole props without a PA filing fall back to web.

---

## OHIO (OH)

**TL;DR**
1. Best free source: SOS free monthly "New Business Entity Reports" at publicfiles.ohiosos.gov/free/OnlineBusinessReports/WI0100R.TXT (domestic LLCs), WI0050R.TXT (domestic for-profit corps) etc. — CSV with AGENT ADDRESS NAME, FILING ADDRESS NAME and BUSINESS ASSOCIATE NAMES (incorporators/organizers/signers). VERIFIED by downloading WI0100R.TXT via Apify (11,971 rows for the Sept 2026 month). Only NEW filings each month, not the full base.
2. Bulk file: FREE monthly new-filings + amendments files (VERIFIED). No full-database bulk product found on ohiosos.gov (UNVERIFIED that none exists; the business-reports page lists only the monthly reports).
3. Officers in bulk: partial — statutory agent name + "BUSINESS ASSOCIATE NAMES" (the organizer/incorporator/authorized rep who signed; in the sample this is usually the owner for small LLCs, e.g. "NORTHSTAR AUTO REPAIR LLC … BRADLEY FLYNN", but often a formation service or law firm). No annual-report officers (Ohio has no annual report for LLCs/corps).
4. DBA names owner: Trade names / fictitious names are registered with the SOS and show the registrant; but "The Secretary of State does not offer a list of trade names or fictitious names" (VERIFIED quote on the business-reports page). Search only, blocked from datacenter.
5. Estimated rate: 45-60%. Ohio is agent/incorporator-only; the free files help mainly for businesses formed since whenever you start accumulating monthly files (plus whatever historical months remain on publicfiles — only the current month link is published; UNVERIFIED whether older months are retrievable).

**A. Registry.** https://businesssearch.ohiosos.gov/ — 403 block page from this box (VERIFIED: "Our security service has detected suspicious activity… access blocked", reference ID). Apify unblocker reaches ohiosos.gov (VERIFIED for the reports page). Record content (statutory agent, incorporator/organizer, filing images free as PDF): UNVERIFIED today (not fetched).

**B. Bulk.** https://www.ohiosos.gov/businesses/business-reports/download-business-report/ (VERIFIED via Apify). Free, regenerated second Saturday monthly. Files (all .TXT CSV with quoted fields):
- New Business Entity Reports: WI0010R (foreign for-profit licenses), WI0030R (foreign nonprofit), WI0040R (foreign professional), WI0050R (domestic for-profit corps), WI0070R (domestic nonprofit), WI0080R (domestic professional corps), WI0090R (foreign LLC), WI0100R (domestic LLC), WI0110R (foreign LP), WI0120R (domestic LP).
- New Amendment Reports: WI0210R mergers, WI0220R dissolutions/surrenders, WI0230R SOS cancellations, WI0240R reinstatements, WI0250R amendments/corrections.
- Service mark/trademark: WI0160R, WI0170R, WI0270R, WI0280R.
- Actual header of WI0100R (VERIFIED): DOCUMENT NUMBER, CHARTER NUMBER, EFFECTIVE DATE, BUSINESS NAME, CONSENT FLAG, TRANSACTION CODE DESCRIPTION, FILING ADDRESS NAME, FILING ADDRESS 1/2, FILING CITY/STATE/ZIP, AGENT ADDRESS NAME, AGENT ADDRESS 1/2, AGENT CITY/STATE/ZIP, ACCESS ADDRESS 1/2/CITY/STATE/ZIP, BUSINESS ASSOCIATE NAMES.
- The page's own "Details include" list adds Incorporator Name(s), Filer Name, share info. Page states phone/email never present and no trade-name list offered (VERIFIED).
- publicfiles.ohiosos.gov returns the same 403 block to datacenter IPs (VERIFIED); Apify fetch works.
- Also listed: Canceled/Dissolved lists at hb48.ohiosos.gov; debarred contractors PDF. New "business data transparency dashboard" (press release 2025-11-24) is statistics only (UNVERIFIED contents).
- Paid full-DB extract: not found on official pages. UNVERIFIED.

**C. DBA.** State-level trade name / fictitious name registration at SOS (Form 534A). Shows registrant (owner) name on record/search; no list sold (VERIFIED statement). Search blocked from datacenter.

**D. Licensing boards.**
- eLicense Ohio (elicense.ohio.gov/OH_VerifyLicense): 24 boards incl. Cosmetology & Barber, Motor Vehicle Repair, Funeral, Dental, Chiropractic, Vet, Pharmacy, Medical. Page lists no bulk download (VERIFIED). Older portals elicense3/elicense4 (com.ohio.gov): OCILB (Construction Industry Licensing Board: electrical, HVAC, plumbing, hydronics, refrigeration) has a "Download Roster" page https://elicense4.com.ohio.gov/Lookup/DownloadRoster.aspx offering Excel/Text, but "There are currently no rosters available for download" today (VERIFIED). Rosters may be generated on request via "Generate Roster(s)" (needs login, UNVERIFIED).
- Division of Real Estate licensee database "published daily, downloadable" per Ohio REALTORS FAQ — UNVERIFIED (official page not found before search budget ran out).

**E. Liquor.** Division of Liquor Control permit lookup https://apps2.com.ohio.gov/liqr/PermitLookup/PermitHolder (results exportable to Excel/CSV per search snippet; page returned 503 to me today, so fields UNVERIFIED). OPAL (opal.ohio.gov) "View Reports" says public reports include "ownership information" of permit holders (VERIFIED quote) — no bulk export mentioned. Worth a manual look: this may be the only Ohio source that names owners for bars/restaurants/carry-outs.

**F/G.** No statewide business license. Nothing else verified.

**H. Recommendation.** (1) Start archiving the monthly WI0100R/WI0050R files now (fetch through Apify or a residential proxy; ~12k LLCs/month) and use AGENT ADDRESS NAME when it is a person at the business address, else BUSINESS ASSOCIATE NAMES when a person. (2) OPAL/liquor permit ownership for hospitality SMBs (manual verification needed). (3) Web/LinkedIn fallback remains primary for older entities. Buy: nothing official to buy; a vendor (Cobalt/Middesk) adds little since Ohio has no officer data. Build: light bulk load + Apify fetch. Expect 45-60%.

---

## NEW YORK (NY)

**TL;DR**
1. Best free sources: data.ny.gov `n9v6-gdp6` Active Corporations (4.30M rows, monthly, VERIFIED) — name fields are dos_process_name, chairman_name ("CEO Name"), registered_agent_name, location_name. For domestic LLCs (2.07M rows), chairman_name is populated in 1 row and location fields are empty (count 0 with location_address_1 not null), so the only usable field is dos_process_name, which in a 15-row sample of 2025 LLCs was an individual 5/15, the company itself 5/15, law firm 4/15, RA company 1/15. VERIFIED.
2. Bulk file: FREE (Socrata). No officer/member data anywhere in NY DOS open data. NY has no annual report naming officers (biennial statement names CEO + address only for corps; LLCs file nothing with names).
3. Officers in bulk: NO (CEO name present only for a subset of corporations; essentially absent for LLCs).
4. DBA names owner: Assumed-name certificates for sole props/partnerships are COUNTY clerk filings (NYC County Clerk per borough, etc.) — owner named on the certificate; corporate/LLC assumed names are filed with DOS. No statewide open file. County portals UNVERIFIED (search budget exhausted).
5. Estimated rate: 50-65%. Best lifts are NYC DCWP, DOB, DMV facility (owner_name!) and SLA data, plus process-name promotion.

**A. Registry.** https://apps.dos.ny.gov/publicInquiry/ — connection dropped from this box (VERIFIED, "empty reply"). Free record shows DOS process address, CEO name (corps), registered agent; no members/managers for LLCs; no filing images free. UNVERIFIED today beyond what the open dataset mirrors.

**B. Bulk.** `n9v6-gdp6` columns (VERIFIED): dos_id, current_entity_name, initial_dos_filing_date, county, jurisdiction, entity_type, dos_process_name/address, chairman_name (+address), registered_agent_name (+address), location_name (+address). Entity type counts: domestic LLC 2,068,735; domestic business corp 1,454,178; not-for-profit 288,110; foreign LLC 174,368. Monthly. Also `m7i3-tv6j` DOS Business Filings: counts only, no names (VERIFIED).

**C. DBA.** Sole-prop/partnership assumed names: county clerk (NYC: County Clerk of each borough; Nassau, Suffolk, Westchester, Erie county clerks). Owner is named on the certificate. Online portals/bulk: UNVERIFIED. Corporate assumed names: DOS (shows in entity record as assumed name; no owner beyond the entity).

**D. Licensing boards (data.ny.gov, all VERIFIED schemas, all free, daily/periodic):**
- `nhjr-rpi2` Facilities Licensed by DMV: 54,524 rows; facility_name(+overflow), address, **owner_name (+overflow)**, business_type (RS repair shop, DLU used dealer, ISP inspection station, etc.). owner_name is frequently an individual. This is the best NY owner-name file for auto repair/dealers/inspection stations.
- NYC `t8hj-ruu2` DOB License Info: 103k rows; license_type (General Contractor, Electrical Contractor, Master Plumber, Fire Suppression, Sign Hanger, Rigger…), first_name, last_name, business_name, business address, business_email, business_phone. first/last present 94.6%, business_name 78%.
- NYC `w7w3-xahh` DCWP Issued Licenses: 72k rows; business_name (person's name for individual licensees, 17,179 individual rows), dba_trade_name, business_category, address, contact_phone. No separate owner field. `ptev-4hud` applications has an Applicant field.
- `ucu3-8265` Appearance Enhancement & Barber individual licenses: 222k rows, name only, no shop/address (cannot match by address).
- `r9fr-48vu` Home Inspectors: name + hi_business_name + address (2.2k).
- `3nr4-s9yt` Real estate appraisers; `ikqx-ispy` mold contractors (businesses).
- `i4jv-zkey` DOL Contractor Registry Certificate: 15k rows, business_name, dba_name, business_officers (only if publicly traded), phone, address.
- NYSED Office of the Professions (eservices.nysed.gov/professions/verification-search): per-license lookup; bulk list purchase: UNVERIFIED (search budget ran out; no official data-requests page found at the URLs tried — both 404).

**E. Liquor.** SLA open data `9s3h-dpkz` Active Licenses (60,110 rows, daily): licensepermitid, premises county, type/class/description, **legalname, dba**, premises address, dates. NO principal names (VERIFIED schema). `f8i8-k2gm` Pending (2,963 rows) and `6dg3-2z7i` Inactive: same shape, no principals. The old SLA Public Query (which showed principals) is shut; sla.ny.gov says use LAMP (lamp.sla.ny.gov, an ArcGIS app) or Open Data, FOIL otherwise (VERIFIED). Principal names in LAMP: UNVERIFIED (app did not render in fetch). Principal-level data would require FOIL.

**F. General business license.** NYC DCWP (above). No state business license.

**G. Other.** `h8u2-6ejg` registered pesticide businesses (DEC). Workers' comp employer lookup: not found in catalog (UNVERIFIED).

**H. Recommendation.** (1) Load n9v6-gdp6 (free) and promote dos_process_name when it is a person (surname-in-company-name or same-city rule; ~1/3 of recent LLCs). (2) Load `nhjr-rpi2` (DMV owner_name) for auto trades; `t8hj-ruu2` and `w7w3-xahh` for NYC trades/retail. (3) SLA `9s3h-dpkz` only for legal-name resolution (DBA to LLC). (4) Web/LinkedIn fallback. Buy: nothing; no vendor has NY LLC members either. Build: Socrata bulk loads. Expect 50-65% statewide, higher in NYC.

---

## NORTH CAROLINA (NC)

**TL;DR**
1. Best free source: SOS Business Registration search (officers/managers shown free, including annual-report company officials) — but sosnc.gov search = 403 to this datacenter IP (VERIFIED today). Statewide Assumed Business Name search (sosnc.gov/online_services/assumed_name/search) names the owner ("Real Person (Owner)" is a search option; data dictionary has a RealPerson table) — VERIFIED.
2. Bulk file: PAID. Data Subscriptions fee page (VERIFIED): one-time set-up $750 + Business Registration Division Master Files $2,000 per state fiscal year (so ~$2,750 first year, confirming the brief). Weekly updates, CSV over FTP, with data dictionary. Contact DataSubscriptions@sosnc.gov.
3. Officers in bulk: YES. The Business Registration layout PDF (VERIFIED) has `CorpOfficers` ("Latest officer data"): PitemId, Title, EntityTypeId, Ename, First/Middle/Last, address. Also an Assumed Names export with `RealPerson` (owner first/middle/last or Organization) tied to SosID/FilingId (VERIFIED layout; whether it is included in the $2,000 business subscription or separate is UNVERIFIED — the About page lists six dictionaries incl. Assumed Names under the same program).
4. DBA names owner: YES, statewide DB for filings since Dec 1 2017 (older ones only at county Register of Deeds). VERIFIED.
5. Estimated rate: 70-80% with the bulk subscription; 60-70% without (via proxy/live).

**A. Registry.** https://www.sosnc.gov/online_services/search/by_title/_Business_Registration — 403 from box (VERIFIED). Content of free record (officers, RA, annual report PDFs): not re-verified today because of the block (historically shown free; UNVERIFIED now). Apify/residential required.

**B. Bulk.** https://sosnc.gov/fees/by_title/_data_subscriptions (VERIFIED): set-up $750; Business Registration Master Files $2,000/FY; UCC data $4,000; UCC images $5,200; Federal tax lien $1,600; Notary $2,400; Trademarks $2,400; Charities $2,400. About the Data (VERIFIED): "officers/partners/directors or company officials… status… list of filings… stock… Name Reservations. All data is updated weekly. FTP server contains a data dictionary. Format CSV." Layout PDF https://www.sosnc.gov/webfiles/documents/forms/Data_Subscriptions/Business_Registration_layout.pdf (VERIFIED): tables Names, Addresses, Corporations (AgentEntityID, Managed, Members, Directors flags), Filings, Stock, NameReservations, legacy Officers/Directors (not updated since mid-1990s), **CorpOfficers (latest officer data with Title + name parts + address)**. Assumed-name layout https://www.sosnc.gov/webfiles/documents/forms/Data_Subscriptions/assumed_names_layout.pdf (VERIFIED, Jan 2024): Filing (AssumedName, FilingCountyName, NatureOfBusiness), FilingAddress, EngagedCounty, **RealPerson (Organization or First/Middle/Last, SosID)**. Reuse restrictions: none stated on the pages fetched. No free open-data copy on data.nc.gov (catalog search returned 0, VERIFIED).

**C. DBA.** Statewide ABN database since 12/1/2017, filed at county ROD and transmitted to SOS (VERIFIED). Search by assumed name, SOSID, or Real Person (Owner), all counties by default (VERIFIED form). Bulk: via the Assumed Names data dictionary / subscription (price UNVERIFIED).

**D. Licensing boards.** NC Licensing Board for General Contractors: statute G.S. 87-2 requires an annual roster each March (names + places of business); current electronic roster availability UNVERIFIED (search budget). Other boards (cosmetology, electrical, plumbing/HVAC, real estate): not researched (budget). No data.nc.gov license datasets (VERIFIED catalog search = 0).

**E. Liquor.** NC ABC Commission permit data: UNVERIFIED (not researched).

**F/G.** No statewide business license. Nothing else verified.

**H. Recommendation.** Buy the SOS Business Registration subscription ($2,750 first year, $2,000/yr after) — it is the cheapest officer-bearing full-state file in this group and includes weekly refresh; confirm assumed-names inclusion by email. Until then, live lookups need a residential proxy (datacenter blocked). Build: relational CSV load (Names/Addresses/Corporations/CorpOfficers join on PItemID/EntityID). Expect 70-80%.

---

## NEW JERSEY (NJ)

**TL;DR**
1. Best free source: none strong. DORES Business Name Search (njportal.com/DOR/BusinessNameSearch, reachable, VERIFIED) returns name/status/ID only; Business Records Service sells Status Reports (searchable by Principal Name, Registered Agent — VERIFIED form) and "lists or abstracts of businesses on file" (VERIFIED product list; prices not shown on fetched pages).
2. Bulk file: DORES "Business Entity Lists" exist (VERIFIED as a product); price/fields UNVERIFIED (vendor claims $0.0185/record, no officers — UNVERIFIED). No data.nj.gov business-registry dataset (VERIFIED catalog: only NJSAVI certifications and PPP).
3. Officers in bulk: NO (UNVERIFIED but consistent with all sources; officers only in paid per-entity status reports).
4. DBA names owner: Trade names for sole props/partnerships are COUNTY clerk filings (owner named); state "alternate names" for entities at DORES (Trade Name lists sold by DORES, VERIFIED as product). County portals UNVERIFIED (budget).
5. Estimated rate: 45-60%. Best lift: NJ Division of Consumer Affairs bulk roster download of business licensees (HIC, electrical contractors, cosmetology shops, barber shops, funeral homes) — free.

**A. Registry.** https://www.njportal.com/DOR/BusinessNameSearch (200, VERIFIED). Free: entity name, ID, type, status (per help page nothing more; VERIFIED the help page lists no officer display). Status report (paid, ~$5 + convenience fee per vendor snippets, UNVERIFIED) contains officers/directors/members and RA. Annual report images: not free (UNVERIFIED).

**B. Bulk.** https://www.njportal.com/dor/businessrecords/ products (VERIFIED): Standing Certificates, Status Reports, Entity Documents, **Business Entity Lists ("download lists or abstracts of businesses on file")**, Name Search, Trade Name & Trade/Service Mark Status Report, **Trade Name and Trade/Service Mark Lists**. Prices not on the fetched page; list field layout UNVERIFIED. Statutory basis N.J.A.C. 17:34 (UNVERIFIED text).

**C. DBA.** County clerk trade-name certificates (Bergen, Middlesex, Essex, Hudson, Monmouth…), owner named; online search/bulk UNVERIFIED. DORES Trade Name lists (state-registered alternate names for entities) purchasable (VERIFIED as product; price UNVERIFIED).

**D. Licensing boards.** NJ Division of Consumer Affairs verification https://newjersey.mylicense.com/verification/ (200, VERIFIED). Business Search covers: accountancy firms, A&E certificates of authorization, barber shops, cemeteries, cosmetology & hairstyling shops, **electrical contractor businesses, funeral homes, home improvement contractors**, manicuring shops, pharmacies, skin care shops (VERIFIED list). **Bulk roster download** at https://newjersey.mylicense.com/Verification_Bulk/ with Business Download Search (facility=Y: filter by Profession, License Type, Business Name, License No., City) and Person Download Search (facility=N) (VERIFIED pages). Division's "request list" page (njconsumeraffairs.gov/requestlist) is behind Incapsula from this box (VERIFIED block); search snippet says standard lists are free (license no., licensee name, address, county, dates; no phone/email) and custom lists $55 on CD (UNVERIFIED). HIC roster gives business name + address but the owner/qualifier name field in the download is UNVERIFIED (download not executed).

**E. Liquor.** NJ ABC: monthly "Licensee List", "Co-Ops" and "Registered Agent" reports announced on library_notices page (VERIFIED page; link target licensing-files.html returned 404 today). RetailLicenseHolderOrderForm.pdf (print-out/disk purchase) 404 today. POSSE licensing system has public search (UNVERIFIED). Owner/officer names in list: UNVERIFIED.

**F.** No statewide business license (NJ business registration certificate is tax, not public). Nothing on data.nj.gov.

**G.** Nothing further verified.

**H. Recommendation.** (1) Pull DCA bulk rosters for HIC, electrical contractors, cosmetology/barber shops, funeral homes (free; verify whether owner/qualifier columns exist). (2) Price the DORES Business Entity List and Trade Name List by email (Business Records Service) — only useful for DBA to legal-name resolution. (3) Web/LinkedIn remains primary. Buy: per-entity status reports are not worth it ($5+ each); Cobalt/Middesk also only get agent data for NJ. Expect 45-60%.

---

## OREGON (OR)

**TL;DR**
1. Best free source: data.oregon.gov `tckn-sxa6` Active Businesses – ALL (1.59M rows, weekly, VERIFIED). associated_name_type values are exactly: PRINCIPAL PLACE OF BUSINESS 563,887; REGISTERED AGENT 453,295; MAILING ADDRESS 451,658; AUTHORIZED REPRESENTATIVE 117,851 (VERIFIED group-by). **No MEMBER/MANAGER/PRESIDENT rows exist in the open dataset** (VERIFIED). AUTHORIZED REPRESENTATIVE rows are 100% entity_type = ASSUMED BUSINESS NAME (VERIFIED), i.e., the person behind a DBA — not LLC members.
2. Bulk file: FREE (Socrata). Full registry with members/managers: SOS says "data lists" exist and bulk copy requests are processed by mail/fax (VERIFIED page), prices and fields UNVERIFIED.
3. Officers in bulk: NO for LLC/corp principals; YES for ABN owners (first_name/last_name on AUTHORIZED REPRESENTATIVE rows; 11/12 sampled were people) and person registered agents.
4. DBA names owner: YES (state-level ABN registry; owner = AUTHORIZED REPRESENTATIVE row). 234,654 ABN rows total.
5. Estimated rate: 60-70%. CCB `g77e-6bhs` adds rmi_name (Responsible Managing Individual) for all 56.6k licensed contractors (VERIFIED).

**A. Registry.** Business Registry (egov.sos.state.or.us/br/…) — F5 security block page to WebFetch today (VERIFIED). Free detail shows registered agent, and (per SOS text snippet) "members, managers or officers" — UNVERIFIED today. Annual-report images free via name search ("many images are available online") per public-records page (VERIFIED statement).

**B. Bulk.** `tckn-sxa6` fields (VERIFIED): registry_number, business_name, entity_type, registry_date, associated_name_type, first_name, middle_name, last_name, suffix, not_of_record_entity, entity_of_record_reg_number, entity_of_record_name, address, address_continued, city, state, zip, jurisdiction, business_details. Entity type counts: domestic LLC 900,839; ABN 234,654; domestic business corp 137,994; foreign LLC 101,974; nonprofits 101,463. Monthly "New Business List" datasets per month (esjy-u4fc etc.) and county view 6g49-bcrm. Paid data lists from Corporation Division: UNVERIFIED pricing.

**C. DBA.** ABN registered with SOS; owner name in open data (above). VERIFIED.

**D. Licensing boards (data.oregon.gov, VERIFIED schemas, free, daily):**
- `g77e-6bhs` CCB Active Licenses: 56,628 rows; license_number, full_name (must match SOS filing), address, city, zip, phone_number, **rmi_name**, bond/insurance, exempt_text, endorsement_text. Match by name/phone to Maps records; rmi_name is usually the owner for small contractors.
- `vhbr-cuaq` Building Codes Division active contractor/individual licenses (electrical, plumbing, boiler, elevator, prefab): 45,452 rows; full_name (person or business), dba, address, county, lic_status. No separate qualifier field.
- Landscape Contractors Board, cosmetology, real estate: no datasets found in the catalog (VERIFIED partial listing); UNVERIFIED otherwise.

**E. Liquor.** `srxe-qkm2` OLCC Liquor Business Licenses & Endorsements: 22,459 rows; trade_name, **licensee_name** (entity or person), license_type, physical_address, city, county, endorsements, lottery_on_premises. No officer names (VERIFIED). Also `qad4-bnxp` applications received, `mhc6-qsxj` non-renewals.

**F/G.** No statewide business license. Nothing else verified.

**H. Recommendation.** (1) `tckn-sxa6` for ABN owners + person RAs (already strong). (2) `g77e-6bhs` rmi_name for contractors; `vhbr-cuaq` for electrical/plumbing. (3) `srxe-qkm2` for DBA to licensee resolution (hospitality). (4) Live registry detail (members/managers) only via residential proxy — ask SOS Corporation Division for a priced data list that includes members/managers before building a scraper. Buy: nothing yet. Expect 60-70%.

---

## RHODE ISLAND (RI)

**TL;DR**
1. Best free source: SOS Business Portal search https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx (200 from box, VERIFIED) — search by entity, by **Individual name (officers, directors, etc.)**, agent, address, NAICS (VERIFIED form). Detail display and annual-report PDFs (business.sos.ri.gov/CORP_DRIVE1/… PDFs exist publicly) UNVERIFIED today.
2. Bulk file: PAID, VERIFIED from the 12/2025 Subscription Form PDF: Corporate Database (Active) $3,000/yr daily; Active+Inactive $3,600/yr; **Trade Name Database (Active) $1,200/yr daily**; one-time downloads: Corporate DB active $250, inactive $50, per-type lists $50, **Trade Name DB (active) $500**. .TXT over SFTP; static IP required.
3. Officers in bulk: YES — Corporate DB contents (VERIFIED quote): "Name of Entity • Date of Incorporation • Brief description of business • Name and Address of Registered Agent • **Name and Address of Primary Officer, Director or Manager** • Business Address • Amendments • Mergers • Fictitious business names associated with the entities • Stock information". (One primary officer, not the full slate.)
4. DBA names owner: YES — Trade Name DB contents (VERIFIED): "Trade Name • Trade Name ID • Date of Registration • **Name(s) of Owners** • Business Address • **Business Email Address** • NAICS".
5. Estimated rate: 75-85% with the $250 + $500 one-time files (or $3,000 + $1,200 subscriptions).

**A.** Above. Bot protection: none observed.
**B.** https://sos.ri.gov/divisions/business-services/business-data-hub/data-subscription (VERIFIED fee tables) and Subscriber Agreement https://docs.sos.ri.gov/documents/BusinessServices/Subscriber_Agreement.pdf (VERIFIED contents/prices). Order one-time by email/phone 401-222-3040, 2 business days; email corp_tech@sos.ri.gov. No reuse restriction beyond indemnity clause (VERIFIED).
**C.** Trade names are state-level (SOS) in RI; bulk $500 one-time / $1,200 yr with owner names + email (VERIFIED).
**D.** RI Contractors' Registration & Licensing Board / DBR license lists: UNVERIFIED (search budget).
**E.** RI DBR liquor: UNVERIFIED.
**F/G.** None verified.
**H.** Buy the $250 Corporate DB (active) + $500 Trade Name DB one-time files now; subscribe later if refresh matters. Build: fixed/delimited TXT load (layout arrives after purchase; UNVERIFIED layout). Expect 75-85%.

---

## OKLAHOMA (OK)

**TL;DR**
1. Best free source: SOS entity search https://www.sos.ok.gov/corp/corpInquiryFind.aspx (200, VERIFIED) — free summary only; "View Entity Details" $5 for 1-3 entities (VERIFIED fee) showing name/status/RA/shares/trade names — officers not listed among details (VERIFIED product text).
2. Bulk file: PAID, cheap, VERIFIED: Business Entities Master Download $500 (complete DB, monthly, tilde-delimited, 19 tables, ~600 MB), Weekly Filing Update $150, Custom list $1 per 40 records (https://www.sos.ok.gov/corp/bulkorder/bulkDefault.aspx).
3. Officers in bulk: PARTIAL. Layout (VERIFIED, BulkOrderFileLayoutLegalEntity.htm + sample CORP_WKLY_070422.txt): table 03 Agent (name parts, SOS_RA_FLAG), **table 04 Officer Information (OFFICER_TITLE, name parts, address)**. In the 2007 sample week, 04 titles were INCORPORATOR 487, GENERAL PARTNER 64, OWNER 36, PRESIDENT 15, other officers <10 — i.e., mostly incorporators/partners/trade-name owners; LLC members/managers are not collected by OK (no annual report content). Table 05 Names (Legal/Fictitious/Tradename), 01 has FICTITIOUS_NAME, TELNO.
4. DBA names owner: Trade names and partnership fictitious names are SOS filings (corp types 3-6 in layout; $25 fee) and the owner appears as OWNER in table 04 / as the entity in 01. VERIFIED structure.
5. Estimated rate: 55-65% (incorporator/owner/agent promotion + liquor lists + web).

**A.** Free search: summary (name, status, type, jurisdiction, formation date, RA). Officers: not shown. Fees: $5 per 1-3 entity details (VERIFIED on order page and fees.aspx). No bot block observed.
**B.** Fees page (VERIFIED): Business Entities New Master Download $500; Previous Master $500; Weekly Filing Update $150; Trade Name $25. Sample files verified downloadable. Reuse restrictions: none stated on fetched pages.
**C.** State-level trade name / fictitious partnership name filings; included in the bulk DB.
**D.** Construction Industries Board (plumbing/electrical/mechanical/roofing): license verification only; no roster download found (UNVERIFIED). data.ok.gov license datasets: none (VERIFIED catalog search = 0).
**E.** ABLE Commission "Listing of Licensees by License Type": 27 monthly spreadsheets (Mixed Beverage, Retail Beer, Beer & Wine, Retail Spirits Store, Caterer…) at https://oklahoma.gov/content/dam/ok/en/able-commission/documents/brand-registration/brand-registration-reports/listing-of-licensees-by-license-type/2026/october/<File>.xls (VERIFIED). Mixed Beverage file columns (VERIFIED by download): License #, COUNTY, DBA NAME, FULL ADDRESS, CITY, STATE, ZIP, DATE EXPIRATION — **no owner names** (files are HTML-in-.xls). Accela licensee search (aca-prod.accela.com/ABLE) has "Search by Contact" (VERIFIED form) which implies contacts/owners on records; UNVERIFIED display.
**F/G.** None.
**H.** Buy the $500 master download (plus $150 weeklies if freshness matters): yields agent + incorporator/owner names for all entities and all trade names in one relational file; promote INCORPORATOR/OWNER/GENERAL PARTNER when a person. Build: delimited load of tables 01-05. Expect 55-65%.

---

## NORTH DAKOTA (ND)

**TL;DR**
1. Best free source: FirstStop https://firststop.sos.nd.gov/search/business (SPA; JSON POST https://firststop.sos.nd.gov/api/Records/businesssearch works from the box — VERIFIED, returns title/type/status/control ID). Detail endpoint /api/FilingDetail/business/{id}/false returned an error to plain curl (VERIFIED error; likely needs session headers), so officer display UNVERIFIED today.
2. Bulk file: PAID, cheap, VERIFIED (sos.nd.gov/services/data-list-requests): Active Business Records $40 per selected type (one-time) or $40/type/month subscription for new records; Contractor Records $40; Trademark $40; All business + trademark records (active+inactive) $1,440/month subscription. Excel format, ordered via FirstStop "Data List Requests" (ND Login).
3. Officers in bulk: NO. Sample files (VERIFIED by download): sample-business.xlsx / sample-business-all.xlsx columns = SOS_CONTROL_ID, FILING_TYPE, BUSINESS_TYPE, DURATION_TYPE, STATUS, STANDING_AR, STANDING_RA, FILING_NAME, FILING_DATE, …, PRINCIPLE_ADDR/CITY/STATE/ZIP, MAIL_*, **RA_NAME** + RA addresses, PURPOSE. No officers/governors.
4. DBA names owner: YES. sample-business-owners.xlsx (trade names & fictitious partnership names): SOS_CONTROL_ID, FILING_TYPE, FILING_NAME, NAME, **FIRST_NAME, MIDDLE_NAME, LAST_NAME**, MAIL_* (VERIFIED). Price presumably the $40/type (UNVERIFIED which type selection).
5. Estimated rate: 55-65% (RA promotion + trade-name owners + contractor file + web).

**A.** FirstStop; free record shows RA, addresses, standing; officers/governors per annual report: UNVERIFIED today. No bot block.
**B.** Above. sample-contractor.xlsx columns (VERIFIED): SOS_CONTROL_ID, CONTRACTOR_NAME, STATUS, MAIL_*, **PHONE**, FILING_DATE, STANDING_*, CLASS, LICENSE_NUM — no owner, but phone enables matching to Maps rows. Reuse restrictions: none stated.
**C.** State-level trade names (SOS) with owner names in the owners file. VERIFIED.
**D.** Contractors are licensed by the SOS (file above). Other boards: UNVERIFIED.
**E.** ND liquor (Attorney General licensing): UNVERIFIED.
**F/G.** None.
**H.** Buy: $40 trade-name/fictitious owners list + $40 active LLC + $40 active corp + $40 contractor (~$160 one-time). Promote RA when a person at business address. Build: trivial Excel load. Expect 55-65%.

---

## NEW MEXICO (NM)

**TL;DR**
1. Best free source: SOS enterprise portal https://enterprise.sos.nm.gov/search (200; SPA; /api/BusinessSearch/* endpoints exist — GET returned 200, POST 405, so exact contract UNVERIFIED). Corporations: officers/directors from biennial report shown free; LLCs: organizer + RA only (NM LLCs file no reports) — UNVERIFIED today (vendor docs only).
2. Bulk file: none found on sos.nm.gov (page fetched; no bulk/data-list text, VERIFIED absence on that page). IPRA (public records) request is the route; price UNVERIFIED.
3. Officers in bulk: n/a.
4. DBA names owner: NM has no state DBA registry; trade names are county-level or not required (UNVERIFIED).
5. Estimated rate: 50-60% (corp officers + web).

**A.** Above. No bot block observed.
**B.** None official found. UNVERIFIED whether IPRA yields a DB extract.
**C.** UNVERIFIED (search budget).
**D.** RLD Construction Industries Division: license verification via PSI https://public.psiexams.com/search.jsp (VERIFIED link on rld.nm.gov); no roster download (VERIFIED absence on page); IPRA page exists. Qualifying party names show per license (UNVERIFIED).
**E.** NM Alcoholic Beverage Control (RLD): UNVERIFIED.
**F/G.** NM CRS/taxation registrations: not public. None verified.
**H.** Live SOS JSON for corporations (officers) + RA/organizer promotion for LLCs; PSI contractor lookup for qualifying party; web fallback. Buy: nothing available. Expect 50-60%.

---

## Summary table

| State | Registry shows officers free? | Bulk file (free/$/none, officers y/n) | DBA names owner (state/county) | Best license-board bulk | Est. rate | Buy? |
|---|---|---|---|---|---|---|
| PA | Partly (filing-dependent); site blocks DC IPs (999) | **FREE** data.pa.gov xvd7-5r2c, officers **Y** (party_type + names, 4.2M rows) | State fictitious names (owner on filing); not in open data | Philly Carto com_act_licenses/business_licenses (legal first/last); PA tobacco ut72-sft8 | 70-80% | No |
| OH | No (agent + incorporator); site blocks DC IPs | FREE monthly new-filings TXT (agent + BUSINESS ASSOCIATE NAMES), full DB none found | State trade names (owner shown; no list sold) | OCILB roster page (empty today); OPAL liquor "ownership" reports | 45-60% | No |
| NY | No (CEO name for corps only) | FREE n9v6-gdp6, officers **N** (dos_process_name only for LLCs) | County clerk (owner on certificate); no bulk | DMV facilities nhjr-rpi2 (**owner_name**); NYC DOB t8hj-ruu2; DCWP w7w3-xahh | 50-65% | No |
| NC | Yes (officers/company officials); site blocks DC IPs | **$750 setup + $2,000/FY**, weekly CSV, officers **Y** (CorpOfficers) + Assumed Names RealPerson | State ABN DB since 12/2017 (owner searchable) | None found free | 70-80% | **Yes, $2,750 yr1** |
| NJ | No (name/status only; officers in $ status reports) | DORES "Business Entity Lists" exist, price/fields unverified, officers N | County clerk trade names; DORES trade-name lists ($) | DCA Verification_Bulk roster download (HIC, electrical, cosmetology shops, funeral) free | 45-60% | Maybe DORES list for DBA mapping |
| OR | Reportedly yes (members/managers) but DC IPs blocked | FREE tckn-sxa6, officers **N** (only ABN owners + RAs; no MEMBER/MANAGER rows) | State ABN, owner = AUTHORIZED REPRESENTATIVE row (free) | CCB g77e-6bhs **rmi_name** 56k; BCD vhbr-cuaq; OLCC srxe-qkm2 | 60-70% | No (ask SOS for priced member list) |
| RI | Yes (search by officer name available) | **$250 one-time / $3,000 yr** corporate DB, officers **Y** (primary officer/director/manager); Trade Name DB $500 / $1,200 yr with owners + email | State trade names (owner in bulk) | Unverified | 75-85% | **Yes, $750 one-time** |
| OK | No (RA; details $5) | **$500 master + $150 weekly**, officers **partial** (incorporator/owner/partner, no LLC members) | State trade names (in bulk) | ABLE monthly licensee xls (no owners) | 55-65% | Yes, $500 |
| ND | Unverified (RA shown) | **$40/type** Excel, officers **N** (RA only); owners file = trade names with first/last | State trade names (owner in $40 file) | SOS contractor file $40 (phone, no owner) | 55-65% | Yes, ~$160 |
| NM | Corps yes (biennial report), LLCs no | None | None/county | PSI lookup only | 50-60% | No |

### Three biggest surprises
1. **PA publishes officer/governor names for every registered business as free open data** (`xvd7-5r2c`, 4.17M business-officer rows incl. 1.14M named LLC rows). This should replace any PA scraping.
2. **Oregon's open registry has zero member/manager rows** — associated_name_type is only PRINCIPAL PLACE OF BUSINESS / REGISTERED AGENT / MAILING ADDRESS / AUTHORIZED REPRESENTATIVE, and every AUTHORIZED REPRESENTATIVE row is an assumed-business-name owner, not an LLC principal. The existing "authorized rep is usually the owner" assumption only holds for DBAs. CCB `rmi_name` is the real OR owner source for contractors.
3. **Cheap paid officer files exist where the live sites are blocked or thin**: RI $250 one-time (primary officer/manager) + $500 trade-name owners w/ email; OK $500 full DB with agent/incorporator/owner tables; ND $40 trade-name owner file; NC $2,750 weekly CSV with a CorpOfficers table plus an Assumed Names RealPerson table. Ohio's free monthly new-entity files also carry organizer/incorporator ("BUSINESS ASSOCIATE NAMES") and agent names, but only for the current month's filings and only reachable via unblocker.
