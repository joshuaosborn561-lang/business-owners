# State playbook: finding small-business owners, all 50 states + DC

> **Superseded Oct 25 2026.** A full re-verification of every state, national dataset and vendor is in `OWNER_PLAN_2026-10.md` with evidence under `research/2026-10-25/`. Where this file and that plan disagree, the plan is right. Known errors here: IL corp officers ARE in the free bulk files; OR authorized representatives are DBA owners, not LLC principals; PA has a free open-data officer file; the datacenter-block list is far longer than shown.

Written Oct 21 2026. One entry per state. Entries marked *verified Oct 21* were spot-checked from the box. Everything else is from the existing adapter catalog (`src/server/lib/stateOwners/sos/catalog.ts`) or public documentation, so re-verify before building an adapter. "Measured" means the 47-company sample (about 2 rows per state), which is far too small to trust per state.

## Fallback chain (every state, in order)
1. DBA → legal name (website footer, Serper `"name" city LLC`, Maps, county fictitious-name snippets).
2. Serper owner search, plus OpenCorporates / Bizapedia snippets (about 5 credits, $0.005).
3. State source below (registry, comptroller, bulk files, license boards).
4. Registered agent who is a person: candidate. Auto-accept when at the business's own address or the surname is in the company name; auto-reject when they are agent or officer for a different business in the same city (FL data only today).
5. Website About page, then LinkedIn via Serper (`site:linkedin.com/in "company" (Owner OR Founder OR President …)`), then a plain "owner" search with the surname-or-two-source rule (about 4 credits).
6. LLC unmask by mailing address (Maps plus a quoted-address search for sister LLCs).

Cost of the free path: Serper about $0.01–0.02 per company (≤ 15 credits). Apify fallback, only on blocked registries: about $0.01–0.03 per company.

## Paid options (recommend only where free stays under 70%; nothing bought)
- **OpenCorporates API**: officers for most states from one API. Paid plans; roughly $0.02–0.10 per lookup at volume (quote needed).
- **Cobalt Intelligence SOS API**: live SOS pulls including officers for all 50 states. About $0.10–0.50 per lookup (quote needed).
- **State paid reports** (NJ, DE, KS annual-report copies): $5–20 per entity. Not worth it for lead gen.

## Summary

| State | Best source | Free | Exposes | Access | Outlook |
|---|---|---|---|---|---|
| AL | [SOS business entity search](https://arc-sos.state.al.us/CGI/CORPNAME.MBR/INPUT) | free | officers for corps, members/organizer for LLCs (formation filings) | Serper site:arc-sos.state.al.us, then direct fetch | likely 70% with fallbacks |
| AK | [Corporations database (CBPL) + data.alaska.gov entity extract](https://www.commerce.alaska.gov/cbp/main/search/entities) | free | officers/members listed on biennial reports | direct fetch; bulk entity CSV | likely 70% |
| AZ | [ACC eCorp entity search (JSON behind SPA)](https://ecorp.azcc.gov/EntitySearch/Index) | free | statutory agent, principals (members/managers/officers) | direct JSON (existing azCenter adapter), Serper site:ecorp.azcc.gov | likely 70% (measured 2/2) |
| AR | [SOS corporation search](https://www.sos.arkansas.gov/corps/search_all.php) | free | RA + incorporator/organizer; officers on franchise-tax reports | direct fetch; Serper site:sos.arkansas.gov | needs fallbacks; borderline |
| CA | [bizfileOnline + Statement of Information PDFs](https://bizfileonline.sos.ca.gov/search/business) | free (Apify ~$0.01-0.03/row for SI fetch) | officers/managers on Statement of Information | Apify dz_omar bizfile + web-fetch (Incapsula blocks direct); CSLB license board for contractors | likely 70% (measured 2/2) |
| CO | [data.colorado.gov Business Entities (4ykn-tg5h)](https://data.colorado.gov/resource/4ykn-tg5h.json) | free open data (verified Oct 21) | registered agent name + principal address; no officers | SODA query by entityname; person-RA promotion (surname / same-address) | borderline; fallbacks carry it (measured 2/2 via LinkedIn/website) |
| CT | [data.ct.gov Business Registry - Principals (ka36-64k6)](https://data.ct.gov/resource/ka36-64k6.json) | free open data (verified Oct 21) | principals (officers/members) with business + residence address | SODA query; join to Business Master by business_id | likely 70%+ |
| DE | [Division of Corporations entity search](https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx) | free search shows RA only; status/detail $10-20 per entity | RA only (commercial agents dominate) | skip registry; LinkedIn/website/Google | needs paid help or fallbacks only; est. <50% from free |
| DC | [DLCP CorpOnline](https://corponline.dlcp.dc.gov/) | free (account required) | governors/officers on biennial reports | Serper site:corponline.dlcp.dc.gov, Apify fallback | borderline |
| FL | [Sunbiz quarterly bulk (cor + fictitious) loaded in Supabase business_owners.fl_*; DBPR licensee extract](https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/) | free | officers/managers (6), RA, fictitious-name owners | Supabase RPC (no HTTP) | likely 70%+ (measured 4/4, shells 11/13) |
| GA | [eCorp business search](https://ecorp.sos.ga.gov/BusinessSearch) | free | officers (CEO/CFO/Secretary) + RA on annual registration | direct HTML (Cloudflare), Serper site:ecorp.sos.ga.gov (snippets lack officers), Apify fallback | borderline for shells (0/4); fine for operating businesses (2/2 via web) |
| HI | [DCCA Business Registration (BREG)](https://hbe.ehawaii.gov/documents/search.html) | free | officers/members/managers | direct fetch; Serper site:hbe.ehawaii.gov | likely 70% |
| ID | [SOS SOSbiz](https://sosbiz.idaho.gov/search/business) | free | RA + governors on annual report (often managers) | direct JSON (SPA); Serper | borderline |
| IL | [DTA bulk LLC/corp files loaded in Supabase business_owners.il_llc*](https://www.ilsos.gov/data/bus-serv-home.html) | free | LLC managers/members; corp names/agents (corp officers not in files) | Supabase RPC | borderline (measured 2/4; trade names miss) |
| IN | [INBiz business search](https://bsd.sos.in.gov/publicbusinesssearch) | free | RA + principals on business entity reports | direct fetch; Serper site:bsd.sos.in.gov | borderline (measured 0-1/2) |
| IA | [SOS business search + data.iowa.gov entity list](https://sos.iowa.gov/search/business/search.aspx) | free | RA + officers on biennial report | direct fetch; open data (RA only) | borderline |
| KS | [SOS business entity search](https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx) | free search; reports $ | RA; officers on annual reports (images) | direct fetch; Serper | needs fallbacks |
| KY | [SOS FastTrack business search](https://web.sos.ky.gov/bussearchnprofile/search.aspx) | free | officers/managers/members + organizer | direct fetch; Serper site:web.sos.ky.gov | likely 70% |
| LA | [geauxBIZ / SOS commercial search](https://coraweb.sos.la.gov/commercialsearch/commercialsearch.aspx) | free search (detail requires captcha), $ for certificates | officers/managers/members | Serper site:coraweb.sos.la.gov; Apify fallback | borderline |
| ME | [Corporations search](https://apps3.web.maine.gov/nei-sos-icrs/ICRS?MainPage=x) | free | RA (clerk); annual report lists officers (paid copies) | direct fetch | needs fallbacks |
| MD | [SDAT Business Entity Search](https://egov.maryland.gov/BusinessExpress/EntitySearch) | free | RA + principal office; no officers | direct fetch; RA promotion | needs fallbacks; est. <60% free |
| MA | [Corporations Division search](https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx) | free | officers/managers/directors + RA | Apify residential fallback only (Incapsula); Serper site: returns nothing | borderline (measured 1/2); Apify ~$0.01-0.02/row would lift it |
| MI | [LARA corporations search](https://cofs.lara.state.mi.us/SearchApi/Search/Search) | free | RA; officers on annual statements (images) | direct fetch | needs fallbacks (measured 2/2 via web) |
| MN | [SOS business search](https://mblsportal.sos.state.mn.us/Business/Search) | free | CEO/manager often listed + RA | direct HTML (existing adapter); Serper | likely 70% |
| MS | [SOS business search](https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx) | free | officers/members on annual reports | direct fetch; Serper | likely 70% |
| MO | [SOS business entity search](https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx) | free | officers (corps), organizer (LLCs), RA | direct fetch; Serper | borderline (LLCs show organizer only) |
| MT | [SOS business search (biz.sosmt.gov)](https://biz.sosmt.gov/search/business) | free | principals/managers + RA | direct JSON (SPA) | likely 70% |
| NE | [SOS corporate search](https://www.nebraska.gov/sos/corp/corpsearch.cgi) | free search; some detail $ | officers/members on reports | direct fetch | borderline |
| NV | [SilverFlume business search](https://esos.nv.gov/EntitySearch/OnlineEntitySearch) | free | officers/managers (initial + annual list) | Serper site:esos.nv.gov; Apify fallback | likely 70% via Serper/OpenCorporates |
| NH | [QuickStart business search](https://quickstart.sos.nh.gov/online/BusinessInquire) | free | principals (officers/managers) + RA | direct fetch | likely 70% |
| NJ | [NJ business records (DORES)](https://www.njportal.com/DOR/BusinessNameSearch) | free name search; reports $5+ | RA only free; officers in paid reports | skip registry; fallbacks | needs paid help; est. paid ~$5/report (not worth it); fallbacks measured 1/2 |
| NM | [SOS business search](https://enterprise.sos.nm.gov/search) | free | officers/directors for corps; organizer/RA for LLCs | direct JSON (SPA) | borderline |
| NY | [data.ny.gov Active Corporations (n9v6-gdp6)](https://data.ny.gov/resource/n9v6-gdp6.json) | free open data (verified Oct 21) | DOS process name/address (often the owner for small LLCs); no officers | SODA query; process-name promotion (surname / same-address rule) | borderline (measured 1/2) |
| NC | [SOS business registration search](https://www.sosnc.gov/online_services/search/by_title/_Business_Registration) | free | officers/managers/company officials + RA | direct HTML (Cloudflare), Serper site:sosnc.gov, Apify fallback | likely 70% (measured 3-4/4) |
| ND | [FirstStop business search](https://firststop.sos.nd.gov/search/business) | free | RA + governors/officers on annual report | direct JSON (SPA) | borderline |
| OH | [SOS business search](https://businesssearch.ohiosos.gov/) | free | RA (statutory agent) + incorporator only | skip registry; RA promotion + fallbacks | needs fallbacks; est. 50-60% (measured 0/2) |
| OK | [SOS business entity search](https://www.sos.ok.gov/corp/corpInquiryFind.aspx) | free search; filings $ | RA; officers rarely | direct fetch | needs fallbacks |
| OR | [data.oregon.gov Active Businesses (tckn-sxa6)](https://data.oregon.gov/resource/tckn-sxa6.json) | free open data (verified Oct 21) | registered agent + authorized representative (person names), principal/mailing addresses | SODA query by business_name | likely 70% (authorized rep is usually the owner) |
| PA | [PA DOS business search (file.dos.pa.gov)](https://file.dos.pa.gov/search/business) | free | officers on some filings; organizer; RA/CROP | Serper site:file.dos.pa.gov; Apify fallback | borderline (measured 2/2 via web) |
| RI | [SOS business search](https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx) | free | officers/managers + RA | direct fetch | likely 70% |
| SC | [SOS business entity search](https://businessfilings.sc.gov/BusinessFiling/Entity/Search) | free | RA only | skip registry; fallbacks | needs fallbacks |
| SD | [SOS SOSenterprise](https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx) | free | RA + officers/managers on annual report | direct fetch | borderline |
| TN | [SOS TNBear business search](https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx) | free | RA; principal office; officers rarely | direct fetch; fallbacks | needs fallbacks (measured 1/2) |
| TX | [Comptroller franchise tax PIR (JSON) + TDLR licenses open data](https://comptroller.texas.gov/data-search/franchise-tax) | free | officers/managers/directors on PIR; RA; mailing address | direct JSON (existing adapter); TDLR SODA | likely 70% (measured 3/4, shells 5/8) |
| UT | [Division of Corporations business search](https://businessregistration.utah.gov/EntitySearch/OnlineEntitySearch) | free | principals (members/managers/officers) + RA | direct fetch; Serper | likely 70% (measured 2/2) |
| VT | [SOS business search](https://bizfilings.vermont.gov/online/BusinessInquire/) | free | principals + RA | direct fetch | likely 70% |
| VA | [SCC Clerk's Information System + free BE data download](https://cis.scc.virginia.gov/DataSales/DownloadBEDataSales) | free (download page reachable Oct 21) | officers/directors (corps), RA; LLC managers limited | bulk download (not loaded per scope change); direct fetch | likely 70% (measured 2/2) |
| WA | [CCFS corporations search + L&I contractor principals open data (4xk5-x9j6)](https://ccfs.sos.wa.gov/) | free | governors (officers/managers) + RA; L&I principals for contractors | direct JSON (existing adapter); data.wa.gov SODA for contractors | borderline (measured 1-2/2) |
| WV | [SOS business organization search](https://apps.sos.wv.gov/business/corporations/) | free | officers/members/managers + RA | direct fetch | likely 70% |
| WI | [DFI corporate records search](https://www.wdfi.org/apps/CorpSearch/Search.aspx) | free | RA only (officers not filed) | skip registry; RA promotion + fallbacks | needs fallbacks (measured 1/1 via web) |
| WY | [SOS business center search](https://wyobiz.wyo.gov/Business/FilingSearch.aspx) | free | RA (commercial agents common) + officers on annual reports | direct fetch; Serper | borderline (heavy commercial-agent use) |

## Machine-readable

```json
[
 {
  "state": "AL",
  "name": "Alabama",
  "source": "SOS business entity search",
  "url": "https://arc-sos.state.al.us/CGI/CORPNAME.MBR/INPUT",
  "cost": "free",
  "exposes": "officers for corps, members/organizer for LLCs (formation filings)",
  "access": "Serper site:arc-sos.state.al.us, then direct fetch",
  "known_blocks": "light",
  "outlook": "likely 70% with fallbacks"
 },
 {
  "state": "AK",
  "name": "Alaska",
  "source": "Corporations database (CBPL) + data.alaska.gov entity extract",
  "url": "https://www.commerce.alaska.gov/cbp/main/search/entities",
  "cost": "free",
  "exposes": "officers/members listed on biennial reports",
  "access": "direct fetch; bulk entity CSV",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "AZ",
  "name": "Arizona",
  "source": "ACC eCorp entity search (JSON behind SPA)",
  "url": "https://ecorp.azcc.gov/EntitySearch/Index",
  "cost": "free",
  "exposes": "statutory agent, principals (members/managers/officers)",
  "access": "direct JSON (existing azCenter adapter), Serper site:ecorp.azcc.gov",
  "known_blocks": "SPA shell; sample 2/2",
  "outlook": "likely 70% (measured 2/2)"
 },
 {
  "state": "AR",
  "name": "Arkansas",
  "source": "SOS corporation search",
  "url": "https://www.sos.arkansas.gov/corps/search_all.php",
  "cost": "free",
  "exposes": "RA + incorporator/organizer; officers on franchise-tax reports",
  "access": "direct fetch; Serper site:sos.arkansas.gov",
  "known_blocks": "none known",
  "outlook": "needs fallbacks; borderline"
 },
 {
  "state": "CA",
  "name": "California",
  "source": "bizfileOnline + Statement of Information PDFs",
  "url": "https://bizfileonline.sos.ca.gov/search/business",
  "cost": "free (Apify ~$0.01-0.03/row for SI fetch)",
  "exposes": "officers/managers on Statement of Information",
  "access": "Apify dz_omar bizfile + web-fetch (Incapsula blocks direct); CSLB license board for contractors",
  "known_blocks": "Incapsula on datacenter IPs",
  "outlook": "likely 70% (measured 2/2)"
 },
 {
  "state": "CO",
  "name": "Colorado",
  "source": "data.colorado.gov Business Entities (4ykn-tg5h)",
  "url": "https://data.colorado.gov/resource/4ykn-tg5h.json",
  "cost": "free open data (verified Oct 21)",
  "exposes": "registered agent name + principal address; no officers",
  "access": "SODA query by entityname; person-RA promotion (surname / same-address)",
  "known_blocks": "none",
  "outlook": "borderline; fallbacks carry it (measured 2/2 via LinkedIn/website)"
 },
 {
  "state": "CT",
  "name": "Connecticut",
  "source": "data.ct.gov Business Registry - Principals (ka36-64k6)",
  "url": "https://data.ct.gov/resource/ka36-64k6.json",
  "cost": "free open data (verified Oct 21)",
  "exposes": "principals (officers/members) with business + residence address",
  "access": "SODA query; join to Business Master by business_id",
  "known_blocks": "none",
  "outlook": "likely 70%+"
 },
 {
  "state": "DE",
  "name": "Delaware",
  "source": "Division of Corporations entity search",
  "url": "https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx",
  "cost": "free search shows RA only; status/detail $10-20 per entity",
  "exposes": "RA only (commercial agents dominate)",
  "access": "skip registry; LinkedIn/website/Google",
  "known_blocks": "captcha on search",
  "outlook": "needs paid help or fallbacks only; est. <50% from free"
 },
 {
  "state": "DC",
  "name": "District of Columbia",
  "source": "DLCP CorpOnline",
  "url": "https://corponline.dlcp.dc.gov/",
  "cost": "free (account required)",
  "exposes": "governors/officers on biennial reports",
  "access": "Serper site:corponline.dlcp.dc.gov, Apify fallback",
  "known_blocks": "login wall",
  "outlook": "borderline"
 },
 {
  "state": "FL",
  "name": "Florida",
  "source": "Sunbiz quarterly bulk (cor + fictitious) loaded in Supabase business_owners.fl_*; DBPR licensee extract",
  "url": "https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/",
  "cost": "free",
  "exposes": "officers/managers (6), RA, fictitious-name owners",
  "access": "Supabase RPC (no HTTP)",
  "known_blocks": "search.sunbiz.org 403s datacenter IPs (not used)",
  "outlook": "likely 70%+ (measured 4/4, shells 11/13)"
 },
 {
  "state": "GA",
  "name": "Georgia",
  "source": "eCorp business search",
  "url": "https://ecorp.sos.ga.gov/BusinessSearch",
  "cost": "free",
  "exposes": "officers (CEO/CFO/Secretary) + RA on annual registration",
  "access": "direct HTML (Cloudflare), Serper site:ecorp.sos.ga.gov (snippets lack officers), Apify fallback",
  "known_blocks": "Cloudflare 403 from datacenter IPs",
  "outlook": "borderline for shells (0/4); fine for operating businesses (2/2 via web)"
 },
 {
  "state": "HI",
  "name": "Hawaii",
  "source": "DCCA Business Registration (BREG)",
  "url": "https://hbe.ehawaii.gov/documents/search.html",
  "cost": "free",
  "exposes": "officers/members/managers",
  "access": "direct fetch; Serper site:hbe.ehawaii.gov",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "ID",
  "name": "Idaho",
  "source": "SOS SOSbiz",
  "url": "https://sosbiz.idaho.gov/search/business",
  "cost": "free",
  "exposes": "RA + governors on annual report (often managers)",
  "access": "direct JSON (SPA); Serper",
  "known_blocks": "SPA",
  "outlook": "borderline"
 },
 {
  "state": "IL",
  "name": "Illinois",
  "source": "DTA bulk LLC/corp files loaded in Supabase business_owners.il_llc*",
  "url": "https://www.ilsos.gov/data/bus-serv-home.html",
  "cost": "free",
  "exposes": "LLC managers/members; corp names/agents (corp officers not in files)",
  "access": "Supabase RPC",
  "known_blocks": "ilsos.gov sometimes unreachable from box; search UI forbids scraping",
  "outlook": "borderline (measured 2/4; trade names miss)"
 },
 {
  "state": "IN",
  "name": "Indiana",
  "source": "INBiz business search",
  "url": "https://bsd.sos.in.gov/publicbusinesssearch",
  "cost": "free",
  "exposes": "RA + principals on business entity reports",
  "access": "direct fetch; Serper site:bsd.sos.in.gov",
  "known_blocks": "bot checks",
  "outlook": "borderline (measured 0-1/2)"
 },
 {
  "state": "IA",
  "name": "Iowa",
  "source": "SOS business search + data.iowa.gov entity list",
  "url": "https://sos.iowa.gov/search/business/search.aspx",
  "cost": "free",
  "exposes": "RA + officers on biennial report",
  "access": "direct fetch; open data (RA only)",
  "known_blocks": "none known",
  "outlook": "borderline"
 },
 {
  "state": "KS",
  "name": "Kansas",
  "source": "SOS business entity search",
  "url": "https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx",
  "cost": "free search; reports $",
  "exposes": "RA; officers on annual reports (images)",
  "access": "direct fetch; Serper",
  "known_blocks": "none known",
  "outlook": "needs fallbacks"
 },
 {
  "state": "KY",
  "name": "Kentucky",
  "source": "SOS FastTrack business search",
  "url": "https://web.sos.ky.gov/bussearchnprofile/search.aspx",
  "cost": "free",
  "exposes": "officers/managers/members + organizer",
  "access": "direct fetch; Serper site:web.sos.ky.gov",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "LA",
  "name": "Louisiana",
  "source": "geauxBIZ / SOS commercial search",
  "url": "https://coraweb.sos.la.gov/commercialsearch/commercialsearch.aspx",
  "cost": "free search (detail requires captcha), $ for certificates",
  "exposes": "officers/managers/members",
  "access": "Serper site:coraweb.sos.la.gov; Apify fallback",
  "known_blocks": "captcha",
  "outlook": "borderline"
 },
 {
  "state": "ME",
  "name": "Maine",
  "source": "Corporations search",
  "url": "https://apps3.web.maine.gov/nei-sos-icrs/ICRS?MainPage=x",
  "cost": "free",
  "exposes": "RA (clerk); annual report lists officers (paid copies)",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "needs fallbacks"
 },
 {
  "state": "MD",
  "name": "Maryland",
  "source": "SDAT Business Entity Search",
  "url": "https://egov.maryland.gov/BusinessExpress/EntitySearch",
  "cost": "free",
  "exposes": "RA + principal office; no officers",
  "access": "direct fetch; RA promotion",
  "known_blocks": "bot checks",
  "outlook": "needs fallbacks; est. <60% free"
 },
 {
  "state": "MA",
  "name": "Massachusetts",
  "source": "Corporations Division search",
  "url": "https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx",
  "cost": "free",
  "exposes": "officers/managers/directors + RA",
  "access": "Apify residential fallback only (Incapsula); Serper site: returns nothing",
  "known_blocks": "Incapsula on datacenter IPs (verified Oct 21)",
  "outlook": "borderline (measured 1/2); Apify ~$0.01-0.02/row would lift it"
 },
 {
  "state": "MI",
  "name": "Michigan",
  "source": "LARA corporations search",
  "url": "https://cofs.lara.state.mi.us/SearchApi/Search/Search",
  "cost": "free",
  "exposes": "RA; officers on annual statements (images)",
  "access": "direct fetch",
  "known_blocks": "bot checks",
  "outlook": "needs fallbacks (measured 2/2 via web)"
 },
 {
  "state": "MN",
  "name": "Minnesota",
  "source": "SOS business search",
  "url": "https://mblsportal.sos.state.mn.us/Business/Search",
  "cost": "free",
  "exposes": "CEO/manager often listed + RA",
  "access": "direct HTML (existing adapter); Serper",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "MS",
  "name": "Mississippi",
  "source": "SOS business search",
  "url": "https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx",
  "cost": "free",
  "exposes": "officers/members on annual reports",
  "access": "direct fetch; Serper",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "MO",
  "name": "Missouri",
  "source": "SOS business entity search",
  "url": "https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx",
  "cost": "free",
  "exposes": "officers (corps), organizer (LLCs), RA",
  "access": "direct fetch; Serper",
  "known_blocks": "none known",
  "outlook": "borderline (LLCs show organizer only)"
 },
 {
  "state": "MT",
  "name": "Montana",
  "source": "SOS business search (biz.sosmt.gov)",
  "url": "https://biz.sosmt.gov/search/business",
  "cost": "free",
  "exposes": "principals/managers + RA",
  "access": "direct JSON (SPA)",
  "known_blocks": "SPA",
  "outlook": "likely 70%"
 },
 {
  "state": "NE",
  "name": "Nebraska",
  "source": "SOS corporate search",
  "url": "https://www.nebraska.gov/sos/corp/corpsearch.cgi",
  "cost": "free search; some detail $",
  "exposes": "officers/members on reports",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "borderline"
 },
 {
  "state": "NV",
  "name": "Nevada",
  "source": "SilverFlume business search",
  "url": "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
  "cost": "free",
  "exposes": "officers/managers (initial + annual list)",
  "access": "Serper site:esos.nv.gov; Apify fallback",
  "known_blocks": "Cloudflare + captcha",
  "outlook": "likely 70% via Serper/OpenCorporates"
 },
 {
  "state": "NH",
  "name": "New Hampshire",
  "source": "QuickStart business search",
  "url": "https://quickstart.sos.nh.gov/online/BusinessInquire",
  "cost": "free",
  "exposes": "principals (officers/managers) + RA",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "NJ",
  "name": "New Jersey",
  "source": "NJ business records (DORES)",
  "url": "https://www.njportal.com/DOR/BusinessNameSearch",
  "cost": "free name search; reports $5+",
  "exposes": "RA only free; officers in paid reports",
  "access": "skip registry; fallbacks",
  "known_blocks": "fees",
  "outlook": "needs paid help; est. paid ~$5/report (not worth it); fallbacks measured 1/2"
 },
 {
  "state": "NM",
  "name": "New Mexico",
  "source": "SOS business search",
  "url": "https://enterprise.sos.nm.gov/search",
  "cost": "free",
  "exposes": "officers/directors for corps; organizer/RA for LLCs",
  "access": "direct JSON (SPA)",
  "known_blocks": "SPA",
  "outlook": "borderline"
 },
 {
  "state": "NY",
  "name": "New York",
  "source": "data.ny.gov Active Corporations (n9v6-gdp6)",
  "url": "https://data.ny.gov/resource/n9v6-gdp6.json",
  "cost": "free open data (verified Oct 21)",
  "exposes": "DOS process name/address (often the owner for small LLCs); no officers",
  "access": "SODA query; process-name promotion (surname / same-address rule)",
  "known_blocks": "none",
  "outlook": "borderline (measured 1/2)"
 },
 {
  "state": "NC",
  "name": "North Carolina",
  "source": "SOS business registration search",
  "url": "https://www.sosnc.gov/online_services/search/by_title/_Business_Registration",
  "cost": "free",
  "exposes": "officers/managers/company officials + RA",
  "access": "direct HTML (Cloudflare), Serper site:sosnc.gov, Apify fallback",
  "known_blocks": "Cloudflare 403 from datacenter IPs (verified Oct 21)",
  "outlook": "likely 70% (measured 3-4/4)"
 },
 {
  "state": "ND",
  "name": "North Dakota",
  "source": "FirstStop business search",
  "url": "https://firststop.sos.nd.gov/search/business",
  "cost": "free",
  "exposes": "RA + governors/officers on annual report",
  "access": "direct JSON (SPA)",
  "known_blocks": "SPA",
  "outlook": "borderline"
 },
 {
  "state": "OH",
  "name": "Ohio",
  "source": "SOS business search",
  "url": "https://businesssearch.ohiosos.gov/",
  "cost": "free",
  "exposes": "RA (statutory agent) + incorporator only",
  "access": "skip registry; RA promotion + fallbacks",
  "known_blocks": "403 from datacenter IPs (verified Oct 21)",
  "outlook": "needs fallbacks; est. 50-60% (measured 0/2)"
 },
 {
  "state": "OK",
  "name": "Oklahoma",
  "source": "SOS business entity search",
  "url": "https://www.sos.ok.gov/corp/corpInquiryFind.aspx",
  "cost": "free search; filings $",
  "exposes": "RA; officers rarely",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "needs fallbacks"
 },
 {
  "state": "OR",
  "name": "Oregon",
  "source": "data.oregon.gov Active Businesses (tckn-sxa6)",
  "url": "https://data.oregon.gov/resource/tckn-sxa6.json",
  "cost": "free open data (verified Oct 21)",
  "exposes": "registered agent + authorized representative (person names), principal/mailing addresses",
  "access": "SODA query by business_name",
  "known_blocks": "none",
  "outlook": "likely 70% (authorized rep is usually the owner)"
 },
 {
  "state": "PA",
  "name": "Pennsylvania",
  "source": "PA DOS business search (file.dos.pa.gov)",
  "url": "https://file.dos.pa.gov/search/business",
  "cost": "free",
  "exposes": "officers on some filings; organizer; RA/CROP",
  "access": "Serper site:file.dos.pa.gov; Apify fallback",
  "known_blocks": "bot protection (verified Oct 21: 999)",
  "outlook": "borderline (measured 2/2 via web)"
 },
 {
  "state": "RI",
  "name": "Rhode Island",
  "source": "SOS business search",
  "url": "https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx",
  "cost": "free",
  "exposes": "officers/managers + RA",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "SC",
  "name": "South Carolina",
  "source": "SOS business entity search",
  "url": "https://businessfilings.sc.gov/BusinessFiling/Entity/Search",
  "cost": "free",
  "exposes": "RA only",
  "access": "skip registry; fallbacks",
  "known_blocks": "none known",
  "outlook": "needs fallbacks"
 },
 {
  "state": "SD",
  "name": "South Dakota",
  "source": "SOS SOSenterprise",
  "url": "https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx",
  "cost": "free",
  "exposes": "RA + officers/managers on annual report",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "borderline"
 },
 {
  "state": "TN",
  "name": "Tennessee",
  "source": "SOS TNBear business search",
  "url": "https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx",
  "cost": "free",
  "exposes": "RA; principal office; officers rarely",
  "access": "direct fetch; fallbacks",
  "known_blocks": "none known",
  "outlook": "needs fallbacks (measured 1/2)"
 },
 {
  "state": "TX",
  "name": "Texas",
  "source": "Comptroller franchise tax PIR (JSON) + TDLR licenses open data",
  "url": "https://comptroller.texas.gov/data-search/franchise-tax",
  "cost": "free",
  "exposes": "officers/managers/directors on PIR; RA; mailing address",
  "access": "direct JSON (existing adapter); TDLR SODA",
  "known_blocks": "none",
  "outlook": "likely 70% (measured 3/4, shells 5/8)"
 },
 {
  "state": "UT",
  "name": "Utah",
  "source": "Division of Corporations business search",
  "url": "https://businessregistration.utah.gov/EntitySearch/OnlineEntitySearch",
  "cost": "free",
  "exposes": "principals (members/managers/officers) + RA",
  "access": "direct fetch; Serper",
  "known_blocks": "intermittent timeouts from box",
  "outlook": "likely 70% (measured 2/2)"
 },
 {
  "state": "VT",
  "name": "Vermont",
  "source": "SOS business search",
  "url": "https://bizfilings.vermont.gov/online/BusinessInquire/",
  "cost": "free",
  "exposes": "principals + RA",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "VA",
  "name": "Virginia",
  "source": "SCC Clerk's Information System + free BE data download",
  "url": "https://cis.scc.virginia.gov/DataSales/DownloadBEDataSales",
  "cost": "free (download page reachable Oct 21)",
  "exposes": "officers/directors (corps), RA; LLC managers limited",
  "access": "bulk download (not loaded per scope change); direct fetch",
  "known_blocks": "none known",
  "outlook": "likely 70% (measured 2/2)"
 },
 {
  "state": "WA",
  "name": "Washington",
  "source": "CCFS corporations search + L&I contractor principals open data (4xk5-x9j6)",
  "url": "https://ccfs.sos.wa.gov/",
  "cost": "free",
  "exposes": "governors (officers/managers) + RA; L&I principals for contractors",
  "access": "direct JSON (existing adapter); data.wa.gov SODA for contractors",
  "known_blocks": "none known",
  "outlook": "borderline (measured 1-2/2)"
 },
 {
  "state": "WV",
  "name": "West Virginia",
  "source": "SOS business organization search",
  "url": "https://apps.sos.wv.gov/business/corporations/",
  "cost": "free",
  "exposes": "officers/members/managers + RA",
  "access": "direct fetch",
  "known_blocks": "none known",
  "outlook": "likely 70%"
 },
 {
  "state": "WI",
  "name": "Wisconsin",
  "source": "DFI corporate records search",
  "url": "https://www.wdfi.org/apps/CorpSearch/Search.aspx",
  "cost": "free",
  "exposes": "RA only (officers not filed)",
  "access": "skip registry; RA promotion + fallbacks",
  "known_blocks": "none known",
  "outlook": "needs fallbacks (measured 1/1 via web)"
 },
 {
  "state": "WY",
  "name": "Wyoming",
  "source": "SOS business center search",
  "url": "https://wyobiz.wyo.gov/Business/FilingSearch.aspx",
  "cost": "free",
  "exposes": "RA (commercial agents common) + officers on annual reports",
  "access": "direct fetch; Serper",
  "known_blocks": "none known",
  "outlook": "borderline (heavy commercial-agent use)"
 }
]
```

## Per-state live test (2026-10-21)

381 rows (Serper Places small businesses, mixed industries; 10/state for AK–NV plus OR/NY, 5/state for the rest). 194 named (51%). Spend ~$8.7 (Serper 0.001/credit + Apify). Counts only.

| State | Named/rows | Rate | $/lookup | Top sources |
|---|---|---|---|---|
| AK | 4/10 | 40% | 0.023 | {'linkedin': 3, 'serper': 1} |
| AL | 4/10 | 40% | 0.027 | {'linkedin': 3, 'hard_to_find': 1} |
| AR | 4/9 | 44% | 0.016 | {'serper': 2, 'linkedin': 2} |
| AZ | 2/10 | 20% | 0.017 | {'linkedin': 2} |
| CA | 6/10 | 60% | 0.041 | {'linkedin': 4, 'website': 1} |
| CO | 6/9 | 67% | 0.019 | {'us_sos': 2, 'linkedin': 2} |
| CT | 5/10 | 50% | 0.014 | {'us_sos': 3, 'serper': 1} |
| DC | 4/10 | 40% | 0.019 | {'website': 1, 'linkedin': 1} |
| DE | 5/9 | 56% | 0.025 | {'hard_to_find': 2, 'linkedin': 2} |
| FL | 3/9 | 33% | 0.023 | {'sunbiz': 2, 'linkedin': 1} |
| GA | 5/10 | 50% | 0.010 | {'linkedin': 3, 'serper': 1} |
| HI | 4/10 | 40% | 0.027 | {'linkedin': 3, 'serper': 1} |
| IA | 7/9 | 78% | 0.022 | {'linkedin': 4, 'serper': 2} |
| ID | 7/10 | 70% | 0.029 | {'linkedin': 4, 'hard_to_find': 2} |
| IL | 5/10 | 50% | 0.019 | {'us_sos': 2, 'linkedin': 2} |
| IN | 5/9 | 56% | 0.021 | {'website': 2, 'linkedin': 2} |
| KS | 5/10 | 50% | 0.014 | {'linkedin': 3, 'serper': 2} |
| KY | 9/10 | 90% | 0.034 | {'serper': 4, 'linkedin': 4} |
| LA | 2/9 | 22% | 0.024 | {'linkedin': 2} |
| MA | 2/7 | 29% | 0.027 | {'serper': 1, 'linkedin': 1} |
| MD | 3/9 | 33% | 0.024 | {'linkedin': 3} |
| ME | 5/10 | 50% | 0.024 | {'linkedin': 4, 'serper': 1} |
| MI | 9/10 | 90% | 0.027 | {'linkedin': 4, 'serper': 2} |
| MN | 4/9 | 44% | 0.013 | {'linkedin': 3, 'serper': 1} |
| MO | 7/9 | 78% | 0.036 | {'linkedin': 4, 'hard_to_find': 2} |
| MS | 5/9 | 56% | 0.019 | {'linkedin': 2, 'serper': 1} |
| MT | 3/10 | 30% | 0.028 | {'linkedin': 2, 'serper': 1} |
| NC | 2/5 | 40% | 0.018 | {'linkedin': 2} |
| ND | 1/5 | 20% | 0.020 | {'website': 1} |
| NE | 7/9 | 78% | 0.016 | {'linkedin': 5, 'serper': 2} |
| NH | 0/1 | 0% | 0.010 | {} |
| NJ | 2/5 | 40% | 0.011 | {'linkedin': 1, 'website': 1} |
| NM | 3/5 | 60% | 0.033 | {'linkedin': 2, 'serper': 1} |
| NV | 4/4 | 100% | 0.005 | {'serper': 3, 'hard_to_find': 1} |
| NY | 4/6 | 67% | 0.021 | {'linkedin': 3, 'serper': 1} |
| OH | 0/5 | 0% | 0.024 | {} |
| OK | 4/5 | 80% | 0.012 | {'serper': 2, 'hard_to_find': 1} |
| OR | 6/10 | 60% | 0.035 | {'us_sos': 4, 'serper': 1} |
| PA | 3/5 | 60% | 0.031 | {'linkedin': 2, 'serper': 1} |
| RI | 0/5 | 0% | 0.046 | {} |
| SC | 3/5 | 60% | 0.020 | {'website': 1, 'serper': 1} |
| SD | 3/5 | 60% | 0.022 | {'hard_to_find': 2, 'website': 1} |
| TN | 4/5 | 80% | 0.036 | {'linkedin': 3, 'hard_to_find': 1} |
| TX | 5/5 | 100% | 0.012 | {'us_sos': 4, 'website': 1} |
| UT | 0/5 | 0% | 0.034 | {} |
| VA | 4/5 | 80% | 0.008 | {'serper': 2, 'linkedin': 2} |
| VT | 1/5 | 20% | 0.008 | {'linkedin': 1} |
| WA | 2/5 | 40% | 0.034 | {'serper': 1, 'linkedin': 1} |
| WI | 2/5 | 40% | 0.006 | {'hard_to_find': 2} |
| WV | 3/5 | 60% | 0.011 | {'linkedin': 3} |
| WY | 1/5 | 20% | 0.013 | {'linkedin': 1} |

States at >=70%: 11 (IA, ID, KY, MI, MO, NE, NV, OK, TN, TX, VA). Samples of 5 or fewer rows are directional only.
New: live SODA adapters (sodaStates.ts) for CT principals, OR authorized rep/RA, CO and NY agent (person-RA rule).
Note: per-row Serper use is ~20 credits, about 4x what the Apify spend file tracks; the cap must count Serper from per-row credits.

## Round 2 (2026-10-21, 4:12–5:35pm CT)

Changes: Serper spend now reserved before each paid call on both the run tracker and a process-wide ledger (`SERPER_LEDGER_FILE`, hard cap `SERPER_HARD_CAP_USD`/`TOTAL_MAX_USD`); FL city-scoped name-prefix lookup (`bo_lookup_fl_prefix` RPC) for trade names; looser SODA matching (registry name leading the trade name) for CT/OR/CO/NY; trade-name variants retried on other official sources; Apify residential fallback for registries that drop the box connection (GA, UT, NC, OH, PA, MA). Registry-site Serper search tested at 0 useful titles and is off by default (`BO_REGISTRY_SITE_SEARCH=1`).

Re-test (same rows, counts only):

| State | Before | After | Rate | Apify $/lookup | Top sources |
|---|---|---|---|---|---|
| FL | 3/9 | 4/9 | 44% | 0.000 | {'sunbiz': 4} |
| CO | 6/9 | 5/9 | 56% | 0.000 | {'linkedin': 2, 'website': 1} |
| NY | 4/6 | 3/6 | 50% | 0.000 | {'linkedin': 3} |
| CA | 6/10 | 7/10 | 70% | 0.041 | {'linkedin': 5, 'hard_to_find': 1} |
| OR | 6/10 | 6/10 | 60% | 0.000 | {'us_sos': 4, 'serper': 2} |
| NM | 3/5 | 5/10 | 50% | 0.000 | {'linkedin': 4, 'website': 1} |
| PA | 3/5 | 4/10 | 40% | 0.031 | {'serper': 2, 'linkedin': 2} |
| SC | 3/5 | 6/10 | 60% | 0.000 | {'website': 2, 'hard_to_find': 2} |
| SD | 3/5 | 4/6 | 67% | 0.000 | {'hard_to_find': 2, 'website': 1} |
| WV | 3/5 | 4/10 | 40% | 0.000 | {'linkedin': 4} |
| MA | 2/7 | 2/7 | 29% | 0.000 | {'serper': 1, 'linkedin': 1} |
| NC | 2/5 | 6/9 | 67% | 0.008 | {'linkedin': 4, 'serper': 2} |
| OH | 0/5 | 3/10 | 30% | 0.000 | {'linkedin': 3} |
| GA | 5/10 | 5/10 | 50% | 0.000 | {'serper': 3, 'linkedin': 1} |
| UT | 0/5 | 2/10 | 20% | 0.017 | {'linkedin': 2} |
| CT | 5/10 | 5/10 | 50% | 0.000 | {'us_sos': 4, 'serper': 1} |

Findings: Apify residential reached the GA, MA, UT, NC and PA registries but every page was still a bot challenge (0 rows gained), so it should stay off for those states. FL prefix matching produced 4 Sunbiz hits, up from 2. Moves of ±1 row are within run-to-run web variance. Round spend was about $4.2.

Paid sources (public pricing only):

| Vendor | Price (public) | Per lookup | Coverage | Officer names? |
|---|---|---|---|---|
| Enigma | Pro $20/mo (2,100 credits), Max $200/mo; 1 credit = $0.01 | Person Name $0.01 + Person Role $0.01 + Legal Entity Name $0.05 ≈ $0.07 per filled match | US businesses (business graph) | Yes (people product); coverage for small businesses not stated |
| Cobalt Intelligence | Not published; subscription plans for 400–100k lookups/mo; third-party reported ~$2 (<500/mo) to $0.60 (10k/mo) | $0.60–$2.00; credit used even on no-match; DE pass-through $15–20 | 50 states + DC live SOS | Yes where the state publishes officers |
| Baselayer | Startup $150/mo (500 credits), Growth $750/mo (3,000 credits) | ~$0.25–$0.30 if 1 credit per search (credits per check not stated) | US SOS + online | Yes: business_officers (SOS; Enhanced Search adds website/LinkedIn) |
| OpenCorporates | Essentials £2,250/yr (500 calls/mo), Starter £6,600/yr (2,500/mo), Basic £12,000/yr (5,000/mo) | ~£0.37–£0.20 per call (lookup often needs 2 calls) | All US states it collects (officers vary by state) | Yes where registry publishes |
| Middesk | Not published; reported $2–$5 per verification, annual minimums | $2–$5 | 50 states | Yes (registrations[].officers) |
| SignalHire | $49/mo (600 email credits) … $99/mo | contact enrichment, not owner discovery | n/a | No (needs a known person) |
