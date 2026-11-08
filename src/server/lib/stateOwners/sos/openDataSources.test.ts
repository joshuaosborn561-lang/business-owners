import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LookupContext } from './context.js';
import {
  looseNameMatch,
  openDataSourcesFor,
  phoneDigits,
  queryTokens,
  resolveChicago,
  resolveFmcsa,
  resolveNppes,
  resolveOpenDataOwners,
  resolvePaOpenData,
  resolveTxTabc,
  resolveCaLaFbn,
  resolveCaSfRegistry,
  resolveCaAbc,
  resetCaAbcCache,
  abcPersonName,
  resolveTxTdlr,
  resolveAkBusinessLicense,
  resolvePhiladelphia,
  sodaLike,
  titleRank,
} from './openDataSources.js';
import { isWaterfallReady } from './waterfall.js';

function fakeFetch(routes: Array<[RegExp, unknown]>): LookupContext['fetch'] {
  return async (input) => {
    const url = String(input);
    const hit = routes.find(([re]) => re.test(url));
    const body = hit ? JSON.stringify(hit[1]) : '[]';
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

describe('open data helpers', () => {
  it('builds selective tokens and SODA where clauses', () => {
    assert.deepEqual(queryTokens('Peachtree Plumbing LLC'), ['PEACHTREE', 'PLUMBING']);
    assert.deepEqual(queryTokens("Bull's Lawn Care Services"), ['BULL', 'LAWN']);
    assert.equal(sodaLike(['business_name'], ['ACME', 'PLUMB']), "upper(business_name) like '%ACME%' AND upper(business_name) like '%PLUMB%'");
    assert.match(sodaLike(['a', 'b'], ['X']) || '', /^\(upper\(a\).*\) OR \(upper\(b\).*\)$/);
  });

  it('matches registry names to Maps trade names loosely but not wildly', () => {
    assert.equal(looseNameMatch('PEACHTREE PLUMBING, LLC', 'Peachtree Plumbing'), 'exact');
    assert.equal(looseNameMatch('Peachtree Plumbing', 'Peachtree Plumbing - Marietta'), 'exact');
    assert.equal(looseNameMatch('PEACHTREE PLUMBING LLC', 'Peachtree Plumbing & Drain Experts'), 'substring');
    assert.equal(looseNameMatch('PEACH', 'Peachtree Plumbing'), null);
    assert.equal(looseNameMatch('TOTALLY DIFFERENT CO', 'Peachtree Plumbing'), null);
  });

  it('normalizes phones and ranks owner titles first', () => {
    assert.equal(phoneDigits('(770) 555-1234'), '7705551234');
    assert.equal(phoneDigits('+1 770 555 1234'), '7705551234');
    assert.equal(phoneDigits('555-1234'), null);
    assert.ok(titleRank('Owner') < titleRank('President'));
    assert.ok(titleRank('Managing Member') < titleRank('Secretary'));
    assert.ok(titleRank('Organizer') > titleRank('Governor'));
  });

  it('runs national overlays for every state and state files where they exist', () => {
    assert.deepEqual(openDataSourcesFor('PA'), ['fmcsa', 'cms_owners', 'nppes', 'pa_dos', 'phl_bl', 'form5500']);
    assert.deepEqual(openDataSourcesFor('ny'), ['fmcsa', 'cms_owners', 'nppes', 'nyc_dob', 'ny_dmv', 'ny_corp_ceo', 'form5500']);
    assert.deepEqual(openDataSourcesFor('OH'), ['fmcsa', 'cms_owners', 'nppes', 'form5500']);
    assert.deepEqual(openDataSourcesFor('CA'), ['fmcsa', 'cms_owners', 'nppes', 'ca_la_fbn', 'ca_sf_reg', 'ca_abc', 'form5500']);
    assert.deepEqual(openDataSourcesFor('TX'), ['fmcsa', 'cms_owners', 'nppes', 'tx_tdlr', 'tx_tabc', 'form5500']);
    assert.deepEqual(openDataSourcesFor('AK'), ['fmcsa', 'cms_owners', 'nppes', 'ak_bl', 'form5500']);
  });
});

describe('Pennsylvania open data', () => {
  const rows = [
    { business_name: 'Peachtree Plumbing LLC', filing_number: '1', city: 'Pittsburgh', party_type: 'Organizer', first_name: 'Legal', last_name: 'Zoom' },
    { business_name: 'Peachtree Plumbing LLC', filing_number: '1', city: 'Pittsburgh', party_type: 'Governor', first_name: 'Dana', last_name: 'Reyes' },
    { business_name: 'Peachtree Plumbing LLC', filing_number: '2', city: 'Erie', party_type: 'Governor', first_name: 'Other', last_name: 'Person' },
  ];
  it('groups by filing, prefers the city match, and ranks Governor above Organizer', async () => {
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/xvd7-5r2c/, rows]]) };
    const r = await resolvePaOpenData({ company_name: 'Peachtree Plumbing', city: 'Pittsburgh', state: 'PA' }, ctx);
    assert.ok(r && r.people.length >= 1);
    assert.equal(r!.people[0].first_name?.toUpperCase(), 'DANA');
    assert.equal(r!.people[0].last_name?.toUpperCase(), 'REYES');
    assert.equal(r!.source, 'open_data');
    assert.equal(r!.open_data_source, 'pa_dos');
    assert.ok(isWaterfallReady(r!.people[0]), 'exact + city match + labeled officer is waterfall-ready');
  });
  it('refuses an ambiguous no-city match', async () => {
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/xvd7-5r2c/, rows]]) };
    const r = await resolvePaOpenData({ company_name: 'Peachtree Plumbing', city: 'Scranton', state: 'PA' }, ctx);
    assert.equal(r, null);
  });
});

describe('FMCSA census', () => {
  const rows = [
    { dot_number: '1', legal_name: 'ALBERT FRANKS', dba_name: 'SOUTH COAST TRUCKING', phy_city: 'HOUSTON', phy_state: 'TX', phone: '7135550100', cell_phone: '', company_officer_1: 'ALBERT L FRANKS', company_officer_2: 'ANTHONY L FRANKS', email_address: 'al@example.com', status_code: 'A' },
  ];
  it('joins on the Maps phone and carries email + officers through', async () => {
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/az4n-8mr2/, rows]]) };
    const r = await resolveFmcsa({ company_name: 'South Coast Trucking', city: 'Houston', state: 'TX', phone: '(713) 555-0100' }, ctx);
    assert.ok(r);
    assert.equal(r!.people[0].last_name?.toUpperCase(), 'FRANKS');
    assert.equal(r!.people[0].email, 'al@example.com');
    assert.equal(r!.people.length, 2);
    assert.ok(isWaterfallReady(r!.people[0]));
  });
});

describe('NPPES', () => {
  const payload = {
    results: [
      {
        basic: { organization_name: 'BRIGHT SMILES DENTAL PLLC', authorized_official_first_name: 'MARIA', authorized_official_last_name: 'LOPEZ', authorized_official_title_or_position: 'OWNER/DENTIST', authorized_official_telephone_number: '2145550000', status: 'A' },
        addresses: [{ address_purpose: 'LOCATION', city: 'DALLAS', telephone_number: '2145550001' }],
      },
      {
        basic: { organization_name: 'BRIGHT SMILES DENTAL PLLC', authorized_official_first_name: 'SAM', authorized_official_last_name: 'CLERK', authorized_official_title_or_position: 'OFFICE MANAGER', status: 'A' },
        addresses: [{ address_purpose: 'LOCATION', city: 'PLANO', telephone_number: '9725550001' }],
      },
    ],
  };
  it('names the authorized official and flags non-owner titles for review', async () => {
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/npiregistry/, payload]]) };
    const dallas = await resolveNppes({ company_name: 'Bright Smiles Dental', city: 'Dallas', state: 'TX' }, ctx);
    assert.ok(dallas);
    assert.equal(dallas!.people[0].last_name?.toUpperCase(), 'LOPEZ');
    assert.ok(isWaterfallReady(dallas!.people[0]));
    const plano = await resolveNppes({ company_name: 'Bright Smiles Dental', city: 'Plano', state: 'TX' }, ctx);
    assert.ok(plano);
    assert.equal(plano!.people[0].review_flag, true);
    assert.ok(!isWaterfallReady(plano!.people[0]), 'an office manager is a contact, not an owner');
  });
});

describe('TABC and Chicago', () => {
  it('passes the legal entity name on when the TABC owner is an LLC', async () => {
    const rows = [{ trade_name: 'THE RUSTY NAIL', owner: 'RN HOSPITALITY GROUP LLC', city: 'AUSTIN', phone: '5125550101', license_status: 'Active' }];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/7hf9-qc9f/, rows]]) };
    const r = await resolveTxTabc({ company_name: 'The Rusty Nail', city: 'Austin', state: 'TX' }, ctx);
    assert.equal(r.result, null);
    assert.equal(r.legal_name, 'RN HOSPITALITY GROUP LLC');
  });
  it('joins Chicago licenses to the owners file by account number', async () => {
    const licenses = [{ account_number: '77', legal_name: 'WINDY CITY PLUMBING INC', doing_business_as_name: 'WINDY CITY PLUMBING', license_status: 'AAI' }];
    const owners = [
      { account_number: '77', owner_first_name: 'TOM', owner_last_name: 'KOWALSKI', owner_title: 'PRESIDENT' },
      { account_number: '77', owner_first_name: 'ANN', owner_last_name: 'KOWALSKI', owner_title: 'SECRETARY' },
    ];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/r5kz-chrr/, licenses], [/ezma-pppn/, owners]]) };
    const r = await resolveChicago({ company_name: 'Windy City Plumbing', city: 'Chicago', state: 'IL' }, ctx);
    assert.ok(r);
    assert.equal(r!.people[0].first_name?.toUpperCase(), 'TOM');
    assert.equal(r!.people[0].title, 'President');
    const elsewhere = await resolveChicago({ company_name: 'Windy City Plumbing', city: 'Naperville', state: 'IL' }, ctx);
    assert.equal(elsewhere, null);
  });
});

describe('dispatcher', () => {
  it('stays offline without live or an injected fetch, and stops at the first named person', async () => {
    const offline = await resolveOpenDataOwners({ company_name: 'Anything', city: 'X', state: 'PA' }, { live: false });
    assert.equal(offline.result, null);
    assert.deepEqual(offline.sources_tried, []);
    const rows = [{ business_name: 'Keystone Roofing LLC', filing_number: '9', city: 'York', party_type: 'Member', first_name: 'Ed', last_name: 'Stoltzfus' }];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/xvd7-5r2c/, rows]]), openDataSources: ['pa_dos'] };
    const r = await resolveOpenDataOwners({ company_name: 'Keystone Roofing', city: 'York', state: 'PA' }, ctx);
    assert.deepEqual(r.sources_tried, ['pa_dos']);
    assert.equal(r.result?.people[0].last_name?.toUpperCase(), 'STOLTZFUS');
  });
});

describe('NY DMV entity owners', () => {
  it('does not treat a split corporate owner name as a person and passes it on as the legal name', async () => {
    const { resolveNyDmv } = await import('./openDataSources.js');
    const rows = [{ facility_name: 'BROOKLYN AUTO REPAIR', facility_city: 'BROOKLYN', owner_name: 'SULTAN PETROLEUM', owner_name_overflow: 'CORP' }];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/nhjr-rpi2/, rows]]) };
    const r = await resolveNyDmv({ company_name: 'Brooklyn Auto Repair', city: 'Brooklyn', state: 'NY' }, ctx);
    assert.equal(r.result, null);
    assert.equal(r.legal_name, 'SULTAN PETROLEUM CORP');
  });
});

describe('owner titles', () => {
  it('strips the person name and junk from a scraped title', async () => {
    const { cleanTitle } = await import('./ownerHits.js');
    assert.equal(cleanTitle('Owner Michael Jordan', 'Michael', 'Jordan'), 'Owner');
    assert.equal(cleanTitle('Owner And Master Plumber.', 'Donna', 'Moore'), 'Owner and Master Plumber');
    assert.equal(cleanTitle(null), null);
  });
});

function arcgis(rows: Array<Record<string, unknown>>) {
  return { features: rows.map((attributes) => ({ attributes })) };
}

/** Build a one-entry deflated zip in memory (what the CA ABC export looks like). */
async function zipOf(name: string, text: string): Promise<Buffer> {
  const { deflateRawSync, crc32 } = await import('node:zlib');
  const data = Buffer.from(text, 'latin1');
  const comp = deflateRawSync(data);
  const fn = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fn.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(fn.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = 30 + fn.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + fn.length, 12); eocd.writeUInt32LE(cdOff, 16);
  return Buffer.concat([local, fn, comp, cd, fn, eocd]);
}

describe('California open data', () => {
  it('LA County FBN: names every person owner on the filing and skips abandoned owners', async () => {
    const rows = [
      { FilingNumber: '1', FiledTS: 2, FilingType: 'FBN Statement', BusinessName: 'LANZA MEAT CO.', BusinessCity: 'LOS ANGELES', RegisteredOwnerName: 'OTILIO RENE LANZA' },
      { FilingNumber: '1', FiledTS: 2, FilingType: 'FBN Statement', BusinessName: 'LANZA MEAT CO.', BusinessCity: 'LOS ANGELES', RegisteredOwnerName: 'LUZ MARINA MARTINEZ' },
      { FilingNumber: '0', FiledTS: 1, FilingType: 'FBN Statement', BusinessName: 'GAEL PLUMBING', BusinessCity: 'SYLMAR', RegisteredOwnerName: 'THALIA MORENO' },
      { FilingNumber: '9', FiledTS: 3, FilingType: 'FBN Abandonment', BusinessName: 'GAEL PLUMBING', BusinessCity: 'SYLMAR', RegisteredOwnerName: 'THALIA MORENO' },
    ];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/Fictitious_Business_Name/, arcgis(rows)]]) };
    const r = await resolveCaLaFbn({ company_name: 'Lanza Meat Co', city: 'Los Angeles', state: 'CA' }, ctx);
    assert.equal(r.result?.people.length, 2);
    assert.equal(r.result?.open_data_source, 'ca_la_fbn');
    assert.ok(isWaterfallReady(r.result!.people[0]));
    const gone = await resolveCaLaFbn({ company_name: 'Gael Plumbing', city: 'Sylmar', state: 'CA' }, ctx);
    assert.equal(gone.result, null);
  });

  it('LA County FBN: passes an LLC registrant on as the legal name', async () => {
    const rows = [{ FilingNumber: '5', FiledTS: 1, FilingType: 'FBN Statement', BusinessName: "OSCAR'S PLUMBING & ROOTER", BusinessCity: 'PASADENA', RegisteredOwnerName: 'ANDERSEN COMMERCIAL PLUMBING, LLC' }];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/Fictitious_Business_Name/, arcgis(rows)]]) };
    const r = await resolveCaLaFbn({ company_name: "Oscar's Plumbing & Rooter", city: 'Pasadena', state: 'CA' }, ctx);
    assert.equal(r.result, null);
    assert.equal(r.legal_name, 'ANDERSEN COMMERCIAL PLUMBING, LLC');
  });

  it('SF registry: ownership_name for a DBA', async () => {
    const rows = [{ ownership_name: 'Gregory Alexander Bianchi', dba_name: 'Get Griit', city: 'San Francisco' }];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/g8m3-pdis/, rows]]) };
    const r = await resolveCaSfRegistry({ company_name: 'Get Griit', city: 'San Francisco', state: 'CA' }, ctx);
    assert.equal(r.result?.people[0].last_name?.toUpperCase(), 'BIANCHI');
  });

  it('ABC export: parses the zip, names sole-prop licensees, passes entities on as legal names', async () => {
    assert.equal(abcPersonName('ROBERTS  DENNIS EARL'), 'DENNIS EARL ROBERTS');
    assert.equal(abcPersonName('HEIRLOOM CAFE LLC'), null);
    const csv = [
      '﻿"Updated Wednesday"',
      '"License Type","File Number","Lic or App","Type Status","Type Orig Iss Date","Expir Date","Fee Codes","Dup Counts","Master Ind","Term in # of Months","Geo Code",District,"Primary Name","Prem Addr 1"," Prem Addr 2","Prem City"," Prem State","Prem Zip","DBA Name","Mail Addr 1","Mail Addr 2","Mail City","Mail State","Mail Zip","Prem County","Prem Census Tract #"',
      '20,00421169,APP,ACTIVE," "," ",P0,"  ",Y,12,4900,27,"ROBERTS  DENNIS EARL","1579 TRINITY RD"," ","GLEN ELLEN",CA,95442,"VALLEY VIEW WINE SALES"," "," "," "," "," ",SONOMA,1505.02',
      '41,00000001,LIC,ACTIVE," "," ",P0,"  ",Y,12,4900,27,"HEIRLOOM CAFE LLC","1 MAIN"," ","SAN FRANCISCO",CA,94110,"HEIRLOOM CAFE"," "," "," "," "," ",SF,1',
      '41,00000002,LIC,SUREND," "," ",P0,"  ",Y,12,4900,27,"GONE  PERSON","1 MAIN"," ","OAKLAND",CA,94110,"OLD BAR"," "," "," "," "," ",AL,1',
    ].join('\r\n');
    const zip = await zipOf('ABC-DailyDataExport.csv', csv);
    resetCaAbcCache();
    const ctx: LookupContext = { live: false, fetch: async () => new Response(zip, { status: 200 }) };
    const sole = await resolveCaAbc({ company_name: 'Valley View Wine Sales', city: 'Glen Ellen', state: 'CA' }, ctx);
    assert.match(sole.result?.people[0].first_name?.toUpperCase() || '', /^DENNIS/);
    assert.equal(sole.result?.people[0].last_name?.toUpperCase(), 'ROBERTS');
    const llc = await resolveCaAbc({ company_name: 'Heirloom Cafe', city: 'San Francisco', state: 'CA' }, ctx);
    assert.equal(llc.result, null);
    assert.equal(llc.legal_name, 'HEIRLOOM CAFE LLC');
    const surrendered = await resolveCaAbc({ company_name: 'Old Bar', city: 'Oakland', state: 'CA' }, ctx);
    assert.equal(surrendered.result, null);
    resetCaAbcCache();
  });
});

describe('TDLR, Alaska, Philadelphia', () => {
  it('TDLR: owner_name behind a business entity, phone match wins', async () => {
    const rows = [
      { business_name: 'PLUMBING DOCTOR INC', owner_name: 'GONZALEZ, MICHAEL JOE', business_city_state_zip: 'EL PASO TX 79901', business_telephone: '9155550100', license_expiration_date_mmddccyy: '08/17/2099' },
      { business_name: 'PLUMBING DOCTOR INC', owner_name: 'OLD, OWNER', business_city_state_zip: 'EL PASO TX 79901', license_expiration_date_mmddccyy: '01/01/2001' },
    ];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/7358-krk7/, rows]]) };
    const r = await resolveTxTdlr({ company_name: 'Plumbing Doctor', city: 'El Paso', state: 'TX' }, ctx);
    assert.equal(r?.people[0].last_name?.toUpperCase(), 'GONZALEZ');
    assert.equal(r?.open_data_source, 'tx_tdlr');
  });

  it('Alaska: person owners on an active license, single-token query (firewall rejects AND)', async () => {
    let seen = '';
    const rows = [{ Owners: "JOSEPH  O'DONNOGHUE", BusinessName: 'KODIAK PLUMBING AND HEATING', Status: 'Active', PhysicalCity: 'KODIAK' }];
    const ctx: LookupContext = {
      live: false,
      fetch: async (u) => {
        seen = decodeURIComponent(String(u));
        return new Response(JSON.stringify(arcgis(rows)), { status: 200 });
      },
    };
    const r = await resolveAkBusinessLicense({ company_name: 'Kodiak Plumbing and Heating', city: 'Kodiak', state: 'AK' }, ctx);
    assert.match(r.result?.people[0].first_name?.toUpperCase() || '', /^JOSEPH/);
    assert.ok(!/ AND /.test(seen.replace(/\+/g, ' ')), 'no AND in the where clause');
  });

  it('Philadelphia: individual license holder named, other cities skipped', async () => {
    const payload = { rows: [{ business_name: 'ROGER ROSS (ROGER ROSS PLUMBING & HEATING)', legalname: 'ROGER ROSS', legalentitytype: 'Individual', legalfirstname: 'ROGER', legallastname: 'ROSS', licensetype: 'Commercial Activity License' }] };
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/phl\.carto\.com/, payload]]) };
    const r = await resolvePhiladelphia({ company_name: 'Roger Ross Plumbing & Heating', city: 'Philadelphia', state: 'PA' }, ctx);
    assert.equal(r.result?.people[0].last_name?.toUpperCase(), 'ROSS');
    const pgh = await resolvePhiladelphia({ company_name: 'Roger Ross Plumbing & Heating', city: 'Pittsburgh', state: 'PA' }, ctx);
    assert.equal(pgh.result, null);
  });
});

describe('NY business corporation CEO', () => {
  it('names the biennial-statement CEO, flips LAST, FIRST, and refuses a corporate CEO', async () => {
    const { resolveNyCorpCeo } = await import('./openDataSources.js');
    const rows = [
      { dos_id: '1', current_entity_name: 'EMPIREWIDGETS INC.', entity_type: 'DOMESTIC BUSINESS CORPORATION', chairman_name: 'EXAMPLE, CASEY', location_city: 'ALBANY', location_zip: '12207' },
      { dos_id: '2', current_entity_name: 'HOLDCO SERVICES INC.', entity_type: 'DOMESTIC BUSINESS CORPORATION', chairman_name: 'PARENT HOLDINGS LLC', location_city: 'BUFFALO' },
    ];
    const ctx: LookupContext = { live: false, fetch: fakeFetch([[/n9v6-gdp6/, rows]]) };
    const r = await resolveNyCorpCeo({ company_name: 'Empire Widgets', city: 'Albany', state: 'NY' }, ctx);
    assert.equal(r?.people[0].first_name?.toUpperCase(), 'CASEY');
    assert.equal(r?.people[0].last_name?.toUpperCase(), 'EXAMPLE');
    assert.equal(r?.people[0].title, 'CEO');
    assert.equal(r?.open_data_source, 'ny_corp_ceo');
    assert.ok(isWaterfallReady(r!.people[0]));
    const corp = await resolveNyCorpCeo({ company_name: 'Holdco Services', city: 'Buffalo', state: 'NY' }, ctx);
    assert.equal(corp, null);
    const farZip = await resolveNyCorpCeo({ company_name: 'Empire Widgets Co', city: 'Troy', state: 'NY', zip: '12180' }, ctx);
    assert.equal(farZip, null);
  });
});
