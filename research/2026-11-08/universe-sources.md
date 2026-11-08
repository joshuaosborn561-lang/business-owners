# Universe and overlay sources added Nov 8 2026

Checked live from a cloud datacenter box on Nov 8 2026. Counts are from dry runs of `scripts/build_universe.ts` (nothing written). No names are recorded here.

## CMS provider ownership (VERIFIED)

- Catalog: https://data.cms.gov/data.json. Each quarter is a new dataset id per family, so the code resolves the newest release from the catalog (cached 24h) and falls back to ids pinned for the 2026-10-01 release.
- Families used (latest release 2026-10-01, refresh quarterly):

| Type | All Owners file | Enrollments file |
|---|---|---|
| Home health agency | Home Health Agency All Owners | Home Health Agency Enrollments |
| Hospice | Hospice All Owners | Hospice Enrollments |
| Skilled nursing facility | Skilled Nursing Facility All Owners | Skilled Nursing Facility Enrollments |
| Rural health clinic | Rural Health Clinic All Owners | Rural Health Clinic Enrollments |
| Hospital | Hospital All Owners | Hospital Enrollments |

  FQHC files exist too and are skipped (almost all nonprofits).
- Data API: `https://data.cms.gov/data-api/v1/dataset/{id}/data` with `filter[x][condition][path|operator|value]`, `size`, `offset`. CONTAINS and equality filters both work. CSV downloads are listed in the catalog.
- All Owners fields used: ENROLLMENT ID, TYPE - OWNER (I person / O organization), ROLE TEXT - OWNER, TITLE - OWNER, FIRST / MIDDLE / LAST NAME - OWNER, ORGANIZATION NAME - OWNER, PERCENTAGE OWNERSHIP, ASSOCIATION DATE - OWNER, PRIVATE EQUITY COMPANY - OWNER, REIT - OWNER.
- Enrollments fields used: ENROLLMENT ID, NPI, CCN, ORGANIZATION NAME, DOING BUSINESS AS NAME, ADDRESS LINE 1/2, CITY, STATE, ZIP CODE. No phone.
- HHA file shape (2026-10-01): 102,942 owner rows over 11,522 enrollments; 7,086 enrollments have an individual 5%+ direct owner; 1,042 rows carry the PE flag.
- Role ranking used: 5%+ direct owner, general partner, 5%+ indirect owner, corporate officer, operational/managerial control, director. W-2 and contracted managing employees are never picked as owners.
- Dry run, all states: HHA 11,522 providers (11,371 with an individual owner or officer, 10,949 waterfall ready, 368 PE flagged); hospice 5,690 (5,631 / 5,414, 314 PE); SNF 14,404 (14,353 / 13,524, 98 PE); RHC 5,626 (5,571 / 5,444); hospital 9,138 (9,045 / 8,767, 49 PE).

## DOL Form 5500 and 5500-SF (VERIFIED)

- Files: `https://www.askebsa.dol.gov/FOIA%20Files/{year}/Latest/F_5500_SF_{year}_Latest.zip` and `F_5500_{year}_Latest.zip`, each with a `_layout.txt`. The dol.gov landing page returns 403 to datacenter IPs; the askebsa host serves the files directly. 2024: 137 MB zip (601 MB CSV, 800,594 SF filings) and 29 MB zip (137 MB CSV, 227,009 full filings). Updated through the year.
- **Signer names are in the bulk data.** Fields: `SF_SPONS_SIGNED_NAME`, `SF_ADMIN_SIGNED_NAME`, `SF_SPONS_MANUAL_SIGNED_NAME`, `SF_ADMIN_MANUAL_SIGNED_NAME` (5500-SF) and `SPONS_SIGNED_NAME`, `ADMIN_SIGNED_NAME`, `*_MANUAL_SIGNED_NAME` (5500). No title field.
- Fill rates (2024): sponsor signature 9% (SF) / 11% (full); administrator signature 77% / 68%; EIN 100%; phone 99%.
- The administrator is the employer itself on most small plans (`ADMIN_NAME_SAME_SPON_IND = Y`, admin EIN = sponsor EIN, or admin blank). Among filings with 15 to 499 participants: SF 212,006 admin-is-sponsor + 49,903 sponsor-signed vs 23,646 third-party administrators; full 106,481 + 20,680 vs 3,221.
- Professional signers: a name signing for 5+ EINs is treated as a TPA or payroll signer and dropped (SF: 731 names on 49,260 filings).
- Result (2024 only): 322,190 distinct sponsor EINs with 15 to 499 participants and an employer-side signer, in all 50 states plus territories. Universe dry run, default floor of 15 participants and no cap: 360,719 employers, 273,134 named, 269,373 waterfall ready. (10 to 2,000 participants: 451,260 employers, 327,188 ready.)
- Other fields kept: sponsor name and DBA, location address (falls back to mailing), city, state, ZIP, phone, EIN, business code (NAICS), plan year begin date, active participant count (BOY for SF; `TOT_ACTIVE_PARTCP_CNT` for the full form).
- Caveat: the signer is whoever signs for the plan. At small employers that is usually the owner or president; at larger ones it can be a CFO or HR lead. Rows are marked confidence medium and titled "Plan signer (Form 5500)".

## FMCSA Company Census (VERIFIED)

- `https://data.transportation.gov/resource/az4n-8mr2.json`, daily. `power_units` is stored as text: filter with `power_units::number`.
- 2,102,953 active carriers with `company_officer_1`; 248,488 with 5 or more power units (the universe default).

## NC registry terms (VERIFIED Nov 7)

- sosnc.gov: "Automated or scripted searches may degrade system performance and are not permitted." Josh decided on Nov 8 to keep NC on the scripted route (direct HTML, then the unblocker). The paid NC data subscription ($750 setup plus $2,000 per state fiscal year) remains the terms-compliant alternative.

## NY Active Corporations CEO (VERIFIED)

- `https://data.ny.gov/resource/n9v6-gdp6.json`. The CEO from the biennial statement is the `chairman_name` field (with `chairman_address_*`). There is no field called ceo_name.
- 471,651 active entities carry a chairman name; 469,721 of them are domestic, foreign or professional business corporations. LLCs carry none.
- In a 400-row sample, about 14% of chairman names were companies, which the person-name check rejects; about 4% were "LAST, FIRST" and are flipped.
- Live check on 25 corporations taken from the file itself: 25 named. This overstates the hit rate on Maps names, which differ more from legal names.
