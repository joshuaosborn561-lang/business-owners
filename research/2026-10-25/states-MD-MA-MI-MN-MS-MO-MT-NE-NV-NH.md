# Group 3 research: MD, MA, MI, MN, MS, MO, MT, NE, NV, NH
Researched 2026-10-25 from a cloud/datacenter IP (160.79.106.x). Every "VERIFIED" item below means I fetched the official page/file today and saw the claim; "OBSERVED" means I hit the URL from this datacenter IP and saw the block page myself; "UNVERIFIED" means search-snippet or third-party only. Web-search budget ran out mid-task (200/turn cap shared across agents), so the last third of the work was done by direct fetches of official URLs only; items I could not reach are flagged.

Raw files kept in `/tmp/claude-0/-home-user-business-owners/537c7fe3-4ab0-5972-af4d-98ecbab033ec/scratchpad/research/dl/` (MN bulk guide + order form, MT bulk spec, NSCB list form, MN DLI full licensee CSV, NE liquor roster xlsx).

---

## Minnesota (MN)

**TL;DR**
- Best free source: MN DLI full licensee export (free zip, 260k rows, business + personal licenses with phone/email) + SOS portal record (CEO/Manager fields exist in the DB).
- Bulk file: YES, official. $710 one-time (commercial), FREE for non-commercial/research users; monthly snapshot, CSV zip (>2.5 GB uncompressed).
- Officers in bulk: YES. Party-name types include President, Manager, Chief Executive Officer, Registered Agent, Organizer, Incorporator, Applicant (assumed-name filer).
- DBA names owner: YES at state level (assumed names are filed with SOS; "Applicant"/nameholder party in bulk).
- Estimated attainable rate: 70-80% once bulk is loaded (highest-value buy in this group).

**A. Entity registry.** Search: https://mblsportal.sos.mn.gov/Business/Search (note: old host mblsportal.sos.state.mn.us 302-redirects to sos.mn.gov; VERIFIED). Reachable from datacenter IP: YES (HTTP 200, HTML form, VERIFIED). Form fields: BusinessName, FileNumber, IncludePriorNames, Status, Type + anti-forgery token (VERIFIED); my curl POST returned 200 but no result rows, so the HTML adapter needs the exact post body from a browser session (likely needs the `RequiredValue` field). Free record content: the SOS bulk layout proves the SOS DB stores party names of type President, Manager, Chief Executive Officer, Registered Agent, Organizer, Incorporator (VERIFIED in official Implementation Guide); that these display on the free detail page is UNVERIFIED today (no detail page fetched), but consistent with the playbook's existing adapter.

**B. Bulk data (VERIFIED, official).**
- Page: https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/
- Full "MBLS Business Services Bulk Data" (all business types, active + inactive): **$710** one-time per order (commercial form https://www.sos.mn.gov/media/5124/bulkrequestcorp_commercialusers.pdf, VERIFIED). Non-commercial users (media, researchers, non-commercial use) get it at **no charge** via https://www.sos.mn.gov/media/5123/bulkrequestcorp_non-paying.pdf (VERIFIED on page text). License agreement required: https://www.sos.mn.gov/media/5125/business-bulk-la.pdf.
- Cadence: "Data is purchased as a one-time set of records. The file is created at the beginning of each month." Delivered within 10 days via MBLS portal transaction history, CSV in zip, "may be over 2.5 GB" (VERIFIED, Implementation Guide https://www.sos.mn.gov/media/d3skshdo/business-bulk-order-implementation-guide-and-record-layout.pdf).
- Layout (VERIFIED): 3 record types keyed by Master ID: 01 Business Master (name, type, filing date, status, home jurisdiction...), 02 Filing History, 03 Business Name & Address (Name Type Number + Party Name + address). **Party Name Type Codes: 1 Applicant, 2 Markholder, 4 Registered Agent, 7 Organizer, 8 Incorporator, 11 Filing Contact, 12 President, 13 Manager, 14 Chief Executive Officer, 19 Individual Contact for Agent.** Address types include Chief Executive Office Address, Principal Executive Office Address. Sample row shows Party Name "Adam Smith", Name Type 4.
- Cheaper partial: "Active Business Data" = business name + primary address only, $30 one-time or $30/week ongoing (VERIFIED). Business Snapshot (voluntary survey) $100.
- Restriction: commercial users must sign the Business Bulk License Agreement; the LA text I grepped does not forbid marketing use but bars reselling access for a fee ("...from charging its customers a fee for access to the Records" context) — read the LA before buying.
- Open-data portal: none for SOS entities.

**C. DBA / assumed names.** State-level, filed with SOS (Assumed Name is a business type in the same registry and in the bulk file; VERIFIED). The bulk "Applicant" party (code 1) is the nameholder = owner for sole props (inference from layout; name-type semantics not spelled out). County filing not required.

**D. License boards (VERIFIED, free, excellent).** MN Dept. of Labor & Industry publishes a nightly full export: https://secure.doli.state.mn.us/ccld/data/MNDLILicRegCertExport.zip (11 MB zip, file LIC_SNAP_10_24_2026.csv, 259,829 rows). Columns: Bus_Pers, License_Type, License_Subtype, Name, DBA_Name, Addr1, Addr2, City, St, Zip, Phone_No, Email_Address, Lic_Number, Status, Orig_Date, Exp_Date, Enforcement_Action, Renewal_in_Progress. Counts: Business/Residential Contractors 21,795; Business/Electrical 6,163; Business/Plumbing 3,537; Business/Mechanical Contractor Bond 5,373; Personal/Residential Contractors 37,584 (qualifying builders as individuals); Personal/Electrical 103,853; Personal/Plumbing 33,474. No explicit qualifier-to-business link column, but personal and business rows share address/phone, so a phone/address join yields the qualifying person for most contractor businesses. Also per-type CSVs (boiler, building officials). Lookup UI: https://ims.dli.mn.gov/. Cosmetology (Board of Cosmetologist Examiners), real estate (Commerce), dealers (DVS): no bulk file found (not searched after budget cap; UNVERIFIED).

**E. Liquor.** MN AGED (Dept. of Public Safety) licensing is municipal-issued with state buyer's cards; no statewide open file found (UNVERIFIED; not reached).

**F. General business license / revenue.** None statewide. Minneapolis/St. Paul business license open data not checked (budget).

**G. Other.** Workers' comp coverage lookup at DLI (not bulk). UCC bulk from SOS is $9,600 initial (VERIFIED on page, not useful).

**H. Recommendation.** (1) Load DLI export now (free, nightly) and join on phone/address; (2) buy the SOS bulk file ($710, or free if you qualify as non-commercial) and load record type 03 with codes 12/13/14/7/8/1; (3) live HTML adapter against mblsportal for freshness. Realistic rate 70-80% for Maps SMBs. Build effort: bulk load (medium; 2.5 GB CSV) + simple join.

---

## Montana (MT)

**TL;DR**
- Best free source: none free in bulk; the SOS "Principal Search" and business search are behind a JS security check.
- Bulk file: YES, official. "Corporate Bulk Data $0.02/record" on the SOS fee sheet; CSV extract from SIMS.
- Officers in bulk: YES. PRINCIPAL rows (directors/officers/shareholders/managers/incorporators) for corps; Manager/Member rows for LLCs; OWNER rows for assumed business names.
- DBA names owner: YES, state-level ABN with OWNER record in bulk.
- Estimated attainable rate: 75%+ with bulk; ~30% today via web only.

**A. Entity registry.** https://biz.sosmt.gov/search/business. From this datacenter IP: "Security Verification Required ... Enable JavaScript and cookies ... You are not using a VPN or proxy" (OBSERVED JS/bot challenge, HTTP 200 interstitial). Principal Search (search by person name) exists at https://biz.sosmt.gov/forms/new/1363 (VERIFIED link on https://sosmt.gov/business-services/). Free record content not fetched today (UNVERIFIED), but the DB stores principals (see B).

**B. Bulk data (VERIFIED).**
- Order form: "Corporate Download" https://biz.sosmt.gov/forms/new/1354 (behind the same JS check).
- Price: fee sheet https://sosmt.gov/business/fees/ lists **"Corporate Bulk Data $0.02/record"**, plus "New Business Entity Reports $80.00", "New Business Entity Report Subscriptions $80.00/month", "Business Alert / Watchlist $50.00/year" (VERIFIED). No cadence stated; the spec says the extract interface lets the user select records, so a full pull is a one-off (Montana has roughly 200k+ active entities -> on the order of $4-6k for everything; estimate, not an official figure; a filtered pull by status/type is cheaper).
- Layout: https://sosmt.gov/wp-content/uploads/BulkDownloadSpecs.pdf ("Montana Corporate Records Data File Technical Specification", rev. 2017-04-26, VERIFIED). Comma-delimited, entity rows (BE-CORP, BE-LLC, LP, LLP, ABN, FBN, TM, B) followed by child rows keyed by entity number: AGENT (registered agent name + addresses), **PRINCIPAL** ("Directors/Officers/Shareholders/Managers/Employees/Incorporators (list by role, name)" with Name, Position e.g. Vice President, address, related entity id; LLC: "Managers/Members - Role active only ... Member/Manager Name ... Position 'Manager Member'"; LP: General and Limited Partners; LLP: Partners), RELATED_ABN, SHARES. **ABN: OWNER record type with Owner Name, Owner Type, Owner Address.**
- Open data: none on data.mt.gov for SOS entities (not checked after budget cap; UNVERIFIED).

**C. DBA.** State-level Assumed Business Name registered with SOS, linked to owning entity or individual owner; in bulk as ABN + OWNER rows (VERIFIED in spec).

**D. Licenses.** MT Dept. of Labor & Industry (DLI) Business Standards Division license lookup (ebiz.mt.gov) covers construction contractor registration, electricians, plumbers, cosmetology, real estate; bulk availability UNVERIFIED (not reached).

**E. Liquor.** MT Dept. of Revenue liquor licensing; licensee list downloads UNVERIFIED.

**F/G.** No general state business license. Contractor Registration (DLI) requires owner names on the application; lookup only (UNVERIFIED).

**H. Recommendation.** Buy the SOS bulk extract ($0.02/record; request active entities only + ABNs) -> load PRINCIPAL/OWNER rows. This single purchase should move MT from ~30% to 75%+. Build effort: bulk load, custom multi-record CSV parser. Live scraping needs a residential proxy/headless browser.

---

## Nevada (NV)

**TL;DR**
- Best free source: SilverFlume/esos entity page shows officers/managers from the annual list (UNVERIFIED today, third-party doc + playbook), but the whole nv.gov SOS estate is behind Incapsula from datacenter IPs (OBSERVED).
- Bulk file: YES (official "Bulk Data Download" service). Price: $125 full corporations DB dump; custom report $25 + $0.0005/record capped at $125; $500/month unlimited subscription. Seen only on the UAT mirror snippet (nvsosuat.nv.gov) -> UNVERIFIED on production (production pricing page is Incapsula-blocked from here).
- Officers in bulk: UNVERIFIED (the service builds "customized reports from certain databases" of "public data recorded from those documents"; officer tables are part of the corporations DB, but no field list was retrievable).
- DBA names owner: county-level (county clerks' fictitious firm name), owner named; no state file.
- Estimated attainable rate: 70%+ (officers are public); 100% on the tiny 4-row sample.

**A. Entity registry.** https://esos.nv.gov/EntitySearch/OnlineEntitySearch -> 302 to https://orion.nv.gov/portal/public/ (new portal) -> Incapsula 212-byte challenge page (OBSERVED, HTTP 200 but `_Incapsula_Resource` shell). nvsilverflume.gov also redirects to orion.nv.gov. Free record: per Topograph US-NV doc, "Nevada publishes the full officer roster on the free public entity page ... officers, directors, and managers from the latest annual or amended list" (UNVERIFIED, third-party).

**B. Bulk data.** Official page https://www.nvsos.gov/sos/sos-information/public-records-requests states bulk data download service exists for Corporations, UCC, NevVoter, Notaries, "raw data ... no document images", fee-based, account required at https://www.nvsos.gov/SOSWebAccountManager/Login.aspx (search-snippet of official page; the page itself rendered empty to me -> UNVERIFIED by fetch). Pricing guide https://www.nvsos.gov/SOSServices/AnonymousAccess/PricingGuide.aspx is Incapsula-blocked from here (OBSERVED). UAT mirror snippet: "full corporations or UCC database dump Primary Charge $125.00; customized report $25 + $0.0005/record capped at $125; unlimited monthly subscription $500 (all data types, schedule reports); start by phone 775-684-5708." Treat as UNVERIFIED until someone opens the page from a residential IP. Field list / officer inclusion: UNVERIFIED.

**C. DBA.** County clerk fictitious firm name (Clark County Clerk FFN search, Washoe County Clerk). Owner is named on the FFN. Clark County bulk: UNVERIFIED (not reached).

**D. Contractors (VERIFIED).** NSCB "Contractor List Request" form (https://www.nvcontractorsboard.com/wp-content/uploads/2023/06/Contractor-List-Request.pdf, rev 12/2021): active-license list FREE at https://app.nvcontractorsboard.com/Clients/nvscb/Public/ContractorListing/ListingSearch.aspx (filters: county, classification; no export button visible); paid specialty lists $100 (<=500 records) / $200 (>500), Excel or PDF. **Fields: Business Name, License Number, Status, Expiration, Classification/Limitation, Monetary Limit, Mailing Address, Phone — no qualifier/officer names.** The individual license detail page on the NSCB site does show qualified individuals/officers (UNVERIFIED today).

**E. Liquor.** County/city-issued; no state file.

**F. State business license.** Issued by SOS inside SilverFlume (same blocked portal); the entity record includes the business license status; sole-proprietor state business licenses are searchable there by owner name (UNVERIFIED today). Henderson NV has a "Business License" ArcGIS dataset (owner HendersonNV_GIS, VERIFIED in ArcGIS Hub listing; fields not checked). Las Vegas open data host was refused by the proxy.

**G.** Nothing else verified.

**H. Recommendation.** (1) Spend $125 (or one month at $500 to pull every table) on the SOS bulk download and inspect whether officer/manager rows are included — if yes this is the cheapest bulk officer file in the group; (2) until then, Serper/`site:` + Apify residential for the orion.nv.gov page; (3) NSCB detail pages for contractors. Realistic 70%+.

---

## Nebraska (NE)

**TL;DR**
- Best free source: nebraska.gov Corporate & Business Search is reachable from datacenter IPs (VERIFIED HTTP 200); NLCC liquor roster xlsx with Manager Name (VERIFIED).
- Bulk file: YES by statute. Neb. Rev. Stat. 33-101: entire business-entity DB (no images) $300/week, $800/month, $1,000/month for twice-monthly; batch access $15 per 1,000 entities; image DB $800/month (VERIFIED on nebraskalegislature.gov).
- Officers in bulk: UNVERIFIED (statute says "entire contents of the database regarding business entities"; NE records officers/members via biennial reports, so likely present but no layout found).
- DBA names owner: state-level trade name registration with SOS (applicant = owner); UNVERIFIED by fetch.
- Estimated attainable rate: 70-78% (measured 78% on 9 rows via web).

**A. Entity registry.** https://www.nebraska.gov/sos/corp/corpsearch.cgi?nav=search — HTTP 200 from datacenter IP (VERIFIED), classic CGI form (POST: search=1, search_type=start_with_search|keyword_search|name_search|exact_search|num_search, corpname, acct-num) but results require JavaScript/session state (my POST returned the search page). Banner: SOS "transitioning to a new business entity search and filing system ... live before the end of the 2026 calendar year" (VERIFIED) — expect the adapter to break. Free record content (officers/members from biennial reports): per playbook; UNVERIFIED today. Nebraska.gov subscriber account: $100/year for up to 10 users, includes "Corporate Searches and Document Images" (VERIFIED https://nebraska.gov/apps-subscriber-form/).

**B. Bulk data (statute VERIFIED, product page not found).** 33-101(3): "(a) For batch requests of business entity information, fifteen dollars for up to one thousand business entities accessed and an additional fifteen dollars for each additional one thousand...; (c) For the entire contents of the database regarding business entities, but excluding electronic images, three hundred dollars weekly subscription rate, one thousand dollars monthly subscription rate for a twice-monthly service, and eight hundred dollars monthly subscription rate; (d) images ... forty-five cents per page; (e) entire image database $800 monthly." Order channel: Nebraska.gov (NIC) special-request searches https://nebraska.gov/SpecialRequestSearches/index.cgi (snippet; UNVERIFIED). Field layout and officer inclusion: UNVERIFIED. LB835 (2025) may have revised fees: UNVERIFIED.

**C. DBA.** Trade names registered with SOS, searchable in the same corpsearch (VERIFIED: page says searches cover "entities, trade names, trademarks, and service marks"). Owner shown on trade-name record: UNVERIFIED.

**D. Contractors.** NE Dept. of Labor Contractor Registration search https://dol.nebraska.gov/conreg/Search (VERIFIED reachable): filters DBA, corporation name, city, zip, phone, registration #, county, NAICS; output fields/owner names not visible without a query (UNVERIFIED). Annual fee rises to $40 on 2026-08-01 (VERIFIED banner). No bulk file found.

**E. Liquor (VERIFIED, free).** NLCC Active License Roster xlsx: https://lcc.nebraska.gov/sites/default/files/doc/Active%20License%20Roster%201023.xlsx (1.4 MB; columns: Troop Area, License Type Group, Class, Secondary type, License Number, Trade Name, Address, City, County, Phone Number, **Manager Name, Licensee (legal entity)**, Corporate Address, dates). Also "Expired Licenses Spring 2026 - Did Not Renew" xlsx and a Weekly Activity Report page. ~40k shared strings -> several thousand licenses.

**F/G.** No general business license. Nebraska.gov subscriber "Sales Tax Permits Listing" is a basic subscriber service ($100/yr) (VERIFIED on subscriber page) — could name sole proprietors; fields UNVERIFIED.

**H. Recommendation.** (1) Keep live HTML (works from datacenter) but budget for the 2026 system replacement; (2) load NLCC roster (free) for bars/restaurants; (3) if volume justifies, one month of the $800 full DB (or $15/1000 batch) after confirming the layout includes principals; (4) $100/yr nebraska.gov subscription gives document images + sales-tax permit list. Realistic 70-78%.

---

## Maryland (MD)

**TL;DR**
- Best free source: SDAT Business Express entity search is reachable from datacenter IPs (VERIFIED 200) but shows only resident agent + principal office for LLCs/corps; TRADE NAME records show the owner (VERIFIED on SDAT services page).
- Bulk file: YES but via contractor SpecPrint, Inc. ("Corporate Master File", monthly with weekly subscription; price not published, selection reports $0.04/record, $40 min) (VERIFIED).
- Officers in bulk: NO officers listed in the described file (principal office, resident agent, amendments; trade names: filer name/address).
- DBA names owner: YES, state-level trade names at SDAT name the owner.
- Estimated attainable rate: 50-60% (registry is agent-only; rely on trade names + LinkedIn/web).

**A. Entity registry.** https://egov.maryland.gov/BusinessExpress/EntitySearch (VERIFIED reachable, JS app). Free record: resident agent, principal office, status, filings (annual report/personal property return PDFs are viewable; officers appear only inside the Annual Report PDF for corporations' "officers/directors" section if filled) — PDF content UNVERIFIED today. JSON/XHR: the Business Express SPA calls backend endpoints (UNVERIFIED).

**B. Bulk data (VERIFIED https://dat.maryland.gov/Pages/Services.aspx).** "Corporate File" covers corporations active since 1982, LPs, LLCs, LLPs, trade names; "Trade name records include the filer's name and address, the initial filing date, and amendment dates. Other entities include principal office, resident agent and address, and the date and type of amendments." Corporate Master File created monthly, weekly subscription available; sold through contractor **SpecPrint, Inc.** (Stefanie Kokkinakos, 410-561-9600, 7 Aylesbury Rd Suite G, Timonium MD 21093); selection reports $0.04/account, $40 minimum; full-file price not published. No officers. opendata.maryland.gov: catalog query for "SDAT" returns only real-property assessment datasets and the aggregate "Number of businesses in the State" (ftgf-3uby) — **no entity-level SDAT dataset** (VERIFIED via catalog API).

**C. DBA.** State-level trade names at SDAT (part of Business Express search); owner (filer) named (VERIFIED in services-page description; individual record not fetched).

**D. Licenses.** MHIC public query https://www.dllr.state.md.us/cgi-bin/ElectronicLicensing/OP_Search/OP_search.cgi?calling_app=HIC::HIC_qselect (VERIFIED reachable, updated 2026-05-28): search by contractor personal name, trade name, location, salesperson, license #; the MHIC license is issued to a person with a trade name -> owner name is on the record. No bulk download found; MD Labor sells licensee lists on request (UNVERIFIED). opendata.maryland.gov "license" query returned no MD contractor/MHIC dataset (VERIFIED absence; the hits were other states'/cities' datasets federated in the search).

**E. Liquor.** County liquor boards (Baltimore City, Montgomery, Prince George's, Baltimore County, Anne Arundel). dataMontgomery has "New Liquor Licenses" (dymb-xy5c: Licensee, DBAName, address, type) (VERIFIED in catalog). Baltimore City catalog call failed.

**F.** No state general business license (county/city trader's licenses via Clerk of Court; not bulk).

**G.** SDAT real-property owner names are open (useful for owner-occupied business parcels, not primary).

**H. Recommendation.** (1) Trade-name lookup in Business Express for Maps names that look like DBAs; (2) MHIC query for contractors; (3) LinkedIn/web for the rest; (4) if bulk needed, call SpecPrint for the Corporate Master File price (trade-name filer names only). Realistic 50-60%. Do not expect officers from MD.

---

## Massachusetts (MA)

**TL;DR**
- Best free source: Corporations Division record (officers/directors/managers from annual reports) — but corp.sec.state.ma.us AND www.sec.state.ma.us are Incapsula-protected (OBSERVED today), and mass.gov returns 403 from this IP (OBSERVED).
- Bulk file: NO official product found. The only bulk MA list is the DOR "Corporations Book" (names for tax-status, no officers) at mass.gov/service-details/the-corporations-book (UNVERIFIED by fetch; 403).
- Officers in bulk: N/A.
- DBA names owner: city/town clerk level (business certificates), owner named; no state file.
- Estimated attainable rate: 55-65% (29% measured; blocked registry is the bottleneck).

**A. Entity registry.** https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx -> 212-byte `_Incapsula_Resource` challenge shell, HTTP 200 (OBSERVED). Same for https://www.sec.state.ma.us/divisions/corporations/corporations.htm (212 bytes, OBSERVED). Free record (per prior playbook + Topograph MA doc): officers (President/Treasurer/Secretary/Directors) and LLC managers/authorized persons from annual reports; members of member-managed LLCs not shown (UNVERIFIED today). The playbook's note that Apify residential still got challenge pages suggests a headless browser with cookies is needed.

**B. Bulk data.** Nothing official found; the Division fee schedule (https://www.sec.state.ma.us/divisions/corporations/download/Fee_Schedule.pdf) has no data-file item per snippets (UNVERIFIED, could not fetch). DOR Corporations Book data files (annual list of corporations subject to MA tax, name/ID only) — UNVERIFIED (mass.gov 403). Mark MA bulk as **none**.

**C. DBA.** Business certificates filed with each city/town clerk (Boston: https://www.boston.gov/departments/city-clerk/how-file-business-certificate — not fetched). No state registry, no bulk.

**D. Licenses.** HIC registration lookup moved to https://contractorhub.mass.gov/ (VERIFIED by the 503 redirect notice at services.oca.state.ma.us/hic/licenseelist.aspx; new host failed TLS from my proxy). CSL (construction supervisor) lookup via DOL/OPSI eLicensing (madpl.mylicense.com) — not fetched. DOL sells licensee lists by board (UNVERIFIED). ABCC licensee lists: UNVERIFIED (mass.gov 403; the ABCC historically posts statewide license lists by town — confirm at https://www.mass.gov/orgs/alcoholic-beverages-control-commission from a residential IP).

**E. Liquor.** ABCC (see D); local licensing boards also publish lists. UNVERIFIED.

**F.** No state business license. Boston Analyze/Open data: not checked (budget).

**G.** Nothing verified.

**H. Recommendation.** (1) Solve the Incapsula problem once (real browser + residential egress; cache by entity) — this is the only path to officers; (2) HIC/CSL via contractorhub for contractors (owner is typically the registrant); (3) web/LinkedIn fallback. Realistic 55-65%. Nothing worth buying from the state; consider a paid API for MA only (OpenCorporates covers MA officers).

---

## Michigan (MI)

**TL;DR**
- Best free source: MiBusiness Registry (new June 2025 portal) — corporations show officers/directors from the last annual report; LLCs show resident agent only. Portal is Cloudflare JS-challenged from datacenter IPs (OBSERVED 403).
- Bulk file: NONE found. LARA pages list only FOIA ("Submit a Request for Information (FOIA)"); no bulk corporate data product (VERIFIED absence on the Corporations Division page; FOIA page itself 403 to WebFetch).
- Officers in bulk: N/A.
- DBA names owner: county clerk assumed names (co-partnership/DBA certificates), owner named; no state file.
- Estimated attainable rate: 70-80% (measured 90% on 10 rows via web; registry adds little for LLCs).

**A. Entity registry.** New portal https://mibusinessregistry.lara.state.mi.us/ ("As of June 23, 2025, the new MiBusiness Registry Portal is live", VERIFIED on https://www.michigan.gov/lara/bureau-list/cscl/corps). From datacenter IP: Cloudflare "Verifying you are a human" 403 (OBSERVED). Old cofs.lara.state.mi.us: TLS handshake failure (dead). Free record: officers (President, Secretary, Treasurer, Directors) from most recent annual report for corporations only; LLC/LP/LLP publish no members/managers; resident agent shown; annual-report certified copies paid (Topograph US-MI doc; UNVERIFIED by my own fetch). Document images (annual statements) were viewable free on the old system; on the new portal UNVERIFIED.

**B. Bulk data.** None offered; LARA route is FOIA (per LARA site navigation, VERIFIED; fee schedule UNVERIFIED). Topograph: "LARA publishes no corporate data extract" (third-party, consistent).

**C. DBA.** County clerk assumed-name certificates (Wayne, Oakland, Macomb, Kent, Washtenaw). Oakland County has an online assumed-name search; others vary; no bulk (UNVERIFIED, not fetched).

**D. Licenses.** LARA license verification runs on Accela: https://aca-prod.accela.com/MILARA/ (VERIFIED reachable, HTTP 200; ASP.NET WebForms, 10 results/page). Covers residential builders (BCC), electricians, plumbers, cosmetology, real estate, etc. Qualifying officer appears on builder-license records (UNVERIFIED). Bulk: FOIA request only; several Apify actors scrape it (300k+ records). Health facility list is the only published dataset.

**E. Liquor.** MLCC license lookup/records via LARA; licensee list only by FOIA (UNVERIFIED).

**F.** No state business license; Detroit open-data business license dataset not retrievable (proxy).

**G.** Nothing verified.

**H. Recommendation.** MI already measures high via web; keep LinkedIn/web primary. Registry via residential proxy for corporations only. Consider a one-time FOIA to LARA for the business-entity database and BCC builder list with qualifying officers (fee unknown). Realistic 70-80%.

---

## Missouri (MO)

**TL;DR**
- Best free source: data.mo.gov alcohol license datasets with associated person (MGR/OWN/PART) names (VERIFIED); fictitious-name registrations list owners.
- Bulk file: NONE found for business entities (UCC bulk exists by agreement). SOS site had no data-sales page; bsd.sos.mo.gov is Cloudflare-challenged from datacenter IPs (OBSERVED).
- Officers in bulk: N/A.
- DBA names owner: YES, state-level fictitious name registration (owner grid), searchable in bsd.sos.mo.gov.
- Estimated attainable rate: 70-78% (measured 78% via web).

**A. Entity registry.** https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx -> Cloudflare "Just a moment..." 403 (OBSERVED). Free record: registered agent, status, filing history with document images; LLCs show organizer (articles) not members; corporations' annual registration reports (images) list officers/directors; fictitious names show "Owner"/"Registered Owner" rows (Topograph US-MO; playbook; UNVERIFIED today).

**B. Bulk data.** No official business-entity bulk product found on sos.mo.gov (page fetch timed out once; links grep showed no data-services link). 15 CSR 30-90.075 covers UCC bulk by written agreement only. data.mo.gov has no SOS entity dataset (VERIFIED by catalog query: only payroll/financial/notaries).

**C. DBA (fictitious names).** State-level with SOS, 5-year term, searchable in bsd.sos.mo.gov; registration lists owner names/addresses (UNVERIFIED by fetch today; sos.mo.gov/business/corporations/fictitious returned "page not found").

**D. Licenses.** MO Division of Professional Registration licensee search (pr.mo.gov) and downloadable licensee lists (the Division historically sells/gives CSV "licensee lists" per board) — UNVERIFIED (budget). No state contractor license (local).

**E. Liquor (VERIFIED, free, excellent).** data.mo.gov:
- `yyhn-562y` "Missouri Active Alcohol License Data" (36,966 rows, updated 2026-10-23): LICENSEE, DBANAME, address, PHONE NUMBER, PRIMARY/SECONDARY LICENSE + TYPE, COUNTY, **Assoc, Name, Phone** — associated-person rows: MGR 23,396; CONV 13,267; OWN 225; PART 78. Sample: "SCHAFER-REICHART SELECTIONS, INC." -> assoc MGR "NERMIN KURTESI".
- `d9fr-pncw` primary-license filter view; `nytw-fmz3` out-of-business; `mtgj-bnbx`/`ezr3-ufzz` renewal lists with First Name/Last Name; `hbmv-rqk9` County Clerk license info with First/Last Name, Manager Phone.
SODA API: https://data.mo.gov/resource/yyhn-562y.json

**F.** No state business license; Kansas City (data.kcmo.org) catalog showed "Business Licenses" datasets from other cities only in federated results — KC's own not confirmed. St. Louis not checked.

**G.** Nothing else verified.

**H. Recommendation.** (1) Load data.mo.gov alcohol data (free SODA) — gives managing officer for every bar/restaurant/liquor retailer; (2) fictitious-name lookup via residential proxy for DBA-looking names; (3) web/LinkedIn. Realistic 70-78%. Nothing to buy.

---

## Mississippi (MS)

**TL;DR**
- Best free source: SOS Business Search (officers/members on annual reports) — corp.sos.ms.gov is Cloudflare-blocked from datacenter IPs (OBSERVED 403).
- Bulk file: NONE published; the corp.sos.ms.gov "Business Reports" tool allegedly exports search results to Excel (UNVERIFIED, blocked).
- Officers in bulk: N/A.
- DBA names owner: state-level fictitious business name registration (since 2016) — owner named (UNVERIFIED by fetch).
- Estimated attainable rate: 60-70% (56% measured).

**A.** https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3 -> Cloudflare "Sorry, you have been blocked" 403 (OBSERVED). www.sos.ms.gov itself loads (200). Free record (playbook): officers/members/managers from annual reports; UNVERIFIED today.

**B.** No bulk product on sos.ms.gov business-services pages (order-documents page: certificates/copies only, VERIFIED via WebFetch). Public Records Request route exists. Third-party claim of $50/hr data pulls: UNVERIFIED.

**C.** Fictitious business name registration with SOS (same portal). Owner named: UNVERIFIED.

**D.** MS State Board of Contractors search http://search.msboc.us/ (VERIFIED reachable; JS search, detail shows qualifying party per site nav "Qualifying Party"); lists only via Public Records Request form (https://www.msboc.us/public-information/, VERIFIED). MS Board of Cosmetology, Real Estate Commission: not checked.

**E.** MS DOR ABC permits: page moved (404); UNVERIFIED.

**F/G.** No state business license; sales-tax permits not public.

**H.** Residential-proxy scrape of SOS (officers are there) + web. Realistic 60-70%. Nothing to buy.

---

## New Hampshire (NH)

**TL;DR**
- Best free source: QuickStart record (principals: officers/managers/members + RA) — but quickstart.sos.nh.gov, sos.nh.gov, nh.gov and oplc.nh.gov all return Akamai "Access Denied" 403 from this datacenter IP (OBSERVED on 4 hosts).
- Bulk file: UNVERIFIED/none found (no official page reachable; no search hit for an NH bulk product).
- Officers in bulk: N/A.
- DBA names owner: state-level trade names with SOS (QuickStart) — owner named (UNVERIFIED today).
- Estimated attainable rate: 65-75% once the registry is reachable (0/1 measured).

**A.** https://quickstart.sos.nh.gov/online/BusinessInquire -> Akamai 403 (OBSERVED). Free record per playbook: principals with titles, RA, annual report filings; UNVERIFIED today.
**B.** No evidence of a bulk product; sos.nh.gov pages unreachable (403). Mark NONE/UNVERIFIED.
**C.** Trade names registered with SOS, in QuickStart; owner named (UNVERIFIED).
**D.** OPLC license lookup (https://www.oplc.nh.gov/license-lookup, 403 from here); NH has no general contractor license; electricians/plumbers via OPLC. Bulk: UNVERIFIED.
**E.** NH Liquor Commission Division of Enforcement licensee lists (nh.gov/liquor, 403 from here): UNVERIFIED.
**F/G.** No state business license.
**H.** Needs residential egress for every NH state host; then QuickStart principals should deliver 65-75%. Nothing to buy; re-check for a bulk product from a residential IP.

---

## Cross-state table

| State | Registry shows officers free? | Bulk file (free/$/none, officers y/n) | DBA names owner (state/county) | Best license-board bulk | Est. rate | Buy? |
|---|---|---|---|---|---|---|
| MD | No (RA + office only; trade names show filer) | $ via SpecPrint contractor, price unpublished, officers N (VERIFIED) | State (SDAT trade names) Y | MHIC query only (no bulk) | 50-60% | No |
| MA | Yes (officers/managers) but Incapsula-blocked | None found (DOR Corporations Book = names only) | Town clerk | HIC/CSL lookup (contractorhub), no bulk verified | 55-65% | Maybe OpenCorporates for MA |
| MI | Corps yes (annual report), LLCs no; Cloudflare-blocked | None (FOIA only) | County clerk | LARA Accela lookup; FOIA for lists | 70-80% | No |
| MN | CEO/Manager/President recorded (portal reachable) | **$710 one-time / free non-commercial, monthly CSV, officers Y (VERIFIED)** | State (assumed name, Applicant party) Y | **MN DLI nightly full CSV, free, 260k rows (VERIFIED)** | 70-80% | Yes, $710 |
| MS | Yes (annual reports) but Cloudflare-blocked | None | State (fictitious name) Y? | MSBOC search; lists via records request | 60-70% | No |
| MO | Corps via AR images; LLC organizer only; Cloudflare-blocked | None for entities | State (fictitious name, owner grid) Y | **data.mo.gov alcohol licenses w/ MGR/OWN names, free (VERIFIED)** | 70-78% | No |
| MT | Principals recorded; JS-challenge | **$0.02/record, CSV, officers/managers/members + ABN owners Y (VERIFIED)** | State (ABN w/ OWNER rows) Y | DLI lookup only | 75%+ w/ bulk | Yes, ~$4-6k est. full or filtered |
| NE | Yes (biennial reports); reachable from DC IP | $300/wk, $800/mo, $15/1000 batch (statute VERIFIED), officers ? | State (trade names) Y? | **NLCC roster xlsx w/ Manager Name, free (VERIFIED)** | 70-78% | Maybe one month $800 after layout check |
| NV | Yes (officers/managers from annual list); Incapsula-blocked | $125 full dump / $500 mo unlimited (UAT snippet, UNVERIFIED), officers ? | County clerk FFN | NSCB free listing + $100/$200 lists, no qualifier (VERIFIED) | 70%+ | Yes, $125 test pull |
| NH | Yes (principals); Akamai-blocked | None found (UNVERIFIED) | State (trade names) Y? | OPLC lookup (blocked), no bulk | 65-75% | No |

## Top surprises
1. Minnesota's $710 bulk file (free for non-commercial use) explicitly carries President / Manager / Chief Executive Officer / Organizer / Incorporator party names, and MN DLI gives away a nightly 260k-row licensee CSV with phone + email — MN should go from 44% to 75%+ for about $710.
2. Montana sells its whole SIMS database at $0.02/record with PRINCIPAL rows (officers, directors, LLC managers/members) and OWNER rows for assumed business names — a complete owner file for a state that currently measures 30%.
3. Datacenter blocking is far wider than the brief's list: today I observed bot walls at MA (Incapsula, both hosts), NV (Incapsula on orion.nv.gov/nvsos.gov), MI (Cloudflare, new MiBusiness Registry), MO (Cloudflare), MS (Cloudflare), MT (JS check), NH (Akamai on every state host), plus mass.gov 403. Only MD, MN, NE registries answered plainly. Missouri's data.mo.gov alcohol dataset (36,966 licenses with 23k manager names) is a free consolation prize nobody had listed.
