# Paid vendor landscape: business name + address (+domain, phone) -> OWNER name (+mobile/email)

Researched 2026-10-25. Every price below is tagged **VERIFIED** (I fetched the vendor's own page today) or **UNVERIFIED** (search snippet / third-party, with source + date). Nothing from BRIEF.md's "known facts" was relied on; where I could not reach a vendor page I say "not published". WebSearch budget was exhausted near the end (the shared 200/turn cap), so a few vendors (Tracers ToS, Bizapedia Pro price, D&B Direct+ principals block) are left at UNVERIFIED.

## TL;DR
1. **There is no mainstream paid API that takes {business name, street address} and returns the owner's name for a 5-person plumber at $0.05-0.30 and is licensed for lead-gen.** Every vendor falls into one of four buckets: (a) consumer skip-tracing (needs a *person* name or a *property* address, not a business), (b) KYB/SOS registry APIs that do return officers but cost $0.75-2.50+ and are sold for compliance, (c) B2B contact databases that are thin on 1-20 employee local firms, or (d) Google-Maps "lead" tools that scrape the website for a name.
2. The cheapest *verified* owner-name sources are: **Enigma** (Person name $0.01 per returned fill, Person entity explicitly defined as "owner, officer, or contact", pay-as-you-go from $20/mo) and **Apify website-extraction actors** ($0.01-0.03 per hit, pay only on hit, ~69% precision self-reported). Both VERIFIED on pricing pages today.
3. **Datazapp** (VERIFIED $0.03/match PAYG, $0.02 at $2k prepay, $125 min) lists a B2B "Contact Name and Title" append and a "Small Business Prospecting Lists with Owner Cell Phones" list product at $0.04/record with 2.3M "business owners" — but its site never confirms that *business name + address* is an accepted append key. Needs a free match-report test (they offer one).
4. **Versium REACH** (VERIFIED $0.05-0.075/match PAYG, $125/file min; $0.02-0.05 credit packs from $250) has B2B2C identity resolution, but the only documented direction is consumer email -> business person, not business -> owner. Also needs a sample test.
5. Classic skip-trace stacks (BatchData, Tracers, IDI, TLOxp, Accurint) are the only ones that truly pierce LLCs to individuals, but they key on property address / person, are priced on $2k+/mo plans or custom quotes, and their ToS push consent/TCPA risk onto you (BatchData ToS VERIFIED). IDI/TLO/Accurint are GLBA/DPPA-gated and not sold for marketing.

---

## A. Skip-tracing / data-append products (real-estate + B2B marketer stack)

### BatchData / BatchSkipTracing (batchskiptracing.com now 301s to batchdata.io) — VERIFIED pricing page
- **Plans:** Growth $2,000/mo for 100k records; Professional $5,000/mo 300k; Scale $10,000/mo 750k; Enterprise $20,000/mo 3M. All include phones, emails, mailing address, DNC, litigator scrub, API. No PAYG shown. Implied $0.007-0.02/record *if you use the volume*. (batchdata.io/pricing)
- **Input (VERIFIED skip-tracing-api page):** live test form takes Address/City/State/Zip (property). Name/business/LLC are not listed as inputs. Marketing copy says it "connects LLCs and trusts to the individuals who own them" and claims 76% right-party-contact rate (vendor claim).
- **Output:** phones (mobile/landline flag), emails, mailing address. Owner name not explicitly listed as an output field on the API page.
- **Lead-gen allowed?** ToS (VERIFIED, batchdata.io/terms-of-service): internal use + "Permissible Purpose" only; marketing/telemarketing allowed only "in strict compliance with all governing laws"; §6.12 you must have "independently obtained all consents" for telemarketing/lead-gen/mass marketing; §6.15 DPPA — no soliciting individuals with DPPA data; not a consumer report (§6.13). So: tolerated for B2B owner outreach if you own TCPA compliance, but the minimum is a $2k/mo plan.
- **SMB fit:** poor as a *business*-keyed lookup; it is a property-owner tool. Would require you to first find the owner's name or home address elsewhere.

### Datazapp — VERIFIED pricing page (datazapp.com/pricing, "Updated 2026")
- **Append prices (per matched record):** Email Append $0.03 PAYG / $0.025 at $1k prepay / $0.02 at $2k; Phone Append same; Reverse Email $0.05/0.025/0.02; Demographic $0.01; Phone Scrub $0.005; Email Verification $0.005. Volume: $0.025 at 40k+, $0.02 at 100k+, $0.0175 at 500k+, $0.015 at 1M+. B2B email LISTS $0.06/0.05/0.04. **$125 PAYG minimum**, $0 minimum on prepaid; API only on prepaid; credits never expire; no contracts.
- **Business-owner append:** The site has **no "business owner append" page** (my guess URL /business-owner-append was 404; nav has none). The /data-append/ page (VERIFIED) lists B2B appends: "Contact Name and Title, B2B email, direct-dial phone, SIC/NAICS, LinkedIn URL, revenue, employee size" — but does not state that business name + address is the match key.
- **Related list product (VERIFIED /b2b-contacts-cell/):** "Small Business Prospecting Lists with Owner Cell Phones" $0.04/record; claims 23M businesses, 12M small businesses, **2.3M business owners**, 12M cell numbers; title filter includes OWNER/PARTNER/PRINCIPAL. This is a LIST (you filter their DB), not an append — but it proves they hold owner-name + cell at the small-business level, so a custom match against your Maps file is plausible via their free match report.
- **REI skip tracing (VERIFIED /skip-tracing-real-estate-marketing/):** property-owner data $0.04 PAYG; accepts address-only files and appends owner names from property records. Does not say it accepts business/LLC names.
- **Lead-gen allowed?** Yes — it is a marketing-data company (direct-mail/telemarketing lists). Terms not fetched.
- **SMB evidence:** none published beyond the 2.3M-owner claim. Trustpilot 4.3/15 reviews (UNVERIFIED, search snippet).

### Versium REACH (and ex-Datafinder) — VERIFIED pricing page (versium.com/pricing)
- **PAYG:** $125 minimum per file, $0.05-0.075 per match credit. **Credit packages:** from $250, 5k-500k credits, $0.02-0.05/credit, never expire. **Annual:** from $5,000/yr (250k credits), <$0.02 (FAQ ~ $0.017; <$0.01 high tiers), API + MCP server included.
- **B2B2C (VERIFIED versium.com/reach/b2b2c):** "Consumer to Business Append (C2B)" = start from a consumer email, get the business person + firmographics. "Business Online Audience Append" adds B2B2C online contact points. No product is described as business -> owner. Match rates not published; free "List Insights" preview of match rate before buying.
- **Datafinder:** VERIFIED datafinder.com — decommissioned 2026-04-01, folded into REACH.
- **Lead-gen allowed?** Yes (marketing data platform; CCPA-compliant consumer data).
- **SMB evidence:** none; Datarade listing claims ">70% match" for consumer contact append (UNVERIFIED, datarade.ai, undated).
- **Verdict:** Worth a free List-Insights test with a business-name+address+phone file; the phone column is probably the usable key (their consumer graph has 300M consumers / phones). Do not assume owner names come back.

### Tracers — pricing not published
- Homepage (VERIFIED tracers.com): for law enforcement, investigators, collections, corporations, financial services, insurance, legal; FCRA disclaimer; "List Generation and Data Augmentation" appears as a menu item under Financial Services. /pricing and /terms-of-service 404.
- UNVERIFIED third-party: $39/user/mo starting (Capterra, Clio); 2022 school-district quote $39 site fee + $10 per premium hit; BBB offer $250/user/mo vs "typically $1,000+"; batch/API quoted separately (tracers.com FAQ snippet). Permissible-purpose selection required at search time (industry practice).
- **Verdict:** investigative tool; business-name search exists but per-hit pricing is in the $1-10 range and marketing use is not an advertised purpose.

### IDI / idiCORE, TLOxp (TransUnion), LexisNexis Accurint, Equifax — not published
- All are credentialed, permissible-purpose platforms. Accurint GLBA permissible-use list (VERIFIED secure.accurint.com page via search snippet quote) contains no marketing category; Equifax Contact & Locate dataset terms restrict use to GLBA-consistent purposes. Competitor estimates (BatchData blog, UNVERIFIED): TLO $0.25-1.00+/record, IDI $0.50-2.00. **Not usable for cold outreach to business owners; omit.**

### Skip Genie / REISkip / PropStream / DirectSkip / Skip Trace Depot / Skip Sherpa / LeadSherpa
- **REISkip (VERIFIED reiskip.com/pricing):** $0.15/match "introductory"; Bulk min 50 matches, Volume min 1,001; outputs phones, emails, property data; no LLC feature on the page.
- **PropStream (VERIFIED propstream.com/pricing):** Essentials $99/mo, Pro $199, Elite $699; skip tracing 12c/contact (Essentials), 10c (Pro/Elite). No LLC-owner product named.
- **Skip Genie:** pricing page 404; UNVERIFIED $58/mo incl. 100 searches, $0.17/extra (resimpli.com, 2026).
- **DirectSkip:** domain redirects to an "easylists" affiliate page — effectively defunct.
- **Skip Trace Depot (VERIFIED skiptracedepot.com/pricing):** per HIT $0.12 (1-500 rows) down to $0.035 (25k+); misses free; input = property list; outputs phones/emails/addresses. Capterra listing (UNVERIFIED, 2026) says base $0.04 + **$0.21 per successful LLC/trust/estate trace** — the only vendor I found pricing an entity-to-person pierce explicitly; Capterra blocked fetch (403).
- **Skip Sherpa API (VERIFIED skipsherpa.com):** $30/mo incl. 200 hits then $0.15/hit, or $100/mo incl. 1,000 then $0.10; REST API, 6 endpoints incl. "Business Search" and "Entity Lookup"; outputs include business name, **business owner, business person, entity type**, owner phones/emails, DNC flags. Input: "owner name or address". Hit rates not published. Permitted uses listed: RE investors, home-service lead-gen, collectors, process servers; TCPA compliance on you. **Closest cheap API to "entity -> owner" in the RE stack; needs a 50-row test with business names.**
- **LeadSherpa:** help pages 403; UNVERIFIED (help.leadsherpa.com snippet) $0.09-0.15/record, hits only, returns up to 3 business/person owners per property.

### Melissa Business Coder / Personator — VERIFIED
- **Fields (VERIFIED docs.melissa.com reference guide):** Business Coder accepts CompanyName + Address/Phone/WebAddress/Ticker; returns firmographics (EIN, SIC/NAICS, employees, sales) and an optional **Contacts** array with NameFirst, NameLast, Gender, Title, Email, ContactPhone (must request "Contacts" column). Result codes FS01-FS08 (FS07 = matched on web address, FS05 = on phone).
- **Price (VERIFIED melissa.com/pricing):** credits $0.004 (10k for $40), $0.0035 (100k/$350), $0.0032 (1M/$3,200); Business Coder also sold as $8,000/yr subscription for 100k records (=$0.08/record). Credits per Business Coder lookup not shown on the pricing page; UNVERIFIED 15 credits/record (yespress.io, undated) => ~$0.05-0.06/record.
- **Coverage:** ~25M US businesses (2016 launch PR, UNVERIFIED). Contacts are the InfoUSA/Data-Axle-style compiled executive, i.e., coverage on 1-5 employee firms is unknown; free 1,000 credits/mo dev account (UNVERIFIED) lets you test.
- **Lead-gen allowed?** Yes (marketing data vendor).

### Experian BizID — not published
- Fact sheet (PDF fetched but encrypted/unreadable). Search snippet: covers business principal/owner name, address, SSN, DOB, DL — i.e., FCRA/GLBA-gated identity verification for lenders. Not for marketing. Equifax likewise. Omit.

### Lead411 / Clearbit
- Lead411 pricing page 403. UNVERIFIED: $99/user/mo for 200 contacts (Capterra), $49/mo entry (ZoomInfo comparison). B2B SaaS-centric; no SMB owner claims.
- Clearbit is now HubSpot Breeze Intelligence, only inside HubSpot; no per-record price published. Omit.

## B. Business databases with contact names

### Data Axle (Genie / Salesgenie / Data Axle USA) — list prices not published
- dataaxleusa.com/pricing 404; dataaxlegenie.com -> salesgenie.com/pricing 404; business-lists page (VERIFIED salesgenie.com/lists/business-lists/) says each record includes email, mailing address, phone — executive name not mentioned; 50% cancellation fee. UNVERIFIED: Genie $99/$149/$299 per month, 12-month contract (G2, SyncGTM 2026); API $50-75 per 1,000 business records (FullEnrich, UNVERIFIED). Data Axle's compiled file does carry an "executive" name on most records (it is the same file Melissa resells), so Melissa Business Coder is the cheaper API door into it.

### Dun & Bradstreet (Hoovers / Direct+ Principals & Contacts) — not published
- Direct+ docs behind Okta login. UNVERIFIED: Hoovers Essentials $49/mo for 150 company + 150 contact credits (several 2026 sources); Direct+ Data Blocks on enterprise contracts. D&B principals exist for most registered entities, but small-business DUNS records often carry only the owner as "principal" when self-reported. Not price-competitive at $0.05-0.30.

### ZoomInfo / Apollo / Seamless / Lusha / Cognism
- **Lusha (VERIFIED lusha.com/pricing):** Starter $49.90/mo 400 credits; Pro $69.90/600; Premium $399.90/3,400; email 1 credit (~$0.09-0.125), phone 5 credits (~$0.44-0.62). No SMB claims.
- **Apollo (VERIFIED apollo.io/pricing):** plan prices not on the fetched page; owner-list page (VERIFIED) claims only "thousands of verified business owner contacts" — no small-business coverage figure.
- ZoomInfo/Seamless/Cognism: not fetched; reviews (UNVERIFIED) flag missing/incorrect data for 1-5 employee companies. LinkedIn-derived databases structurally miss plumbers/salons/landscapers without LinkedIn. **Omit as primary source; useful only as the "find mobile from name" step after you have a name.**

### Clay waterfall — VERIFIED pricing + SMB page
- Pricing (VERIFIED clay.com/pricing): Free 100 credits; Launch $167/mo headline ($185 in FAQ) 3,000 credits; Growth $446 ($495) 6,000; data credits ~$0.05 each falling to ~$0.0425 at 50k/mo; actions <$0.01.
- SMB waterfall (VERIFIED clay.com/tools/generate-plumbing-leads): "SMBs – Find and Verify Decision Makers" starts from Clay's Google Maps integration; named providers Prospeo, Apollo, Lusha (decision maker) and Datagma, Hunter (email, ">97% confidence" in Clay's own test of 178 Phoenix HVAC firms). No hit-rate for *owner name* published. Credits only charged on match. Realistically 2-5 credits per found owner => $0.10-0.25/hit, but the underlying providers are the same LinkedIn-derived ones, so expect low hit rate on non-LinkedIn trades.

### People Data Labs — VERIFIED
- Person: Free 100/mo (contact fields obfuscated); Pro from $98/mo for 350 credits (~$0.28/record); Enterprise custom. Company: Pro $100/mo from 1,000 records (~$0.10). Per-record list price not shown. Charges per match. Coverage is resume/LinkedIn-derived — weak on micro-businesses.

### Coresignal — VERIFIED coresignal.com/pricing
- Mini $49/mo 2,500 credits ... Elite $5,000/mo 10M; full employee or company record = 20 credits (Core 10) => $0.39/record on Mini down to $0.01 on Elite; employee contact enrichment 10 credits per email. LinkedIn-derived; same SMB gap.

### Enigma — VERIFIED pricing (enigma.com/pricing) and docs
- **Pricing:** Free plan (view/search); Pro $20/mo (2,100 credits); Max $200/mo (25,000); prepaid bundles $100-1,000; Enterprise custom. Credit = $0.01. Enrichment billed per *returned* field: **Person name 1 credit ($0.01)**, Person email 8 credits ($0.08), Address $0.02, Industry $0.05, Card revenue $0.25; KYB Identify $1.50, KYB Verify $2.50 per matched business; Person Screening $0.50.
- **Data model (VERIFIED documentation.enigma.com/reference/data/):** entities Brand, Operating Location, Legal Entity, **Person ("A natural person associated with a business as an owner, officer, or contact")**, Registration, Role; Brand/Operating Location carry "Registrations - People" and "Contacts" attributes; Role links to Email Address and Phone Number. Registrations come from SOS filings, so people coverage will mirror officer-publishing states (same ~31-state limitation as free SOS scraping) plus website/other contacts.
- **Input:** business name + address (+ website, phone) — exactly the Maps payload; match-first then pay per fill.
- **Lead-gen allowed?** Enigma sells to fintech/marketing ("Is Marketable" attribute exists); ToS not fetched — confirm before scale.
- **Verdict:** cheapest verified business-keyed owner-name API ($0.01 per name returned, ~$0.03-0.05 all-in with address/industry fills). Hit rate on tiny firms unknown; the $20 Pro plan is enough to test 500-1,000 Maps rows.

### Middesk — price not published
- /pricing 404. UNVERIFIED: business-onboarding page "custom <50 businesses/mo; from $1,000/mo for 50+" (middesk.com snippet); Vendr median contract $11,875/yr. Returns SOS people (officers) as part of KYB. Compliance product; lead-gen use is off-label. Not under $1/lookup.

### Cobalt Intelligence — price not published
- /pricing 403 today. Vendor blog (VERIFIED fetch, dated June 2025): credit model, 1 credit = 1 SOS lookup, 3 credits for all-50-state live search, cached DB cheaper, illustrative example "$750 for 1,000 lookups" (=$0.75), billed monthly in arrears, annual discount. Officers/directors returned where the state publishes them. Real-time scrape of SOS sites (solves your datacenter-IP blocks). Sold to lenders but no stated use restriction.

### Baselayer — price not published
- /pricing 503/404. Docs (VERIFIED docs.baselayer.com business-search-basics): POST /searches with name, address, TIN, officers; returns directors, managers, registered agents (names + addresses), 50 states + DC + PR; no pricing/credits in docs. Series-A KYB vendor; expect $1+/search on contract.

### OpenCorporates — VERIFIED pricing
- API Essentials £2,250/yr (or £225/mo) for 500 calls/mo (=£0.375/call at full use); Starter £6,600/yr 2,500/mo; Basic £12,000/yr 5,000/mo; Enterprise bulk custom. Officer inclusion and US-state officer coverage not stated on the pricing page (their officer data for US states is limited to what each SOS publishes). Too expensive per call for lead-gen volume.

### Bizapedia Pro — price not published (page is a bot-check wall)
- Pro Search: "nearly unlimited searches", 5x match limit, shows contact emails/phones where collected; Pro API (REST) exists; Pro Data = weekly new-formation lists for 50 states. Officers/members shown on entity pages for officer-publishing states. No price visible; UNVERIFIED historical ~$29-99/mo. Terms prohibit scraping; API terms not seen.

### Outscraper — VERIFIED pricing
- Google Maps $3/1,000 (501-100k), $1/1,000 after; Emails & Contacts $3/1,000 domains; Phone Number Lookup $5/1,000; first 500 free. **No product returns an owner/executive name** (emails, phones, socials only).

### Exa / Perplexity (agentic search as owner finder) — VERIFIED Exa pricing
- Exa search $4/1,000 (lite) to $12-15/1,000 (deep); contents $1/1,000 pages; Answer $5/1,000; Agent runs $0.012-1.00 each, with $0.02 per email found and $0.07 per phone found via Exa Connect. Perplexity Sonar (UNVERIFIED docs snippet): $5-12 per 1,000 requests + tokens; standalone Search API $5/1,000. => An LLM-driven "who owns X in city Y" with 3-5 searches costs ~$0.02-0.06 per business before model tokens; this is essentially what your current 51% LinkedIn/web pipeline already does, just via a different search backend.

## C. "Google Maps leads with owner name" tools
| Tool | Owner name? | Source of the name | Price (VERIFIED unless noted) |
|---|---|---|---|
| Outscraper | No | — | $3/1k places; $3/1k domains for emails |
| Scrap.io | No field listed | — | $49-499/mo, 10k-100k exports (~$3.5-5 per 1k places); fields not itemized |
| D7 Lead Finder | No (fields list has business name + email only) | — | plans not shown on site; UNVERIFIED $44.99-119.99/mo |
| LeadsGorilla | Not mentioned | Google/FB/Yelp live queries | $57/$77/$97 per month (VERIFIED homepage); uses your Google API quota |
| LeadSwift | Not mentioned | Maps/Yelp/FB/YP | $24.99/$49.99/$99.99 per month (50% off banner), 1/5/20 searches per day |
| SignalHire | Person-keyed, not business-keyed | LinkedIn | UNVERIFIED $49-139/mo credit plans |
| Lead Scrape | not found | — | not found |
| **Apify: compass/crawler-google-places** "Business leads enrichment" add-on | Yes: full name, job title, work email, mobile, LinkedIn | third-party B2B DB (unnamed); only places with website; chains excluded | $0.005/lead record (SILVER); base $0.002/place |
| **Apify: vijaya_jayaraj/lead-intelligence-enricher** | Yes: owner_name, owner_title, confidence, source URL | LLM over the business website /about /team with verbatim-quote guard | **$0.01 per business with a non-null result**, $0 on miss; self-reported precision 68.8%, recall 45.8% on 154 labeled rows; 1 user, 0% success rate shown — immature |
| **Apify: inovaflow/local-business-email-finder** | Yes: ownerName, ownerTitle | website crawl + web-search pattern match; AI only for fit scoring | $0.03 per business with ≥1 email (free if no email); 92 users, 99.7% success; no hit-rate published |
| Apify: apivault_labs/apify-actor-local-leads | `extractOwnerName` flag | business website | $0.0015-0.007 per delivered lead; "not promised for every business", "requires review" |
| Apify: khadinakbar/skip-trace-property-owner | Property address -> owner | public records | $0.12 per owner found |

Takeaway: none of the Maps-lead SaaS tools return owner names from records; the Apify actors that do are all website-text extraction (same source as your own crawl), priced $0.01-0.03 per hit.

## D. Ranked table

| # | Vendor | Input | Returns owner name? | Mobile/email? | Price per record | Minimum | SMB coverage evidence | Lead-gen allowed? |
|---|---|---|---|---|---|---|---|---|
| 1 | Enigma (VERIFIED) | name+address (+web, phone) | Yes (Person: owner/officer/contact; SOS registrations + contacts) | email $0.08/fill; phone via Role | $0.01 per name fill; ~$0.03-0.05 all-in | $20/mo Pro or $100 bundle | none published; SOS-derived so ~31 officer states | Likely (marketing attrs exist); ToS unchecked |
| 2 | Datazapp (VERIFIED prices) | list match; business key unconfirmed | "Contact Name and Title" B2B append; owner-cell LIST $0.04 | cell + email | $0.02-0.03/match | $125 PAYG | claims 12M small biz, 2.3M owners w/ cell | Yes |
| 3 | Apify inovaflow / vijaya_jayaraj (VERIFIED) | name+city or domain | Yes (website text) | emails (verified), phones | $0.01-0.03 per hit, $0 miss | none | 69% precision / 46% recall self-reported | Yes (public web) |
| 4 | Melissa Business Coder (VERIFIED fields) | company+address/phone/web | Yes (Contacts: first/last/title/email/phone) | email, phone | ~$0.05-0.06 (15 cr UNVERIFIED) or $0.08 sub | $40 credit pack | Data Axle compiled execs; micro-biz unknown | Yes |
| 5 | Skip Sherpa API (VERIFIED) | owner name or address; "Business Search/Entity Lookup" | Yes (business owner / business person) | mobiles, emails | $0.10-0.15/hit | $30/mo | none | RE/home-service lead-gen listed; TCPA on you |
| 6 | Versium REACH (VERIFIED) | consumer keys (phone/email/name) | Not for business->owner; C2B is email->business person | mobile, email | $0.05-0.075 PAYG; $0.02-0.05 packs | $125/file; $250 pack | none for owners | Yes |
| 7 | Clay SMB waterfall (VERIFIED) | Maps row | Via Prospeo/Apollo/Lusha | via Datagma/Hunter | ~$0.10-0.25 effective | $167/mo | HVAC Phoenix test, email only | Yes |
| 8 | Skip Trace Depot (VERIFIED base; LLC fee UNVERIFIED) | property list | LLC/trust pierce $0.21/hit (Capterra) | phones, emails | $0.035-0.12/hit | $1 | none | RE marketing; TCPA on you |
| 9 | BatchData (VERIFIED) | property address | claims LLC->person | mobile, email | ~$0.007-0.02 only at 100k+/mo | $2,000/mo | 76% RPC claim | Conditional (ToS §6.12 consents) |
| 10 | Cobalt Intelligence (blog, Jun 2025) | name+state | Yes (SOS officers where published) | no | ~$0.75 illustrative; not published | monthly plan | mirrors SOS | unstated |
| 11 | Baselayer / Middesk | name+address | Yes (SOS officers/managers) | no | not published; Middesk from $1,000/mo (UNVERIFIED) | contract | mirrors SOS | KYB only |
| 12 | OpenCorporates (VERIFIED) | name | officers where state publishes | no | £0.375/call at Essentials | £2,250/yr | mirrors SOS | internal+external use |
| 13 | PDL / Coresignal / Lusha / Apollo / ZoomInfo | name or domain | only if owner on LinkedIn | yes | $0.09-0.39 | $49-98/mo | reviews: weak <10 employees | Yes |
| 14 | D&B Direct+ / Hoovers | name+address | principals | partial | not published; $49/mo Hoovers Essentials (UNVERIFIED) | contract | principals thin for micro-biz | Yes |
| 15 | Tracers / IDI / TLOxp / Accurint / Experian BizID / Equifax | person/business | Yes (deep) | yes | $1-10/hit, not published | credentialing | strong | **No** (GLBA/DPPA permissible purpose) |
| 16 | Outscraper / Scrap.io / D7 / LeadsGorilla / LeadSwift | category+city | **No** | business email/phone | $3-5 per 1k places | $25-49/mo | n/a | Yes |

## Recommendations for a $0.05-0.30 per-business budget
1. **Run a 500-row Enigma test first** ($20 Pro plan): match Maps rows by name+address+phone, request only Person name (+Role) fills. If people coverage ≥40% on your 381-row benchmark, it is the cheapest paid owner source at ~$0.01-0.05/row and can be a tier between free SOS and web search.
2. **Send the same 500 rows to Datazapp's free match report and Versium's free List Insights** (zero cost). Ask Datazapp explicitly for the "Contact Name and Title" B2B append keyed on business name+address+phone; ask Versium for C2B/B2B2C keyed on the business phone. If either returns >50% owner names, PAYG at $0.02-0.075/match beats everything else.
3. **Add an Apify website-owner extractor as a cheap tier** (inovaflow $0.03/hit or vijaya_jayaraj $0.01/hit, misses free) only if it beats your in-house site crawl; it is the same source, so test on the ~49% misses. Skip Melissa Business Coder unless Enigma/Datazapp fail (~$0.05-0.08, same compiled-executive file as Data Axle). Do not buy SOS-API resellers (Cobalt/Middesk/Baselayer/OpenCorporates, $0.40-2.50) or credentialed skip-trace (Tracers/IDI/TLO) for this use case.
