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
    assert.deepEqual(openDataSourcesFor('PA'), ['fmcsa', 'nppes', 'pa_dos']);
    assert.deepEqual(openDataSourcesFor('ny'), ['fmcsa', 'nppes', 'nyc_dob', 'ny_dmv']);
    assert.deepEqual(openDataSourcesFor('OH'), ['fmcsa', 'nppes']);
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
