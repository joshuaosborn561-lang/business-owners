# Free bulk and open owner files, by state

The checklist of every state whose government publishes a business-owner file for free (bulk download or open-data API) and whether the lookup uses it. Updated Nov 5 2026. Evidence for each file is in `research/2026-10-25/`. The rows added Nov 5 2026 (bold state) were queried live from a cloud datacenter box that day and returned owner names.

"Owner file" means a file that names a **person** tied to a business: officer, member, manager, fictitious-name registrant, license owner or qualifying individual. Files that only name a registered agent are listed under "RA only".

Paid bulk products (MN, RI, AZ, OK, ND, NC, MT, HI, UT, WY, KY, ...) are in `OWNER_PLAN_2026-10.md` section 3, Tier B. Nothing here costs money.

## Wired (runs on every row in that state, $0)

| State | File | Who it names | Adapter id | Since |
|---|---|---|---|---|
| **CA** | LA County fictitious business names, ArcGIS `Fictitious_Business_Name/FeatureServer/0` (~280k rows, Feb 2024 on) | Every registrant on the FBN (sole props, partners, married couples); LLC/corp registrant passed on as the legal name | `ca_la_fbn` | Nov 5 2026 |
| **CA** | San Francisco Registered Business Locations, `data.sf.gov g8m3-pdis` | `ownership_name` of every SF-registered business | `ca_sf_reg` | Nov 5 2026 |
| **CA** | CA ABC daily export `DailyExport-CSV.zip` (statewide, ~130k licenses) | Sole-prop licensee for bars, restaurants, liquor stores; entity licensee passed on as the legal name. Downloaded once per day, cached in memory | `ca_abc` | Nov 5 2026 |
| FL | Sunbiz quarterly corp + fictitious-name bulk (public SFTP), loaded in Supabase | 6 officer slots per entity, fictitious-name owners, DBPR construction licensees | Supabase RPC (`flBulk.ts`) | Oct 2026 |
| IL | SOS Data Transparency Act daily bulk zips, loaded in Supabase | Corp president + secretary, LLC managers/members, assumed names | Supabase RPC (`ilDta.ts`, `ilLlc.ts`) | Oct 2026 |
| IL | Chicago licenses `r5kz-chrr` + owners `ezma-pppn`; IDFPR `pzzh-kp68` | Owner first/last/title for every licensed Chicago business; licensed professionals by business name | `chicago`, `il_idfpr` | Oct 2026 |
| PA | `data.pa.gov xvd7-5r2c` (4.2M rows) | Officers and governors of every PA entity | `pa_dos` | Oct 2026 |
| PA | Philadelphia `business_licenses` (Carto) | Legal first/last of individual license holders (rental licenses excluded) | `phl_bl` | Nov 5 2026 |
| CT | `data.ct.gov` master `n7gp-d28j` + principals `ka36-64k6` | Principals (officers, members) | `sodaStates.ts` | Oct 2026 |
| TX | Comptroller franchise-tax JSON | Officers from the latest PIR | `txComptroller.ts` | Oct 2026 |
| **TX** | TDLR licenses `data.texas.gov 7358-krk7` | `owner_name` for A/C, electrical and other TDLR-licensed businesses | `tx_tdlr` | Nov 5 2026 |
| TX | TABC `7hf9-qc9f` | Alcohol licensee (person, or entity passed on as the legal name) | `tx_tabc` | Oct 2026 |
| CO | Trade names `u7sb-g482`; entities `4ykn-tg5h` | Trade-name registrant; person registered agent (promotion rule) | `co_trade`, `sodaStates.ts` | Oct 2026 |
| OR | CCB `g77e-6bhs`; Active Businesses `tckn-sxa6` | Contractor responsible individual; assumed-business-name owner | `or_ccb`, `sodaStates.ts` | Oct 2026 |
| NY | DMV facilities `nhjr-rpi2`; NYC DOB `t8hj-ruu2`; Active Corporations `n9v6-gdp6` | Auto-trade owners; NYC contractor licensees; DOS process name (promotion rule) | `ny_dmv`, `nyc_dob`, `sodaStates.ts` | Oct 2026 |
| WA | L&I contractors `m8qx-ubtq` | Primary principal | `wa_lni` | Oct 2026 |
| MO | Alcohol licenses `yyhn-562y` | Owner / partner / managing officer | `mo_liquor` | Oct 2026 |
| DC | Basic Business License (DCGIS FEEDS/DCRA) | Business owner first/last | `dc_bbl` | Oct 2026 |
| **AK** | DCCED business licenses (ArcGIS `Business_Licenses/MapServer/2`) | `Owners` of every Alaska business license | `ak_bl` | Nov 5 2026 |
| All | FMCSA census `az4n-8mr2`; CMS NPPES | Company officers of USDOT registrants; authorized official of healthcare orgs | `fmcsa`, `nppes` | Oct 2026 |

`health` returns `open_data_state_sources`, the live state-to-adapter map.

## Free, but not wired (and why)

| State | File | Blocker |
|---|---|---|
| CA | CSLB Personnel + License Master (contractor owners, RMOs, officers) | F5 WAF rejects the download from datacenter IPs. Download from an office/residential IP or Apify, then load into Supabase like FL/IL. Best single CA source for trades. |
| CA | Riverside County daily FBN xlsx | New filings only, emailed xlsx; worth adding if Riverside volume is high. |
| IA | Contractor registrations (dataset 1052: first/last + business) | Moved to the JS-only Iowa Data Hub; no public query or download URL found Nov 5. |
| MN | DLI nightly license export (contractors, electricians, plumbers) | The documented zip URL now 404s; the current link needs finding. |
| NE | NLCC liquor roster xlsx (manager name) | xlsx on a page, not an API; small. |
| AK | DCCED corporations CSV (officials) | 403 from datacenter IPs; needs a residential fetch. |
| OH | Monthly new-filing files (organizer / business associates) | Only new filings, behind 403; archive monthly via the unblocker. |
| WA | L&I principal file `4xk5-x9j6` (all principals, not just the primary) | Optional; `m8qx-ubtq` already gives the primary principal. |

## No free owner file exists

CA (statewide entity registry: SOS publishes no bulk file and sells none publicly), and every state not listed above. Those run the Serper, registry (direct or unblocker), About-page and LinkedIn steps only. See `OWNER_PLAN_2026-10.md` for per-state paths.

## RA only (free, but no owner names)

CO entities, IA entities (dataset 554), NY corporations, OR entities. Used only through the registered-agent promotion rule (person agent at the business address, or surname in the company name).
