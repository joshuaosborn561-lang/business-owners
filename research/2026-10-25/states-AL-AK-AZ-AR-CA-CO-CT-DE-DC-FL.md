# Group 1 findings: AL, AK, AZ, AR, CA, CO, CT, DE, DC, FL
Researched 2026-10-25 from a cloud (datacenter) container. VERIFIED = I fetched the official page / dataset metadata / file myself today. UNVERIFIED = search snippet, third-party page, or page I could not load. "403 from our IP" below means the official host returned 403 (or reset) to curl/WebFetch from this datacenter container today; that is an observation, not proof of a deliberate datacenter block (it could be a WAF rule on our UA/ASN).

Note: the WebSearch budget for this run was exhausted after ~25 searches, so the second half of the work (AL, AR, DE, DC, AZ ROC, county FBN portals) relied on direct fetches of official URLs only. Gaps are marked.

---

## FLORIDA (FL)

**TL;DR**
- Best free source: Sunbiz quarterly `cordata.zip` (6 officer slots per entity, RA) + `ficdata.zip` (10 owner slots per fictitious name). VERIFIED layouts today.
- Bulk file: YES, FREE, public SFTP `sftp.floridados.gov` user `Public` / password `<published on the FL DOS data-downloads page>` (published on the official page). VERIFIED page; could not actually connect from this container (SFTP port timed out, https://sftp.floridados.gov returned 403) — UNVERIFIED that the credentials still work from here.
- Officers in bulk: YES (title, person/corp flag, name, address for up to 6; flag for >6). VERIFIED in cor.html layout.
- DBA names owner: YES, state-level, in ficdata (Owner Name + Name Format P/C, up to 10). VERIFIED.
- Estimated attainable rate: 70%+ for FL (registry + fictitious + DBPR CSVs, all bulk). Buy: nothing.

**A. Entity registry.** Search: https://search.sunbiz.org/Inquiry/CorporationSearch/ByName (not re-fetched today; the brief says it 403s from datacenter IPs — UNVERIFIED by me this run; irrelevant because the bulk file carries the same officer data). Free record shows officers/directors (corp), managers/authorized persons (LLC, stored in the same "officer" slots with titles like MGR/AMBR), RA, principal + mailing address; annual report images are free PDFs on the detail page (UNVERIFIED today, long-standing behavior).

**B. Bulk data.** VERIFIED pages:
- Overview https://dos.fl.gov/sunbiz/other-services/data-downloads/ : "free data downloads", host `https://sftp.floridados.gov`, Username `Public`, Password `<published on the FL DOS data-downloads page>`, browser or SFTP client.
- Quarterly https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/ : Jan/Apr/Jul/Oct; files `doc/quarterly/cor/cordata.zip` + `corevent.zip`, `doc/quarterly/fic/ficdata.zip` + `ficevt.zip`, `gen/genfile.zip`, `trademarks/TMData.zip`, federal liens `flr/*`. Layouts: https://dos.sunbiz.org/data-definitions/cor.html (1440-char fixed record; fields incl. Corporation Number, Name, Status, Filing Type, principal + mail address, File Date, FEI, "More than Six Officers" flag, Last Transaction Date, 3 report-year slots, RA Name/Type/Address, **6 × {Officer Title, Officer Type P/C, Name, Address, City, State, Zip}**). Fictitious layout https://dos.sunbiz.org/data-definitions/fic.html (2098-char record: Document Number, Fictitious Name, County, address, Filing/Expiration dates, Status, Number of Owners, FEI, **10 × {Owner Doc#, Owner Name (55 ch, single field), Name Format P/C, Address, City, State, Zip, Country, FEI, Charter Number}**).
- Daily https://dos.fl.gov/sunbiz/other-services/data-downloads/daily-data/ : workdays only, `doc/cor/yyyymmddc.txt`, `doc/cor/events/yyyymmddce.txt`, `doc/fic/yyyymmddf.txt` etc. **Annual reports and address changes are NOT included in daily files** (so officer changes only refresh quarterly).
- Data usage guide https://dos.fl.gov/sunbiz/other-services/data-downloads/data-usage-guide/ : fixed-length, no header row, quarterly cor file ≥1 GB, "data as-is", no commercial-use restriction stated. The DOS site copyright page (https://dos.fl.gov/copyright/) has generic "personal, non-commercial use" language for site materials; it does not name the Division of Corporations data. Risk: low/unclear; public records under Fla. Stat. ch. 119.
- Open-data portal: none needed.

**C. DBA.** State-level fictitious-name registry (Division of Corporations), in bulk (above). Names owner (P = person). VERIFIED.

**D. License boards.** DBPR publishes free CSV extracts per board, no login (VERIFIED pages + file headers):
- Construction (CILB): https://www2.myfloridalicense.com/construction-industry/public-records/ → licensee file `https://www2.myfloridalicense.com/sto/file_download/extracts//CONSTRUCTIONLICENSE_1.csv` (fetched first 1.5 KB: rows are `Board, Occupation, "LAST, FIRST M" (Licensee Name = the individual qualifier), DBA Name, Class, Addr1-3, City, State, Zip, County, License#, Primary/Secondary status, dates, Alternate Lic#`). Also applicants file `constr_app.csv`, electrical contractors board has its own page.
- Cosmetology: `.../sto/file_download/extracts/COSMETOLOGYLICENSE_1.csv` (same layout). Veterinary `lic26vt.csv`. Index of 35 boards with "Instant Public Records" pages: https://www2.myfloridalicense.com/instant-public-records/ (Barbers, Real Estate, Electrical, Home Inspectors, Restaurants/Lodging, Mobile Homes, Yacht & Ship, CPA, Engineers, Vet, etc.). Real estate / appraisal pages say files refresh weekly (UNVERIFIED cadence on other boards; pages show no date).
- Caveat: licensee file = individual license holder + "Doing Business as Name"; for a corporate contractor the qualifier's name is the person, the DBA is the company. Good owner proxy for small contractors.

**E. Alcohol.** DBPR AB&T extracts (VERIFIED): https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/public-records/ → `bd400lic.csv` (all AB&T licensees), `bd4006lic.csv` (retail alcoholic beverage), `bdTOBlic.csv` (tobacco retail), `bd400revok.csv` etc. Layout (VERIFIED at .../public-records-layout-information/): Board, Profession, **Owner/Primary Name**, Series/Rank, Class Modifier, mailing addr, **Business or DBA Name**, location addr, License Number, status codes, dates. Daily refresh per https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/daily-license-status-reporting-data/ ("updated every morning"). Sample rows show Owner/Primary Name is often the entity name, not a person.

**F. General license / city data.** None statewide beyond DBPR. (Local business tax receipts are county-level; not researched this run.)

**G. Other.** Sunbiz general partnerships file (`genfile.zip`) names partners; federal lien debtor file. UCC debtors not in the free download set.

**H. Recommendation.** 1) Sunbiz quarterly cor + fic (already a Supabase RPC) — keep; re-load each quarter; 2) DBPR CILB/electrical/cosmetology/vet/real-estate CSVs matched on DBA name + address for the qualifier's name; 3) AB&T file for bars/restaurants/liquor stores (owner name only sometimes a person); 4) LinkedIn/web fallback. Expected 70%+. Buy nothing. Build: bulk load (fixed-width parsers already exist).

---

## CALIFORNIA (CA)

**TL;DR**
- Best free source: CSLB statewide **Personnel** file (license#, person names, titles, classifications) + License Master (business name, address, phone) — FREE, VERIFIED page; download itself was WAF-rejected from this container. For non-contractors: bizfile Statement of Information (officers/managers) live, plus SF/LA county open data.
- Bulk registry file: NO public price page found. bizfile "Business Entities Records" page lists copies ($5 certified) only; no data-sales product found on sos.ca.gov today (several URLs 404). UNVERIFIED whether SOS still sells a data file — call (916) 653-6814.
- Officers in bulk: n/a (no bulk). Free search shows officer/director/member/manager names (VERIFIED on SOS "Information Requests" page description).
- DBA names owner: YES, county-level. LA County publishes an open ArcGIS feature service with `RegisteredOwnerName` (277,756 rows, Feb 2024→). VERIFIED. SF city business registry has `ownership_name` (VERIFIED). Riverside: free daily xlsx of new FBN filings (VERIFIED). OC/SD/SB: search portals only (partly UNVERIFIED).
- Estimated rate: 65–75% (contractors ~90% via CSLB; others via SI + county FBN + SF/LA data). Buy: CSLB "Business Principal File" $235 only if the free personnel download cannot be obtained (it should be free).

**A. Entity registry.** https://bizfileonline.sos.ca.gov/search/business . Official description (VERIFIED, https://www.sos.ca.gov/business-programs/business-entities/information-requests): business search shows entity name/number/status, formation date, FTB/SOS/VCFCF standing, addresses, **agent name/address, Statement of Information due date, "Officer, director, member, and manager names and addresses"**, and filed documents (Statements of Information) are free to view/print (VERIFIED on https://www.sos.ca.gov/business-programs/business-entities/forms/business-records: "Viewing and printing copies of entity records… Free"; certified copy $5, Certificate of Status $5). JSON endpoints exist behind the SPA (`/api/Records/businesssearch` POST, `/api/report/GetImageByNum/...` for PDFs — search results surfaced many GetImageByNum URLs). Bot protection: fetching `/api/Records/businesssearch` returned an empty body from here; the brief's "Incapsula" claim is UNVERIFIED this run (I saw no challenge text). The existing Apify (dz_omar) path stays the practical route.

**B. Bulk data.** No official bulk-data product page located. Tried: /business-entities/business-entities-data (404), /data-sales (404), /information-requests/records-requests-fees (404), forms page (no bulk item). The Information Requests page lists only (916) 653-6814. Treat "bizfile data sales price" as UNKNOWN/UNVERIFIED. Open-data portals (data.ca.gov) carry no entity file (not re-checked this run).

**C. DBA / FBN (county-level).**
- Los Angeles County: online search https://apps.lavote.gov/#/onlinesearch (Apr 2011→, name-only); **open data** https://data.lacounty.gov/pages/lavote-fbn → ArcGIS FeatureServer `https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/Fictitious_Business_Name/FeatureServer/0` fields: FilingNumber, FiledTS, FilingType, BusinessType, BusinessName, BusinessAddress(+Additional), City, State, Zip, **RegisteredOwnerName**; count 277,756; coverage Feb 2024→ (VERIFIED). Queryable/exportable free.
- Orange County: https://cr.occlerkrecorder.gov/FBNInternet/FBNSearch/Default.aspx (VERIFIED link on ocrecorder.com; whether owner shown online UNVERIFIED; no bulk mentioned).
- Riverside County: search https://webselfservice.rivcoacr.org/Web/action/ACTIONGROUP2805S1 ; **FBN Subscription** https://www.rivcoacr.org/fbn-subscription = free downloadable xlsx of new FBN filings since 1/1/2024, updated daily M–F, plus daily email (VERIFIED; owner column UNVERIFIED but FBN statements list registrants).
- San Diego County: sdarcc.gov FBN pages timed out twice (UNVERIFIED).
- San Bernardino County: arc.sbcounty.gov/fictitious-business-names/ returned 404 (URL changed; UNVERIFIED).

**D. License boards.**
- **CSLB** (VERIFIED page https://www.cslb.ca.gov/onlineservices/dataportal/ContractorList): three free statewide files — License Master; Workers' Comp; **Personnel** ("license number, personnel names, titles, classification(s), and bond information"; disassociated personnel excluded; emails withheld under B&P §27). Excel or CSV, "There is no charge". Mechanism: ASP.NET dropdown `ctl00$MainContent$ddlStatus` values M/W/P; my POST from this container got an F5 "Request Rejected" page (WAF) — download from a residential/office IP or via Apify. Paid alternative (VERIFIED PDF https://www.cslb.ca.gov/Resources/FormsAndApplications/FULL_FILE_-_UPDATE_FILE_ORDER_FORM.pdf, Rev 09/2021): Full File or monthly Update File **$235 per file**, fixed-block text; License Master (700 ch) has business name, mailing address, phone, classes, bonds but **no personnel**; **Business Principal File (2610 ch) has personnel**; license master layout L7800020 (VERIFIED PDF). Data Services Unit 916-255-3975.
- DCA (cosmetology, auto repair/BAR, etc.): https://www.dca.ca.gov/data is aggregate statistics only (search snippet; UNVERIFIED). DCA license lookup search.dca.ca.gov is per-record (not fetched).

**E. Alcohol.** CA ABC daily export (VERIFIED, downloaded today): https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip (7.4 MB, 129,748 rows, refreshed each business day 07:00 PT). Header: License Type, File Number, Lic or App, Type Status, Type Orig Iss Date, Expir Date, Fee Codes, Dup Counts, Master Ind, Term, Geo Code, District, **Primary Name**, Prem Addr 1/2, Prem City/State/Zip, **DBA Name**, Mail Addr 1/2, Mail City/State/Zip, Prem County, Prem Census Tract. Primary Name = licensee (person for sole props, otherwise entity). No officer fields. Fixed-width layout page: https://www.abc.ca.gov/weekly-data-export-fixed-width-layout-definition/ (VERIFIED, 26 fields).

**F. City business registrations.**
- San Francisco: data.sfgov.org `g8m3-pdis` "Registered Business Locations" — fields include **ownership_name**, dba_name, full_business_address, NAICS, dates (VERIFIED metadata). SODA queryable.
- Los Angeles City: data.lacity.org `6rrh-rzua` "Listing of Active Businesses" (823,265 rows, monthly) — business_name, dba_name, address, NAICS; **no owner field** (VERIFIED). Useful only for DBA→legal-name resolution.

**G. Other.** CSLB personnel titles (RMO/RME/Owner/Partner/Officer) make it the single best owner source for CA contractors. ABC Primary Name for bars/restaurants.

**H. Recommendation.** 1) CSLB Personnel + License Master (free; obtain from a non-datacenter IP; refresh monthly) → covers construction trades; 2) LA County FBN feature service + SF registered-business ownership_name + Riverside daily FBN xlsx (free, API); 3) bizfile SI PDF via existing Apify path for LLC/corp officers (~$0.01–0.03/row); 4) ABC file for alcohol licensees; 5) LinkedIn fallback. Expected 65–75%. Buy: nothing unless CSLB free download is unobtainable (then $235 Business Principal File). Build: bulk load CSLB + ABC; ArcGIS/SODA queries for LA/SF; live Apify for SI.

---

## ARIZONA (AZ)

**TL;DR**
- Best free source: ACC business search (Arizona Business Center, formerly eCorp) — principals (members/managers/officers/directors) + statutory agent + document images shown free (UNVERIFIED this run: azcc.gov search hosts returned 403/connection reset to this container; FAQ VERIFIED says names/addresses on filed documents are public and "Most documents filed … are publicly available online under the business's Document History").
- Bulk file: YES, PAID — **Full database extraction $1,000; partial extraction $75** (one-time, CD-ROM or email, quote-delimited CSV). VERIFIED (form M027 + 2023 fee schedule + FAQ).
- Officers in bulk: YES — "officer and director names and addresses" are listed as AVAILABLE INFORMATION (plus statutory agent, addresses, dates, status, type). LLC member/manager names not explicitly listed on the form (UNVERIFIED whether included; ask). Must declare COMMERCIAL purpose under A.R.S. §39-121.03; ACC may deny.
- DBA names owner: YES at state level (SOS trade names show holder name) but no bulk product verified (azsos.gov returned a JS challenge).
- Estimated rate: 70%+ with the $1,000 extraction; ~55–65% live-only. Buy: the ACC full extraction ($1,000) if AZ volume justifies it.

**A. Entity registry.** Search URL per ACC: https://arizonabusinesscenter.azcc.gov (public records page; older https://ecorp.azcc.gov/EntitySearch/Index). Both returned connection reset/empty to this container (observed; cause UNVERIFIED). Free record (per prior adapter + FAQ): statutory agent, principals, document history incl. annual reports. JSON behind SPA (existing azCenter adapter).

**B. Bulk.** VERIFIED PDF https://www.azcc.gov/docs/default-source/corps-files/forms/m027-database-extraction-request... : "double-quote delimited, comma-separated ASCII"; available: business name/address, incorporation date, approval date, statutory agent name/address, **officer and director names and addresses**, name change/merger info, status, domicile, business type; unavailable: SIC, phone, EIN, email. Fees: $75 partial / $1,000 entire database; checks only; mail to Records Section, 1300 W Washington Rm 101, Phoenix. FAQ (VERIFIED https://azcc.gov/faqs/BusinessServicesFAQs): request can be submitted online through the filing system. Fee schedule (VERIFIED PDF rev 2023): "Database Extraction – Partial $75 / Full $1,000". Public-records page says labor $25/hr may be added (search snippet). No open-data portal dataset.

**C. DBA.** Arizona trade names are registered with the Secretary of State (optional registration, 5-year term). Search https://apps.azsos.gov/apps/tntp/se.aspx (403 to this container). SOS "Database Purchasing" page https://azsos.gov/services/database-purchasing exists (returned JS challenge; contents UNVERIFIED — likely sells trade name/trademark DB). Registration is optional in AZ, so coverage of sole props is partial.

**D. License boards.** AZ Registrar of Contractors: search https://azroc.my.site.com/AZRoc/s/contractor-search (Salesforce; loads 200 from here but JS-rendered); records show qualifying party and personnel (UNVERIFIED this run); https://roc.az.gov/public-records-request-forms (403 from here) — no free bulk file found; third-party Apify scrapers exist (~$3/1k). Other boards (cosmetology, real estate ADRE) not reached this run.

**E. Alcohol.** AZ DLLC — not researched this run (search budget). UNVERIFIED.

**F. City licenses.** Phoenix/Tucson business license open data: Tucson has an ArcGIS "Business Licenses (Open Data)" layer (seen in hub search, fields UNVERIFIED). Not researched further.

**G. Other.** AZ Department of Revenue TPT license list is not public in bulk (UNVERIFIED).

**H. Recommendation.** 1) Keep live ACC JSON adapter (principals free) via residential/Apify if blocked; 2) buy ACC full extraction ($1,000 one-time; confirm LLC members included and commercial-use acceptance before paying) and load in Supabase; 3) ROC search for contractors (live); 4) LinkedIn fallback. Expected 70%. Build: bulk load after purchase; live until then.

---

## COLORADO (CO)

**TL;DR**
- Best free source: data.colorado.gov SODA — `4ykn-tg5h` Business Entities (RA person/org name + principal/mailing address; **no officer field** — VERIFIED column list) + `u7sb-g482` Trade Names (**registrant firstname/lastname or registrantorganization** — VERIFIED) + `7s5z-vewr` DORA licenses (person + entityname) + `ier5-5ms2` liquor (licensee_name + DBA).
- Bulk file: FREE complete dataset on the open-data portal (VERIFIED on SOS fee page: "Complete business dataset (entities, trademarks, trade names): Free"); paid feeds $975 (3×/yr), $3,000 monthly, $12,000 weekly.
- Officers in bulk: NO. CO periodic reports do not collect officer names; registry is RA-only.
- DBA names owner: YES (state trade-name dataset, individual registrant first/last).
- Estimated rate: 55–65% (RA-promotion + trade names + DORA + LinkedIn). Buy: nothing.

**A. Registry.** https://www.coloradosos.gov/biz/BusinessEntityCriteriaExt.do (VERIFIED page loads; detail content not fetched). Detail shows RA, principal office, filing history with free document images (periodic reports contain no officer names). No bot block observed.

**B. Bulk.** VERIFIED: `https://data.colorado.gov/api/views/4ykn-tg5h.json` columns: entityid, entityname, principal address (6), mailing address (6), entitystatus, jurisdictonofformation, entitytype, **agentfirstname, agentmiddlename, agentlastname, agentsuffix, agentorganizationname**, agent principal/mailing address, entityformdate (updated 2026-10-24). SOS fee page https://www.coloradosos.gov/pubs/info_center/fees/business.html (VERIFIED): complete dataset free via open data; "Business organizations data" 3×/yr $975, monthly $3,000, weekly $12,000; weekly reporting service $200/FY. Related: `h7dk-6tj8` Trade names added after 2/15; `8upq-58vz` UCC Debtor Information (lastname/firstname/organizationname + address — VERIFIED columns; useful for owner-as-co-debtor); `p2ts-5ef2` Colorado Springs newly registered LLCs.

**C. DBA.** `u7sb-g482` Trade Names for Businesses in Colorado (VERIFIED columns: mastertradenameid, tradenamedescription, tradenameform, effectivedate, **firstname, middlename, lastname, suffix, registrantorganization**, address, mailing address, dateadded, entitystatus, entityformdate, entityid). State-level, ~400k rows (third-party count). Individual registrant = owner.

**D. Licenses.** DORA `7s5z-vewr` Professional and Occupational Licenses (139,740 rows; lastname, firstname, **entityname**, city, licensetype, subcategory, licensenumber, status… — VERIFIED). `4zse-6bnw` Licensed Real Estate Professionals (18,857; same shape). DORA lookup site also offers "Licensee/Discipline List Downloads" (snippet; UNVERIFIED) and points mass users to CIM (data.colorado.gov). Colorado has no state contractor license (municipal) — Denver `s9wt-dsfz` Active Business Licenses Denver has entity_name/trade_name only (no owner; VERIFIED).

**E. Alcohol.** `ier5-5ms2` Liquor Licenses in Colorado (8,522; licensee_name, doing_business_as, license_number, type, expiration, address — VERIFIED). Licensee is usually an entity.

**F. City.** Denver s9wt-dsfz (no owner). Tobacco licenses `ejz2-rwds`, STR licenses `f3vc-vat3` (fields not checked).

**G. Other.** UCC debtor dataset (above) — individual co-debtors with organization name on the same filing can reveal the owner (needs join on fileid). Child care facilities `a9rr-k8mu`.

**H. Recommendation.** 1) SODA 4ykn (RA person at business address/surname match) → 2) u7sb trade names (registrant person) → 3) 7s5z DORA entityname match → 4) UCC debtor co-debtor join → 5) LinkedIn. Expected ~60%. Buy nothing. Build: open-data query (already live) + optional bulk load of trade names and UCC.

---

## CONNECTICUT (CT)

**TL;DR**
- Best free source: data.ct.gov Principals `ka36-64k6` — VERIFIED today: business_id, name__c, **firstname, middlename, lastname, suffix, designation, type**, business + residence addresses, create_dt (rows updated 2026-10-24). Join to Business Master `n7gp-d28j` (id, name, status, addresses, NAICS, email!).
- Bulk file: FREE — SOS form (VERIFIED PDF, 2023): "Business Entity Database – Free. We no longer charge… posted on data.ct.gov as five data sets" (previous $3,000/yr fee gone).
- Officers in bulk: YES (principals = officers/directors/members/managers).
- DBA names owner: NO state registry — CT trade names are filed with the **town clerk** (169 towns), no central file.
- Estimated rate: 70%+. Buy nothing.

**A. Registry.** https://service.ct.gov/business/s/onlinebusinesssearch (business.ct.gov; not re-fetched). Free record shows principals with titles, agent, addresses, filing images. No bot block known.

**B. Bulk.** VERIFIED catalog: `n7gp-d28j` Business Master (69k views; includes business_email_address, naics_code, annual_report_due_date, status, addresses), `ka36-64k6` Principals, `qh2m-n44y` Agents, `ah3s-bes7` Filing History, `enwv-52we` Name Change History, `45em-mg2m` All Active CT Businesses. Updated daily/monthly. Bulk form: https://business.ct.gov/-/media/businessonestop/brs-forms/bulk-data-subscription---form.pdf (UCC images $1,000/yr; UCC active lien data free; business entity database free). No commercial-use restriction stated.

**C. DBA.** Town-clerk trade name certificates (CGS §35-1); no state search or bulk. Largest towns (Bridgeport, Stamford, New Haven, Hartford, Waterbury) — land-records vendors sometimes index trade names; not researched (search budget). UNVERIFIED.

**D. Licenses.** eLicense roster generator https://www.elicense.ct.gov/lookup/GenerateRoster.aspx (VERIFIED page: ~35+ categories incl. Home Improvement Contractors, Barber/Hairdresser, Real Estate, Funeral, Liquor, Food, Healthcare, Child Care; no login stated; formats chosen on download screen). Open data: `ngch-56tr` State Licenses and Credentials (85,815 rows, daily: credentialid, **name, businessname, dba**, credentialtype, status, address — VERIFIED). Real estate broker filter `fwpc-pgqj`.

**E. Alcohol.** `gwv2-eswx` Liquor Permits — **dba, backer (owner entity), permittee first/last name**, addresses, status (VERIFIED columns). Liquor rosters also in eLicense.

**F. City.** None needed.

**G. Other.** Business Master includes `business_email_address` (useful downstream). Principals include residence address (owner-home signal).

**H. Recommendation.** 1) SODA principals join (live, already built) — raise match rate with name-prefix + city; 2) ngch-56tr licenses (person name + businessname/dba) for trades and salons; 3) liquor permittee; 4) LinkedIn. Expected 70%+. Build: bulk-load the five CT datasets (small) for fuzzy matching instead of per-query SODA.

---

## ALASKA (AK)

**TL;DR**
- Best free source: DCCED business-license database download — official FAQ says the download "includes… the owner's name, the mailing and physical address" (search snippet quoting commerce.alaska.gov; page returned 403 to this container → UNVERIFIED by fetch). Mirror VERIFIED: ArcGIS `https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2` with fields **Owners**, LicenseNumber, BusinessName, Status, dates, physical/mailing address, CommunityName — 83,488 rows (AK-located licenses only; sample Owners values are mostly entity names).
- Bulk file: FREE CSV downloads of corporations, business licenses, and professional licenses per the Division ("full downloads… in .CSV format" — snippet UNVERIFIED by fetch; all commerce.alaska.gov URLs 403 from here).
- Officers in bulk: corporations CSV reportedly includes officials (UNVERIFIED). Entity records online show officials from biennial reports (UNVERIFIED this run).
- DBA names owner: business license "Owners" field = the licensee (person for sole props; otherwise the entity, so chain to the corporations file).
- Estimated rate: 65–75% once the two CSVs are joined. Buy nothing.

**A. Registry.** https://www.commerce.alaska.gov/cbp/main/search/entities (403 from this container, both curl and WebFetch — observed). Free record: officials (president, members/managers) from biennial report, RA, addresses (long-standing; UNVERIFIED today).

**B. Bulk.** Division page https://www.commerce.alaska.gov/cbp/main/ lists "Database Downloads → Business License Download" and the corporations/professional downloads (snippets; 403 to fetch). Must be pulled from a non-datacenter IP. ArcGIS mirror (VERIFIED, public, queryable, exportable) is a usable fallback for business licenses but not for corporation officials.

**C. DBA.** Alaska has no separate DBA registry; the business license is the de-facto trade-name record (Owners + BusinessName).

**D. Licenses.** Professional license download (contractors are registered via DCCED "Construction Contractor" registrations; included in professional licensing DB — UNVERIFIED fields).

**E. Alcohol.** AMCO licensee list (not researched).

**F.** Business license = statewide general license (above).

**G.** Municipality of Anchorage has no separate owner dataset found.

**H. Recommendation.** 1) Download AK business-license CSV + corporations CSV from an office/residential IP; load; match Maps name+address → Owners → if entity, join corporations officials; 2) ArcGIS layer as interim (Owners field); 3) LinkedIn. Expected ~70%. Build: bulk load.

---

## DELAWARE (DE)

**TL;DR**
- Best free source: none in the registry. Free search (VERIFIED https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx) shows only entity name, file number, formation date, **registered agent** name/address/phone; "additional information can be obtained for a fee" (status/certified copies). Officers are not on public DE records at all (annual report officer/director data is not in the free search; copies are paid).
- Bulk file: no public product page found (corp.delaware.gov/subscription 404; fee page lists no bulk item — VERIFIED fee page has no data product). UNVERIFIED whether a subscriber data feed exists; treat as none.
- Officers in bulk: NO.
- DBA names owner: Delaware trade names are filed with the **Prothonotary (Superior Court) per county**, not SOS. Open data `i7m4-42sn` "Trade, Business & Fictitious Names" on data.delaware.gov exists (1,267 rows; fields trade_name__c, affiant_name__c, affiant_title__c, owner_company__c, firstname__c, lastname__c, address — VERIFIED columns) but it is a One Stop activity log, small.
- Estimated rate: 45–55% (licenses + LinkedIn). Buy: nothing from DE.

**A. Registry.** As above. Detail pages for status cost ~$10–20 (brief's claim; page confirms fees exist but does not list amounts — UNVERIFIED amounts).

**B. Bulk.** None found. data.delaware.gov `5zy2-grhr` Delaware Business Licenses (551k rows: business_name, trade_name, category, valid dates, address, license_number — **no owner field**, VERIFIED) is the Division of Revenue general business license list — good for DBA↔legal-name and address matching.

**C. DBA.** County Prothonotary (New Castle, Kent, Sussex) — no online search found this run (UNVERIFIED). `i7m4-42sn` partial.

**D. Licenses.** data.delaware.gov `pjnv-eaih` Professional and Occupational Licensing (43k rows: last_name, first_name, license_no, profession_id, license_type, city, status — VERIFIED; individuals only, no business name). Includes cosmetology, plumbing/HVAC, electricians, real estate, etc. Match individual licensee by city + surname in business name only.

**E. Alcohol.** DE OABCC license list — not researched.

**F.** Business license dataset (above, no owner).

**G.** Child care providers `iuzd-3dbt`; on-site wastewater licensees `56uc-mvju`.

**H. Recommendation.** 1) `5zy2-grhr` to resolve trade name→legal name/address; 2) `pjnv-eaih` licensee match for trades/salons/real estate; 3) LinkedIn/website (primary); 4) RA-person rule from ICIS when agent is an individual at the business address. Expected ~50%. Buy nothing (Cobalt pass-through for DE is $15–20 and still RA-only).

---

## DISTRICT OF COLUMBIA (DC)

**TL;DR**
- Best free source: **Basic Business License open data** — ArcGIS `https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0` (VERIFIED 40 fields incl. **BUSINESSOWNERFIRSTNAME / MIDDLENAME / LASTNAME**, AGENTFIRST/LAST/ENTITY, ENTITYNAME, ENTITYTRADENAME, ENTITYTYPE, PREMISEADDRESS, LICENSESTATUS, BUSINESSACTIVITY, DATAREFRESHEDON). Count/sample queries timed out from here; DLCP announced a schema change effective 2026-05-14 (fields removed — snippet, UNVERIFIED which).
- Bulk file: FREE (open data, CC-BY). Registry (CorpOnline → now **BOSS** https://boss.dc.gov, VERIFIED redirect; JS app) has no bulk product found.
- Officers in bulk: BBL owner name yes; corporate governors only in CorpOnline/BOSS (account required historically — UNVERIFIED today).
- DBA names owner: DC trade names are registered with DLCP Corporations Division (state-level); appear in BOSS; ENTITYTRADENAME in BBL.
- Estimated rate: 60–70% via BBL owner fields. Buy nothing.

**A. Registry.** https://boss.dc.gov (replaces corponline.dlcp.dc.gov; VERIFIED 301). Public record shows governors/officers from biennial reports (prior playbook; UNVERIFIED today — page is JS "Processing, please wait"). Login requirement UNVERIFIED.

**B. Bulk.** BBL dataset on opendata.dc.gov ("Basic Business License", ArcGIS item 85bf98d3915f412c8a4de706f2d13513 per snippet). No entity-registry bulk.

**C. DBA.** Trade name registration via DLCP (BOSS). No separate open file verified.

**D. Licenses.** DLCP occupational/professional licensing (contractors are BBL "General Contractor/Construction Manager" category; owner name present). Also FEEDS/DCRA MapServer sub-layers by category (Barbershops, Night Club, Cigarette Retailer, etc. — VERIFIED layer list).

**E. Alcohol.** ABCA licensee list — not researched this run.

**F.** BBL = general license with owner name (above). Highest-value DC source.

**G.** Clean Hands / tax registrations not public.

**H. Recommendation.** 1) Query BBL FeatureServer by ENTITYTRADENAME/ENTITYNAME + PREMISEADDRESS → owner name (free; verify post-May-2026 schema still has BUSINESSOWNER* fields); 2) BOSS governors (live, possibly account) ; 3) LinkedIn. Expected 60–70%. Build: ArcGIS query adapter (small) or periodic CSV pull.

---

## ALABAMA (AL)

**TL;DR**
- Best free source: SOS Business Entity Records https://arc-sos.state.al.us/CGI/CORPNAME.MBR/INPUT (VERIFIED page loads from here; filings current through 10/20/2026; search by Entity Name / ID / **Officer | Agent | Incorporator**). Detail page (VERIFIED one record) shows principal address, RA name/address, formation and qualification dates, nature of business, and — for domestic entities — incorporators/organizers and officers where filed. Annual reports were eliminated effective 10/1/2024 (VERIFIED: "no longer required by law to file an annual report"), so officer data will go stale.
- Bulk file: NO official bulk product found (Business Downloads page = forms only, VERIFIED). UNVERIFIED whether a data list is sold on request — call 334-242-5324.
- Officers in bulk: n/a.
- DBA names owner: Alabama trade names are **optional** state registrations (SOS "Trademarks/Trade names") — not researched this run; county probate DBA filings are not online in bulk. UNVERIFIED.
- Estimated rate: 50–60% (registry + LinkedIn). Buy: consider Cobalt per-lookup only if AL volume is high.

**A.** As above; no bot block observed (200 to curl). No JSON endpoint; HTML CGI. The "Officer | Agent | Incorporator" reverse search exists.
**B.** None. No state open-data portal with entity data.
**C.** UNVERIFIED (search budget).
**D.** AL Licensing Board for General Contractors roster (genco.alabama.gov DNS failed from here); HVAC/plumbing (Board of Heating, AC & Refrigeration), cosmetology — not researched. UNVERIFIED.
**E.** ABC Board licensee list — not researched.
**F/G.** Alabama Department of Revenue business license (county-issued) not online in bulk.
**H.** 1) arc-sos live HTML (officers/organizers for domestic LLC/corp formation filings) ; 2) LinkedIn/website; 3) consider paid lookups. Expected ~55%. Build: live HTML adapter (exists).

---

## ARKANSAS (AR)

**TL;DR**
- Best free source: SOS corporation search https://sos-corp-search.ark.org/ (VERIFIED page; search by name/fictitious name/RA; detail shows RA, incorporator/organizer, and **officers from franchise tax reports** per state snippet — detail UNVERIFIED this run). LLC member information is confidential (Act 865 of 2007 — snippet, UNVERIFIED).
- Bulk file: YES, PAID via Tyler Arkansas (INA) subscriber account — **$150/yr** (up to 10 extra users $300) gives access to "Bulk Download" of business entity data in CSV/XML, selectable by entity type/status/RA (VERIFIED https://portal.arkansas.gov/tyler-arkansas-subscriber-account/ and /service/ar-corp-bulk-data-download/). Per-download charges, cadence and field list are NOT published (UNVERIFIED whether officers are included; older SOS doc says lists include name, address, RA).
- Officers in bulk: UNVERIFIED (likely no).
- DBA names owner: AR fictitious names for entities are filed with SOS (searchable, no owner beyond the entity); sole-prop DBAs are filed with the county clerk (not online in bulk). 
- Estimated rate: 50–60%. Buy: the $150 Tyler subscription is cheap — worth buying to test whether officers are in the bulk CSV.

**A.** As above; no bot block observed (302→200).
**B.** Tyler Arkansas subscriber account $150/yr; "Welcome Bulk Data Subscribers" page is behind login. Contact BCS 501-682-3409 / INA for field layout.
**C.** County clerk (Pulaski, Benton, Washington) — not researched. UNVERIFIED.
**D.** Contractors Licensing Board search https://labor.arkansas.gov/licensing/arkansas-contractors-licensing-board/find-a-licensed-contractor/ (page exists; roster/fields UNVERIFIED). Cosmetology, HVACR (Dept of Labor & Licensing) — not researched.
**E.** ABC — not researched.
**F/G.** Franchise tax reports list officers (president, secretary, etc.) and are the officer source behind the SOS detail page.
**H.** 1) live SOS HTML (officers for corps; organizer/RA for LLCs); 2) buy Tyler $150 and test bulk fields; 3) LinkedIn. Expected ~55%. Build: live now; bulk if officers present.

---

## Summary table

| State | Registry shows officers free? | Bulk file (free/$/none, officers y/n) | DBA names owner (state/county) | Best license-board bulk | Est. rate | Buy? |
|---|---|---|---|---|---|---|
| FL | Yes (officers/managers, AR PDFs) | FREE SFTP quarterly+daily; officers Y (6 slots) — VERIFIED layout | Yes, state (ficdata, 10 owners) | DBPR per-board CSVs (CILB, electrical, cosmetology, vet, RE; AB&T) free | 70%+ | No |
| CA | Yes (SI: officers/members/managers) | None found (no public SOS data-sales page; UNVERIFIED) | Yes, county: LA County ArcGIS (RegisteredOwnerName), Riverside daily xlsx; SF registry ownership_name | CSLB Personnel + License Master free (download WAF-blocked from DC IP); paid $235/file | 65–75% | No ($235 CSLB only if needed) |
| AZ | Yes (principals) — UNVERIFIED today (403/reset) | PAID $1,000 full / $75 partial, one-time CSV; officers+directors Y (LLC members unverified) | Yes, state SOS trade names (optional reg.); bulk unverified | None free (ROC search only) | 70% w/ purchase | Yes, $1,000 ACC extraction |
| CO | No (RA only) | FREE SODA 4ykn-tg5h; officers N | Yes, state (u7sb-g482 registrant first/last) | DORA 7s5z-vewr (139k, person+entityname), liquor ier5-5ms2 | 55–65% | No |
| CT | Yes (principals) | FREE data.ct.gov 5 datasets; officers Y (ka36-64k6) | No state registry (town clerks) | ngch-56tr licenses (name+businessname+dba); liquor gwv2-eswx permittee | 70%+ | No |
| AK | Yes (officials) — UNVERIFIED today (403) | FREE CSVs (corp, bus. license, prof.) per Division — UNVERIFIED fetch; ArcGIS mirror w/ Owners VERIFIED | Business license "Owners" (state) | Prof. license CSV (unverified fields) | 65–75% | No |
| DE | No (RA only) | None found | County Prothonotary; tiny i7m4-42sn | pjnv-eaih prof. licenses (43k individuals); 5zy2-grhr business licenses (no owner) | 45–55% | No |
| DC | Governors in BOSS (UNVERIFIED today) | FREE BBL open data; owner first/last Y (verify post-May-2026 schema) | State (DLCP trade names) | BBL covers contractors etc. | 60–70% | No |
| AL | Partly (formation filings; annual reports abolished 2024) | None found | Optional state trade name; county DBA offline | None verified | 50–60% | Maybe per-lookup |
| AR | Yes for corps (franchise tax officers); LLC members confidential | PAID $150/yr Tyler subscription; officers unverified | Entity fictitious names at SOS; sole-prop at county | None verified | 50–60% | Yes, $150 test |
