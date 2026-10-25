# Group 2 findings: GA, HI, ID, IL, IN, IA, KS, KY, LA, ME
Researched 2026-10-25. Method: WebSearch (standard) for discovery, then direct fetch of official pages (WebFetch; Apify web-fetch for pages that refused our datacenter IP; curl for JSON/XLS). "VERIFIED" = I fetched the official page/file and saw the text. "UNVERIFIED" = search snippets / third-party only. "OBSERVED" = behavior I saw from this box's IP today.
Note: the shared WebSearch budget ran out partway through (after ~45 searches); items after that point were verified by direct fetch of known official URLs only, and some county/DBA and liquor items in the smaller states remain UNVERIFIED and are marked so.

---------------------------------------------------------------------------------------------------
## GEORGIA (GA)

**TL;DR**
1. Best free source: eCorp business search (officers CEO/CFO/Secretary on annual registration) — but ecorp.sos.ga.gov returned a Cloudflare "Just a moment..." 403 to this box today (OBSERVED), so it needs a residential/browser path.
2. Bulk file: YES, PAID — Georgia Technology Authority sells the Corporations database: $1,000 one-time full DB via FTP; monthly FTP subscription $100 setup + $500/month (VERIFIED on georgia.gov/bulk-corporations-data).
3. Officers in bulk: NOT STATED on the official page (field list not published; agreement PDF not fetched). UNVERIFIED either way.
4. DBA names owner: county-level (Clerk of Superior Court); no statewide index on GSCCCA (VERIFIED: gsccca.org/search lists UCC, Real Estate, PT-61, Lien, Plat, Notary, Carbon — no trade-name index).
5. Est. rate: 55-65% (web/LinkedIn carry; registry blocked from datacenter).

**A. Entity registry** — https://ecorp.sos.ga.gov/BusinessSearch (VERIFIED URL; OBSERVED HTTP 403 Cloudflare challenge from this box, 2026-10-25). Search snippets (UNVERIFIED) consistently say the free record shows the 3 principal officers filed on the annual registration (typically CEO, CFO, Secretary) plus registered agent, and filing-history documents are free to download. LLCs: GA annual registration lists organizer/officers only if the LLC chooses to; LLC member/manager display is UNVERIFIED. No public JSON endpoint identified.

**B. Bulk data** — VERIFIED https://georgia.gov/bulk-corporations-data (GTA Office of Data Innovations): "To purchase the entire corporations database on FTP for $1,000"; monthly FTP subscription: "Establishing an account: $100", "Monthly data fee: $500"; format "plain text with the fields separated by '<tab>space'", fees nonrefundable, payment by check/money order; requires a signed Bulk Corporations Data Agreement + W-9; contact datainnovations@gta.ga.gov, 404-463-2300. Field layout and whether officer names are included are NOT on the page (UNVERIFIED). An older search snippet mentioned partial pulls at $15/1,000 records (max $1,200) — not on the current page (UNVERIFIED/likely retired). No GA Socrata/CKAN business-entity dataset found. Use restrictions live in the Sales Agreement PDF (not fetched).

**C. Trade names** — County Clerk of Superior Court (O.C.G.A. 10-1-490); the clerk keeps an alphabetical index; the filing names each person doing business under the name (owner for sole props). GSCCCA has NO statewide trade-name index (VERIFIED). Largest counties (Fulton, Gwinnett, Cobb, DeKalb, Chatham) — online trade-name search availability and bulk: UNVERIFIED (search budget exhausted before checking). No bulk file known.

**D. License boards** — SOS Professional Licensing Boards roster request: VERIFIED https://sos.ga.gov/page/licensing-roster-requests: "Rosters come in Text format... contain license number, name, city, state, zip, county, issue date, and expiration date"; no phone/email/home address; "Partial lists are not available"; "Payment must accompany request" (check/money order); order at https://goals.sos.ga.gov/GASOSOneStop/s/roster-request (Salesforce page; timed out for fetch; PRICE NOT VERIFIED). Covers GOALS-system boards (cosmetology/barber, residential & general contractors, electrical/plumbing/HVAC, funeral, etc.) — the roster is name + city, NO business name/address field listed, so matching Maps businesses by name is weak except for contractors whose license is in the business name. License verification site https://verify.sos.ga.gov/ returned 403 to WebFetch (OBSERVED). Real estate (GREC) and insurance are separate agencies (not checked).

**E. Liquor** — GA DOR Alcohol & Tobacco Division licenses via Georgia Tax Center; no open-data licensee file found (UNVERIFIED; searched once). Local alcohol licenses are city/county.

**F. General business license** — none statewide; occupation tax certificates are municipal (Atlanta, etc.) — not checked.

**G. Other** — nothing verified.

**H. Recommendation** — (1) Web/LinkedIn/About-page cascade (already strongest). (2) eCorp officer lookup via a residential-IP browser path (Cloudflare blocks datacenter). (3) County trade-name search for sole props in metro Atlanta counties (manual/HTML). Buy: the $1,000 GTA full database is cheap IF it includes officers — email datainnovations@gta.ga.gov for the record layout before buying (that single question decides it). PLB roster: ask price; low value because no business address. Realistic rate 55-65%. Build effort: medium (bulk load if officers present; else residential scraping).

---------------------------------------------------------------------------------------------------
## HAWAII (HI)

**TL;DR**
1. Best free source: DCCA Business Registration search (HBE) — officers/members/managers are public ("Information filed with our office is public and can be viewed by searching under the registered entity name in our Business Name Search" — VERIFIED FAQ). hbe.ehawaii.gov returned 403 to this box (OBSERVED); the new portal hbe.dcca.hawaii.gov loaded via Apify.
2. Bulk file: YES — "Entity List Builder" on hbe.dcca.hawaii.gov: "Lists include all addresses, officers, trade names, trademarks, and service marks"; "One-time Search $0.05 per records found"; "All records (weekly) $0.00 flat rate per month" (VERIFIED page text; the $0.00 weekly line is quoted as shown — confirm meaning before relying on it).
3. Officers in bulk: YES (per the List Builder description).
4. DBA names owner: Trade names are registered statewide with DCCA BREG; registrant is in the record (Honolulu open-data mirror has registrant_name field — VERIFIED columns, dataset stale 2022).
5. Est. rate: 70%+ if the List Builder export is loaded.

**A. Entity registry** — Legacy search https://hbe.ehawaii.gov/documents/search.html (OBSERVED 403 Forbidden from this box; data.hawaii.gov catalog entry just links to it — VERIFIED). New portal https://hbe.dcca.hawaii.gov/search-and-buy ("Search businesses, trade names & marks; Buy documents" — VERIFIED landing page). FAQ (VERIFIED https://cca.hawaii.gov/breg/faqs/): officers/directors/members/managers "depends on what has been filed"; copies $3 flat, certified +$10. Annual report images: purchased, not free (VERIFIED FAQ). JSON endpoints: not identified.

**B. Bulk data** — VERIFIED https://hbe.dcca.hawaii.gov/entity-list-builder (rendered): "Build a customized list of businesses registered in the State of Hawaii. You can refine your list by entity type, zip code, date, and status. Lists include all addresses, officers, trade names, trademarks, and service marks associated with the businesses found in your search." Cost table: "One-time Search | $0.05 per records found"; "All records (weekly) | $0.00 flat rate per month". Also "Agent Search" list tool. Open data: data.honolulu.gov 9k54-ztb8 "Hawaii Business Registration" (VERIFIED metadata) — marked out of date (rows updated June 2022), 32 columns incl. agent_name, registrant_name, trade_name, managed_by (MEMBER(S)/MANAGER(S) only), NO officer names. opendata.hawaii.gov (CKAN) has only HTML links for Business Name Search and PVL Search (VERIFIED package_search).

**C. Trade names** — Statewide at DCCA BREG (trade name/trademark/service mark registration; searchable in HBE). Registrant name is the owner for sole props (Honolulu mirror has registrant_name/registrant_address — VERIFIED columns). Included in List Builder output (VERIFIED text).

**D. License boards** — PVL (all boards incl. contractors, cosmetology, real estate, motor vehicle dealers/repair, pest control, etc.) search https://mypvl.dcca.hawaii.gov/public-license-search/ (VERIFIED; license types include "CONTRACTOR - ENTITY", "CONTRACTOR - RESPONSIBLE MANAGING EMPLOYEE", "CONTRACTOR - SOLE PROPRIETOR", "MOTOR VEHICLE REPAIR DEALER", "PEST CONTROL OPERATOR - ENTITY", "REAL ESTATE BROKER ENTITY", etc.). Results show Name/License/Type/Location. Bulk/roster download: not found on page; the DCCA site offers "Business Data List Builder" (entity data) — PVL licensee list purchase UNVERIFIED.

**E. Liquor** — county liquor commissions (Honolulu, Maui, Hawaii, Kauai); no state file. UNVERIFIED (not searched).

**F. GET license** — Hawaii Tax Online license search exists (tax.ehawaii.gov/hoihoi/licenses.html redirects to hitax.hawaii.gov; the rendered page required cookies and showed only "Where's My Refund") — fields UNVERIFIED.

**G. Other** — nothing verified.

**H. Recommendation** — (1) Buy the HBE Entity List Builder export (officers included) — at $0.05/record a full state (~150-200k active entities) is ~$7-10k one-time, or test the "All records (weekly) $0.00" option first (could be free; wording ambiguous). Even a zip-code/entity-type subset for Maps-target areas is cheap. (2) Live HBE lookups via residential path for misses. (3) PVL search for contractor RME names. Rate 70%+. Effort: bulk load (CSV) — low.

---------------------------------------------------------------------------------------------------
## IDAHO (ID)

**TL;DR**
1. Best free source: SOSbiz business search (React SPA; loaded HTTP 200 from this box — OBSERVED) — governors (members/managers/directors) and RA reportedly shown free; UNVERIFIED this session.
2. Bulk file: none found (vendor docs say no bulk/open-data export; official page not found) — UNVERIFIED.
3. Officers in bulk: n/a.
4. DBA: Assumed Business Names are filed statewide with the SOS and searchable in SOSbiz; owner named — UNVERIFIED (search budget ran out).
5. Est. rate: 60-70%.

**A. Entity registry** — https://sosbiz.idaho.gov/search/business (OBSERVED 200; SPA with /static/js/main.*.js; /api/Records/businesssearch answered 405 to GET, i.e., POST API exists — OBSERVED). Third-party docs conflict on whether "governors" display; one says yes (status, RA, addresses, governors), another says officers not public. UNVERIFIED. Annual report has no fee; filings viewable: UNVERIFIED.

**B. Bulk data** — No official bulk-data page found; Topograph says "no bulk data export or open-data feed" (UNVERIFIED). No ID open-data business dataset found.

**C. Trade names** — Idaho Certificate of Assumed Business Name is filed with the SOS (statewide) and searchable in SOSbiz; the certificate names the owner(s). UNVERIFIED (no fetch).

**D. License boards** — DOPL "Get a List of Licensees": VERIFIED https://edopl.idaho.gov/OnlineServices/?link=PubListSearch (rendered): "Generates a list containing all licensees that fit a broad set of criteria. The list can be exported to Excel. The exported list has additional fields not displayed in initial result list, like city and state. List search information is updated on weekday mornings and evenings." Filters: single/multiple boards, license type, status, county, city, state, ZIP, issue dates. FREE (no fee shown). Covers all DOPL boards (contractors registration, plumbing, HVAC, electrical, cosmetology/barber, real estate, etc.). Whether the export includes business name/qualifier link: UNVERIFIED.

**E. Liquor** — Idaho State Police ABC; no open file found (not searched).

**F/G** — nothing verified.

**H. Recommendation** — (1) Reverse-engineer SOSbiz POST API (/api/Records/businesssearch) from a browser session; pull entity + ABN records live (no bot block observed). (2) DOPL free licensee lists (Excel export) for contractor/trade matching. (3) Web cascade. Nothing to buy. Rate 60-70%. Effort: live JSON (medium).

---------------------------------------------------------------------------------------------------
## ILLINOIS (IL)

**TL;DR**
1. Best free source: SOS Data Transparency Act bulk files (free). www.ilsos.gov and apps.ilsos.gov refused this box (empty reply/timeouts — OBSERVED), page fetched via Apify.
2. Bulk file: YES, FREE, daily full refresh (VERIFIED). Corporations: cdxallmst/nam/agt/arp/aon/stk/oth.zip; LLC: llcallmst/nam/agt/arp/ase/old/mgr/ser.zip at https://apps.ilsos.gov/data/bs/.
3. Officers in bulk: **YES for corporations** — CORP-MASTER record carries CORP-PRES-NAME-ADDR (pos 41-100) and CORP-SEC-NAME-ADDR (pos 101-160) = president and secretary name+address (VERIFIED in proc_corp_data.pdf). LLC file llcallmgr has manager/member name+address+type (VERIFIED). The brief's "corp officers NOT in files" is WRONG.
4. DBA names owner: sole-prop assumed names are county-clerk level (Cook etc.); corp/LLC assumed names in bulk files. County online owner search UNVERIFIED.
5. Est. rate: 65-75% with the master file loaded correctly; Chicago 80%+ via Business Owners dataset.

**A. Entity registry** — Search: https://apps.ilsos.gov/businessentitysearch/ (snippets) / legacy corporatellc; free; shows president & secretary (corps), managers (LLCs), RA. Site prohibits automated queries (VERIFIED terms text on data page). OBSERVED: www.ilsos.gov and apps.ilsos.gov do not answer from this box (curl "Empty reply from server"/timeout; WebFetch 403; Apify fetch of apps.ilsos.gov/data/bs/ timed out but www.ilsos.gov pages fetched fine via Apify).

**B. Bulk data** — VERIFIED https://www.ilsos.gov/data/bus-serv-home.html (Business Data Transparency Act, P.A. 102-0049). Free, no login. Files: Corporations Bulk Data: Master, Company Name, Agent, Annual Report, Assumed/Old Names, Stock, Other; LLC Bulk Data: Master, Company Name, Agent, Annual Report, Assumed, Old Names, Managers, Series. Documentation: https://www.ilsos.gov/content/dam/data/bs/proc_corp_data.pdf and proc_llc_data.pdf (VERIFIED, v004 04/04/2024). Cadence: "one set of each of these 7 files generated at the time the job runs (Daily)", each is a full snapshot. Fixed-width: CORP-MASTER 160 chars: FILE-NUMBER(1-8), INCORP-DATE, EXTENDED-DATE, STATE-CODE, INTENT(27-29), STATUS(30-31), TYPE-CORP(32), TRANS-DATE, **CORP-PRES-NAME-ADDR X(60) 41-100, CORP-SEC-NAME-ADDR X(60) 101-160** ("The president's name and address. If the first three characters of the name equal 'I', then this is an incorporator and not necessarily the president"; same for secretary). CORP-ANNUAL-REPORTS (126 chars) is franchise-tax/payment data only (no names). CORP-AGENT: agent name/street/city/zip/county + agent code (0 = individual). CORP-ASSUMED-OLD-NAME 222 chars (assumed/old names with type codes). CORP-INTENT codes include 012/013 construction, 026 personal services (barber/beauty), 031 restaurant, 004 auto repair, etc. (useful for vertical filtering). LLC: LL-MASTER 136 chars (purpose code = IRS 1065 business code, status, mgmt type 1=member-managed 2=manager-managed), LL-MANAGER-MEMBER 163 chars: LL-MM-NAME X(60), street, city, juris, zip, file date, LL-MM-TYPE-CODE (1 manager, 2 member, 3 both); LL-ASSUMED-NAME 281 chars. Terms: data "for informational purposes only", no warranty; automated queries to the website prohibited (files themselves are provided for download). Open-data portal: data.illinois.gov has no SOS entity dataset (search returned none).

**C. Trade names** — Corporations/LLC assumed names: in bulk files (cdxallaon / llcallase). Sole proprietors/partnerships: Assumed Business Name Act — filed with the COUNTY CLERK (Cook County Clerk assumed names; DuPage, Lake, Will, Kane). Online owner search per county: UNVERIFIED (cookcountyclerkil.gov returned 403/404 to fetch).

**D. License boards** — IDFPR "Professional Licensing" open dataset: VERIFIED https://data.illinois.gov/Business-and-Workforce/Professional-Licensing/pzzh-kp68 (Socrata; rows updated 2026-10-22; license ODbL). Columns: license_type, description, license_number, license_status, business, title, first_name, middle, last_name, prefix, suffix, **business_name, businessdba**, original_issue_date, effective_date, expiration_date, city, state, zip, county, specialty_qualifier, ever_disciplined, discipline fields. Free full CSV/SODA API. Covers DPR + DRE boards: cosmetology/barber (and salon licenses), roofing contractors (the only state-licensed contractor trade in IL), plumbing contractors are IDPH (not here), real estate brokers/managing brokers + brokerage firms, funeral directors, dental/medical/vet/chiro, collection agencies, etc. For roofing contractor and salon/brokerage records the "qualifying" individual relationship is via business_name on the individual's record. IDFPR bulk lookup page https://idfpr.illinois.gov/licenselookup/bulklookup.html links to this dataset (VERIFIED). Note: the IDFPR micropact lookup is behind bot management (snippet, UNVERIFIED) — irrelevant given the open dataset.

**E. Liquor** — ILCC license lookup; no data.illinois.gov liquor dataset found (catalog search returned none — VERIFIED none in domain catalog). Chicago: "Business Licenses - Current Liquor and Public Places of Amusement Licenses" nrmj-3kcf (VERIFIED exists) — joins to Business Owners by account_number.

**F. City business licenses** — Chicago (VERIFIED metadata, updated daily 2026-10-24): Business Licenses r5kz-chrr (fields: id, license_id, account_number, site_number, legal_name, doing_business_as_name, address, city, state, zip_code, ward..., license_code, license_description, business_activity, license_number, application_type, license_start_date, expiration_date, license_status, latitude, longitude...); Business Licenses - Current Active uupf-x98q; **Business Owners ezma-pppn: account_number, doing_business_as_name, owner_first_name, owner_middle_initial, owner_last_name, owner_name_suffix, owner_name, owner_title** ("contains the owner information for all the accounts listed in the Business License Dataset", 2002-present, updated daily). This is a direct name+address -> owner/officer join for every licensed Chicago business.

**G. Other** — IDPH plumbing contractor list (not checked). Cook County / Chicago health permits (not checked).

**H. Recommendation** — (1) Re-parse the IL corp Master file for CORP-PRES-NAME-ADDR / CORP-SEC-NAME-ADDR (strip leading "I" incorporator cases) — this immediately adds corporate officers to the existing Supabase load; keep llcallmgr for LLCs. (2) Chicago Business Licenses + Business Owners join (free SODA). (3) IDFPR pzzh-kp68 for salons/roofers/brokerages/funeral/health practices (business_name match). (4) Web cascade. Nothing to buy. Rate 65-75% statewide, 80%+ Chicago. Effort: bulk load (already partly done) — low.

---------------------------------------------------------------------------------------------------
## INDIANA (IN)

**TL;DR**
1. Best free source: INBiz public business search — "Governing Person Information (title, name, address)" section per snippets (UNVERIFIED; INBiz was down for maintenance until Mon Oct 26 7am — OBSERVED 503 "INBIZ IS UPGRADING").
2. Bulk file: YES, PAID — official fee rule: One-time bulk download $8,000; Bulk download with monthly updates $9,500; Bulk data monthly update $500; Monthly Listing of New Businesses $35 (VERIFIED in SOS Regulatory Analysis LSA 25-155, effective July 1 2025).
3. Officers in bulk: UNVERIFIED (layout not published on the pages I could reach; INBiz down).
4. DBA names owner: sole props file Certificate of Assumed Business Name with the COUNTY RECORDER; entity assumed names at SOS. County online: UNVERIFIED.
5. Est. rate: 55-65%.

**A. Entity registry** — https://bsd.sos.in.gov/publicbusinesssearch (OBSERVED 503 maintenance page 2026-10-25: "The site will be available again on Monday, October 26th at 7am"). Snippets (UNVERIFIED): free search by business name, ID, RA, incorporator, or principal name; profile has "Governing Person Information (title, name, address)" and RA; Business Entity Report (biennial) lists principals. Filing images: UNVERIFIED.

**B. Bulk data** — INBiz Bulk Data Services https://inbiz.in.gov/Inbiz/BulkDataServices/Index (503 today). VERIFIED fee schedule from https://www.in.gov/sos/business/files/Regulatory-Analysis-Business-Entity-Bulk-Data-Fees-LSA-25-155-OMB-2025-01R.pdf: "26. Monthly Listing of New Businesses $35.00; 27. Bulk download with monthly updates $9,500.00; 28. Bulk data monthly update $500.00; 29. One-time bulk download $8,000.00". "The one-time bulk download ... includes a file generated on the 1st of each month"; "Due to the size of the dataset, the one-time bulk download is delivered via a portable data storage [device]"; monthly update "contains differential data". The text also says "The general public can search the same data set directly for free online" and that fee items include "Change of Governing Person" filings — suggesting governing persons are in the dataset, but the file layout is NOT stated (officers UNVERIFIED). Indiana Data Hub (hub.mph.in.gov) has no SOS entity dataset found (not searched further).

**C. Trade names** — Entities: assumed names filed at SOS (in INBiz). Sole props/partnerships: county recorder (Marion, Lake, Allen, Hamilton). Online owner search: UNVERIFIED.

**D. License boards** — PLA Data Download: VERIFIED https://secure.in.gov/pla/license/download-license-files: fields "name, license number, address, issue date, expiration date, and license status"; CSV; "$150 for the first record" and "$10 for each additional 1,000 records"; "a record is information on one (1) practitioner"; filters by license type, status, issue/expiration date, resident/non-resident, county; real-time DB. No business-name/qualifier field stated. Covers PLA boards (cosmetology/barber, plumbing, real estate, funeral, auctioneers, engineers, health boards; HVAC/electrical are LOCAL in Indiana — not state). Price list VERIFIED https://secure.in.gov/accounts/ingov-services-price-list: "Professional License Bulk Download ... $150.00 for the first record and $10.00 per each additional 1000 records".

**E. Liquor** — ATC Bulk Download VERIFIED (same price list): "Download list formatted, customized information from permits issued through the Alcohol & Tobacco Commission" — $150 first record + $10/1,000. Fields (permittee/owner?) UNVERIFIED.

**F/G** — none verified.

**H. Recommendation** — (1) After Oct 26, live INBiz profile scrape (governing persons) — check for bot protection then. (2) Web cascade. (3) PLA/ATC downloads are cheap (~$150-$600 for a whole board) but lack business linkage — use only for name-in-business cases. Do NOT buy the $8,000 bulk file until SOS confirms governing persons are included (ask INBiz support for the layout). Rate 55-65%. Effort: live HTML.

---------------------------------------------------------------------------------------------------
## IOWA (IA)

**TL;DR**
1. Best free source: data.iowa.gov "Active Iowa Business Entities" (free, weekly-ish) — RA + home office ONLY, no officers (VERIFIED columns). SOS search sos.iowa.gov shows officers from biennial report (snippets) but returned Cloudflare "Just a moment" 403 to this box (OBSERVED).
2. Bulk file: free open data (RA only). No officer bulk product found.
3. Officers in bulk: NO.
4. DBA names owner: county recorder trade names (sole props) — UNVERIFIED online availability.
5. Est. rate: 65-75% (web cascade already measured 78% on small sample; contractor registration file adds first/last names).

**A. Entity registry** — https://sos.iowa.gov/search/business/search.aspx (OBSERVED 403 Cloudflare challenge from this box). Snippets (UNVERIFIED): free; biennial report lists officers (corps) / members-managers (LLCs); third-party API doc says the portal returns full officer roster with role/director flag/address. Filed images: UNVERIFIED.

**B. Bulk data** — Iowa Data Hub (new platform, idh-be.iowa.gov) dataset 554 "Active Iowa Business Entities" https://data.iowa.gov/catalog/dataset/554 (VERIFIED metadata/columns via API): corp_number, legal_name, corporation_type, effective_date, registered_agent, ra_address_1/2, ra_city/state/zip, ra_lat/long/location, home_office, ho_address_1/2, ho_city/state/zip/country, ho_lat/long. Active entities only (~335k per vendor doc, UNVERIFIED count). No officers. Last updated Oct 23, 2026 (catalog). Free CSV/API. No paid SOS bulk officer product found (not confirmed either way).

**C. Trade names** — Iowa Code 547: trade names for sole props/partnerships recorded with the COUNTY RECORDER (Polk, Linn, Scott, Johnson, Black Hawk). Entities' fictitious names at SOS. Online search/bulk: UNVERIFIED.

**D. License boards** — **Active Iowa Construction Contractor Registrations** dataset 1052 https://data.iowa.gov/catalog/dataset/1052 (VERIFIED; weekly): registration_number, first_name, last_name, business_name, email_address, address_1/2, city, state, zip_code, phone, county, issue_date, expire_date, primary_activity. Every contractor earning $2k+ must register — this gives owner first/last + business name + address + email + phone for the whole construction vertical, free. Plumbing & Mechanical Board, cosmetology (IDPH boards) — no open dataset found (search budget exhausted). Iowa Asbestos Permits dataset 561 exists.

**E. Liquor** — No licensee-with-owner dataset: data.iowa.gov has Iowa Liquor Stores (1028: store, name, status, address — no owner), Liquor Sales (by store), Products (VERIFIED catalog). ABD license lookup may show owner — UNVERIFIED.

**F/G** — none verified.

**H. Recommendation** — (1) Load dataset 1052 (contractor registrations) — direct owner names for trades. (2) Keep dataset 554 for legal-name/RA matching (individual RA at business address = strong owner candidate). (3) SOS officer lookup via residential path for remaining entities. (4) Web cascade. Nothing to buy. Rate 65-75%. Effort: open-data query (low).

---------------------------------------------------------------------------------------------------
## KANSAS (KS)

**TL;DR**
1. Best free source: web cascade; SOS Business Entity Search Station (RA + officers only "if information report on file", conflicting snippets) — sos.ks.gov returned CloudFront 403 "request could not be satisfied" to this box (OBSERVED).
2. Bulk file: none found (vendor says no bulk/open data; no official page) — UNVERIFIED.
3. Officers in bulk: n/a.
4. DBA: Kansas has NO state or county DBA registration requirement (UNVERIFIED — search budget exhausted before confirming; widely stated).
5. Est. rate: 50-60%.

**A. Entity registry** — https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx (OBSERVED 403 CloudFront). Copies page VERIFIED https://www.sos.ks.gov/businesses/copies-and-certifications.html: file-stamped copies "available to view and print online without cost" (so annual/information report images with officer names should be viewable free once past the block); certified copies paid online (price not stated). Officer display on the free detail page: conflicting third-party claims (UNVERIFIED). Information reports are biennial for most entities (snippet).

**B. Bulk data** — None found on sos.ks.gov; KORA policy page exists; no KS open-data business dataset. UNVERIFIED negative. KDOR tax registrations are confidential (K.S.A. 79-3234) per KDOR fee doc (snippet; UNVERIFIED).

**C. Trade names** — No DBA registry (UNVERIFIED).

**D. License boards** — Kansas has no state general-contractor license (local). Cosmetology, real estate, funeral, etc.: no downloads checked (budget exhausted). UNVERIFIED.

**E. Liquor** — KDOR ABC public records search https://www.kdor.ks.gov/apps/liquorlicensee/ (VERIFIED landing): terms say the "list of licensee names and addresses" is a public record but restrict commercial use; search page Active.aspx; no download seen. Owner names: UNVERIFIED.

**F/G** — none.

**H. Recommendation** — (1) Web cascade. (2) SOS information-report images via residential browser path (free). Nothing to buy. Rate 50-60%. Effort: live HTML (medium) — low priority state.

---------------------------------------------------------------------------------------------------
## KENTUCKY (KY)

**TL;DR**
1. Best free source: FastTrack business search — free "Current Representative Search" covers "current officers of corporations and the members and managers of LLCs" (VERIFIED page text); profile page loads officers dynamically ("Loading..." placeholders — officer block not captured, UNVERIFIED render).
2. Bulk file: YES, PAID for commercial use — Business Records $2,000/month (VERIFIED); non-commercial users pay no subscription fee.
3. Officers in bulk: **YES** — "All Officers" monthly file (fname, mname, lname, Type) with type codes incl. President, Secretary, Member (M), Manager (N), Managing Member (2), Sole Officer, Organizer, Incorporator, Registered Agent (8) (VERIFIED in Business Entity Data File Formats.xls).
4. DBA names owner: assumed names for entities are at SOS (comptype 03/04/07/12/13 in the same file); sole-prop assumed names are COUNTY CLERK (UNVERIFIED online).
5. Est. rate: 75-85% (already measured 90% on 10).

**A. Entity registry** — Search https://sosbes.sos.ky.gov/BusSearchNProfile/Search.aspx (VERIFIED; web.sos.ky.gov/bussearchnprofile/search.aspx is 404 now). Free, no captcha seen. Officer search https://sosbes.sos.ky.gov/BusSearchNProfile/Offsearch.aspx (VERIFIED text: searches "current officers of corporations and the members and managers of LLCs", "Records reflect the last filed annual report", free 24h). Profile https://sosbes.sos.ky.gov/BusSearchNProfile/Profile.aspx?ctr=NNNN shows General Information (org number, type, status, standing, dates, principal office, RA, shares) with two dynamic "Loading..." sections (officers/images presumably; not rendered in my fetch — UNVERIFIED). Annual-report images: UNVERIFIED (not seen). OBSERVED: no bot block from this box.

**B. Bulk data** — VERIFIED https://www.sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx: Business records files — All Companies (monthly), All Initial Officers (monthly), All Officers (monthly), New Companies Weekly / New Company Officers Weekly, New Companies / New Company Officers (daily), Company Changes / Company Officer Changes (daily); tab-delimited. Prices: "Business Records - $2,000 per month; UCC Filings - $1,500 per month; UCC Filing Images - $300 per month"; "Non-commercial users ... are not required to pay a monthly subscription fee" (fee applies if use becomes commercial). Subscribe via Kentucky.gov registration + Subscriber Agreement; (502) 875-3733. Layout VERIFIED (https://sos.ky.gov/bus/Documents/Business%20Entity%20Data%20File%20Formats.xls): All Companies: ID, comptype, compseq, Name, Standing, Status, Country, State, Type, raname, raaddr1-4, racity, restate, razip, poaddr1-4, pocity, postate, pozip, filedate, orgdate, authdate, recorddate, ..., mangnum, applname, appltitl, profit, recordnumber. All Officers: ID, comptype, compseq, Type, fname, mname, lname, chgdate, recordnumber; officer Type codes: P President, V VP, S Secretary, T Treasurer, D Director, M Member, N Manager, L Sole Officer, C Chairman, H Shareholder, E CEO, @ Officer, U Unknown, I Incorporator, O Organizer, G General Partner, X ARP Signature, A Accountant, R Asst Sec, B Asst Treas, F CFO, Y CPA, J COO, K Clerk, Q CIO, W Executive, Z General Manager, 1 Limited Partner, 2 Managing Member, 3 Managing Partner, 4 Managing Agent, 5 Partner, 6 No Title, 7 Initial Director, 8 Registered Agent. comptype includes assumed names (03 partnership, 04 corporation, 07 GP assumed, 12 LLC assumed, 13 LLP assumed) — "An LLC (type 06) and its assumed names (type 12) share the same ID". No separate open-data portal dataset.

**C. Trade names** — Entity assumed names: SOS (in bulk + search). Sole proprietor assumed names: county clerk (KRS 365.015) — online search UNVERIFIED.

**D. License boards** — HBC (electrical, HVAC, plumbing, boilers) license search; Board of Cosmetology; Real Estate Commission — downloads not checked (budget exhausted). UNVERIFIED.

**E. Liquor** — KY ABC license lookup; no file verified.

**F/G** — KY One Stop (onestop.ky.gov) business portal — not checked.

**H. Recommendation** — (1) Live FastTrack lookups (no block observed): Profile + Offsearch; or render Profile with JS to capture officer block. (2) Bulk: $2,000/month commercial is steep for one state, but a single month buys the full All Companies + All Officers snapshot (members/managers included) — worth it if KY volume is high; otherwise live. Rate 75-85%. Effort: live HTML (low) or bulk load (low).

---------------------------------------------------------------------------------------------------
## LOUISIANA (LA)

**TL;DR**
1. Best free source: SOS Commercial Database (coraweb) — officers/members/managers + agents public; search page protected by reCAPTCHA (VERIFIED page text; page loaded 200 from this box — OBSERVED).
2. Bulk file: no bulk download product found on the new sos.la.gov site. Commercial API: $500/yr (per LAC rule, UNVERIFIED on official page); API guide VERIFIED — Lookup returns Officers (first/last/address/Titles), Agents, TradeServiceDetails (ApplicantName) — rate limit 18 calls/min, max 1,000 search results.
3. Officers via API/search: YES.
4. DBA names owner: statewide Trade Name registration at SOS names the applicant (VERIFIED API field ApplicantName; search by "Trade Registration Number" VERIFIED); parish-level DBAs at Clerk of Court (VERIFIED FAQ).
5. Est. rate: 65-75% with the API.

**A. Entity registry** — https://coraweb.sos.la.gov/commercialsearch/commercialsearch.aspx (VERIFIED: search by Entity Name; Charter/Trade Registration/Name Reservation Number; Officer Name or Agent Name; "This site is protected by reCAPTCHA"). FAQ VERIFIED (https://www.sos.la.gov/business-services/frequently-asked-questions): "An agent's name and address are publically available and are displayed on the Secretary of State's website"; officers/directors and members/managers are filed (Notice of Change forms, annual report); details page shows "All of the information regarding your business". Older snippet: "names and addresses of current officer(s), director(s), member(s) and manager(s) may be printed from the Commercial Database" (UNVERIFIED on live page). Document images: certified/plain copies purchased ($20 certified).

**B. Bulk data** — The old "Order Documents and Certificates" page (custom query $25 first 40 records + $0.01/record) is gone (404 on both old URLs — OBSERVED); no equivalent found on the redesigned site; treat the custom-list pricing as UNVERIFIED/possibly retired. **Commercial API** VERIFIED https://www.sos.la.gov/business-services/search-business-filings: "subscribe to Commercial API ... to search for business information directly from your proprietary electronic systems"; subscriptions at https://subscriptions.sos.la.gov; guide https://www.sos.la.gov/media/dqbbham4/commercial-api-guide.pdf (VERIFIED, v1.0 2020): REST/JSON at https://commercialapi.sos.la.gov/; Live token "purchased for a yearly fee", Test token free; 18 calls/minute; CommercialSearch by entity name or agent/officer first/last name (max 1,000 results); CommercialLookup by EntityNumber returns CharterDetails, Agents[], **Officers[] {FirstName, LastName, Address1/2, City, State, Country, Zip, Titles}**, Addresses, PreviousNames, Mergers, Amendments; TradeServiceDetails {RegisteredName, ApplicantName, ApplicantAddress, TypeOfBusiness,...}. Fee: LAC Title 4 Part V rule / Notice of Intent cites a $500 one-year non-refundable subscription (search snippet; official PDF/page returned 403/404 to me — UNVERIFIED amount).

**C. Trade names** — SOS trade name/trademark/service mark registration ($95, form #309 — VERIFIED fee schedule); applicant can be a person (sole prop) — owner named (ApplicantName). Parish DBAs: Clerk of Court (VERIFIED FAQ) — no online index verified.

**D. License boards** — LSLBC contractor search https://arlspublic.lslbc.louisiana.gov/Public/DetailedSearch/ByName (+ ByQP qualifying party, ByCityTown, ByParish, ByType, Advanced) VERIFIED links on https://www.lslbc.louisiana.gov/contractor-search/; "Request License Roster" menu item seen in search snippet (UNVERIFIED; price unknown). Third-party Apify scrapers exist (~$0.004/record, UNVERIFIED). Other boards (cosmetology, real estate, HVAC = LSLBC mechanical) not checked.

**E. Liquor** — ATC permit search; no file verified.

**F/G** — none.

**H. Recommendation** — (1) Buy the Commercial API ($500/yr if the rule is current): 18 req/min = ~25k lookups/day, returns officers + trade-name applicants; this is the cleanest paid SOS source in the group. (2) LSLBC QP search for contractors. (3) Web cascade. Rate 65-75% (up from measured 22%). Effort: live JSON (low).

---------------------------------------------------------------------------------------------------
## MAINE (ME)

**TL;DR**
1. Best free source: ICRS corporate name search (loads 200 from this box — OBSERVED); free Information Summary shows clerk/RA; officers appear on annual report images (paid copy; third-party says $3) — conflicting snippets, UNVERIFIED.
2. Bulk file: YES, PAID via InforME: Corporate & UCC records $600/month (active) or $1,200 (active+inactive); images $1,500; weekly corporate data updates $300 (VERIFIED).
3. Officers in bulk: NOT STATED on official page (UNVERIFIED).
4. DBA: sole-prop assumed names filed with the MUNICIPAL clerk (not state) — UNVERIFIED; entity assumed names at SOS.
5. Est. rate: 50-60%.

**A. Entity registry** — https://apps3.web.maine.gov/nei-sos-icrs/ICRS?MainPage=x (VERIFIED: keyword/charter-number search, reCAPTCHA on search button; "strictly prohibits mining data" and automated tools may lead to suspended access; documents retrievable free for 15 days after purchase; standard/certified copies in PDF). What the free summary shows: snippets conflict (one says officers shown; another says only clerk/RA, with the latest annual report image sold for $3). UNVERIFIED.

**B. Bulk data** — VERIFIED https://www.maine.gov/sos/corporations-commissions/bulk-data: InforME (info@informe.org, 207-621-2600). Full Data Monthly: Corporate and UCC Records $600.00; Active/Inactive Corporate and UCC Records $1,200.00; Corporate and UCC Images $1,500.00; Service/Trade Mark Records $300; Images $300. Weekly updates: Corporate Data $300; Corporate Images $500; UCC Data $300; UCC Images $500; marks $150 each. Field list / officer inclusion: not on page (UNVERIFIED). Separate lists per search snippet: $100 list of all active entity names; $10 monthly new-entity lists (cec.corporations@maine.gov) — UNVERIFIED (page 403 to me).

**C. Trade names** — Entities: assumed names filed with SOS. Sole proprietors: file with the municipal clerk of the town (Title 31 §2) — no state index. UNVERIFIED.

**D. License boards** — OPOR (Office of Professional & Occupational Regulation) licensing site https://www.maine.gov/pfr/professionallicensing/ (fetched; link list only — no "data download" link found in the page's links). Maine has no general contractor license; plumbers/electricians/oil-burner techs are OPOR boards. Licensee data download: UNVERIFIED.

**E. Liquor** — BABLO; not checked.

**F/G** — none.

**H. Recommendation** — (1) Web cascade. (2) ICRS live lookup + buy annual report image for high-value misses (~$3 each if accurate). (3) Ask InforME for the bulk layout; $600 one month is affordable IF officers are included. Rate 50-60%. Effort: live HTML (medium).

---------------------------------------------------------------------------------------------------
## SUMMARY TABLE

| State | Registry shows officers free? | Bulk file (free/$/none, officers y/n) | DBA names owner (state/county) | Best license-board bulk | Est. rate | Buy? |
|---|---|---|---|---|---|---|
| GA | Yes (CEO/CFO/Sec) per snippets; Cloudflare-blocked from datacenter (OBSERVED) | $ GTA: $1,000 one-time / $100+$500 mo (VERIFIED); officers UNKNOWN | County (Superior Court clerk); no GSCCCA index (VERIFIED) | PLB roster (paid, name+city only, no biz addr) | 55-65% | Maybe: $1,000 DB only if layout has officers |
| HI | Yes (public per FAQ); legacy site 403 to us | $ Entity List Builder $0.05/record incl. officers; "All records (weekly) $0.00/mo" (VERIFIED text) | State (DCCA trade names; registrant) | PVL search (no bulk verified) | 70%+ | YES: List Builder |
| ID | Probably (governors) UNVERIFIED; SPA API open | none found | State ABN at SOS (UNVERIFIED) | DOPL free licensee list export (VERIFIED) | 60-70% | No |
| IL | Yes (pres/sec, LLC managers) | FREE daily DTA files; officers YES (pres+sec in corp Master; LLC managers file) (VERIFIED) | County for sole props; entity assumed names in files | IDFPR pzzh-kp68 free (business_name, businessdba) + Chicago Business Owners ezma-pppn | 65-75% (80%+ Chicago) | No |
| IN | Yes (governing persons) per snippets; site down till Oct 26 | $8,000 one-time / $9,500+$500 mo (VERIFIED); officers UNVERIFIED | County recorder for sole props | PLA & ATC downloads $150 + $10/1,000 (VERIFIED; no biz link) | 55-65% | Not yet |
| IA | Yes (biennial report) per snippets; Cloudflare-blocked from datacenter | FREE dataset 554 (RA only, no officers) (VERIFIED) | County recorder | Contractor Registrations dataset 1052 FREE w/ first/last/business/email/phone (VERIFIED) | 65-75% | No |
| KS | Unclear; CloudFront 403 from datacenter | none found | None (no DBA registry, UNVERIFIED) | none found | 50-60% | No |
| KY | Yes (officers + LLC members/managers via Offsearch; VERIFIED text) | $2,000/mo commercial (free non-commercial); officers YES incl. M/N/2 member-manager codes (VERIFIED) | Entity assumed names at SOS; sole props county clerk | none verified | 75-85% | Optional: one month $2,000 |
| LA | Yes (officers/members/agents) behind reCAPTCHA | none; Commercial API ~$500/yr returns Officers[] (guide VERIFIED, fee UNVERIFIED) | State trade names (ApplicantName) + parish DBAs | LSLBC QP search (roster UNVERIFIED) | 65-75% | YES: Commercial API |
| ME | Clerk/RA free; officers on paid AR image (conflicting) | $600/mo InforME (VERIFIED); officers UNKNOWN | Municipal clerk (sole props) | none verified | 50-60% | Maybe: ask InforME layout |

## Top surprises
1. ILLINOIS corporate officers ARE in the free DTA bulk files: CORP-MASTER positions 41-100 = president name+address, 101-160 = secretary name+address (proc_corp_data.pdf v004). The repo's "corp officers not in files" assumption is wrong — re-parse cdxallmst.zip.
2. HAWAII sells an Entity List Builder export that explicitly "include[s] all addresses, officers, trade names" at $0.05/record, with an "All records (weekly) $0.00 flat rate per month" line — potentially a free weekly full-state officer file.
3. LOUISIANA's Commercial API (REST/JSON, 18 calls/min) returns full Officers[] with titles and trade-name ApplicantName for ~$500/yr — far cheaper than per-lookup vendors; KY's bulk layout confirms LLC members/managers are in "All Officers".
4. Datacenter blocks OBSERVED today: GA eCorp (Cloudflare), IA sos.iowa.gov (Cloudflare), KS sos.ks.gov (CloudFront 403), HI hbe.ehawaii.gov (403), ilsos.gov (connection dropped), GA verify.sos.ga.gov (403). NOT blocked: KY FastTrack, LA coraweb (reCAPTCHA), ME ICRS (reCAPTCHA), ID SOSbiz.
