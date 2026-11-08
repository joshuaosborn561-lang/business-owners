import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import type { LookupContext } from '../stateOwners/sos/context.js';
import { cmsTypesFor, inputZip5, resolveCmsOwners, resolveForm5500 } from '../stateOwners/sos/openDataSources.js';
import { isWaterfallReady } from '../stateOwners/sos/waterfall.js';
import { cmsIdsFromCatalog, cmsRoleRank, cmsUniverseRow, resetCmsIdsCache, summarizeCmsOwners, CMS_PINNED_IDS } from './cms.js';
import { csvRecords, splitCsvRecord, zipEntryStream } from './csvStream.js';
import { fmcsaUniverseRow, fmcsaWhere } from './fmcsa.js';
import { F5500Accumulator, f5500Filing, PROFESSIONAL_SIGNER_MIN_EINS } from './form5500.js';
import { assertUniverseTable, UniverseStore } from './store.js';
import { isoDate, zip5 } from './types.js';

// All names below are invented. No row comes from a live file.

const owner = (o: Record<string, string>) => ({
  'ENROLLMENT ID': 'O1',
  'TYPE - OWNER': 'I',
  'ROLE TEXT - OWNER': '5% OR GREATER DIRECT OWNERSHIP INTEREST',
  'FIRST NAME - OWNER': '',
  'LAST NAME - OWNER': '',
  'TITLE - OWNER': '',
  'PERCENTAGE OWNERSHIP': '',
  'PRIVATE EQUITY COMPANY - OWNER': '',
  'REIT - OWNER': '',
  ...o,
});

describe('CMS ownership', () => {
  it('ranks direct owners by percentage, keeps managing employees out, and flags PE owners', () => {
    const rows = [
      owner({ 'ROLE TEXT - OWNER': 'W-2 MANAGING EMPLOYEE', 'FIRST NAME - OWNER': 'Pat', 'LAST NAME - OWNER': 'Admin', 'TITLE - OWNER': 'ADMINISTRATOR' }),
      owner({ 'ROLE TEXT - OWNER': 'CORPORATE OFFICER', 'FIRST NAME - OWNER': 'Casey', 'LAST NAME - OWNER': 'Officer', 'TITLE - OWNER': 'PRESIDENT' }),
      owner({ 'FIRST NAME - OWNER': 'Jordan', 'LAST NAME - OWNER': 'Minority', 'PERCENTAGE OWNERSHIP': '20' }),
      owner({ 'FIRST NAME - OWNER': 'Morgan', 'LAST NAME - OWNER': 'Majority', 'PERCENTAGE OWNERSHIP': '80', 'TITLE - OWNER': 'LLC MEMBER' }),
      owner({ 'TYPE - OWNER': 'O', 'ROLE TEXT - OWNER': '5% OR GREATER INDIRECT OWNERSHIP INTEREST', 'ORGANIZATION NAME - OWNER': 'Example Capital Partners LP', 'PRIVATE EQUITY COMPANY - OWNER': 'Y' }),
    ];
    const s = summarizeCmsOwners(rows);
    assert.deepEqual(s.people.map((p) => p.last), ['Majority', 'Minority', 'Officer']);
    assert.equal(s.people[0].pct, 80);
    assert.equal(s.people[0].title, 'LLC MEMBER');
    assert.equal(s.people[1].title, 'Owner (20%)');
    assert.equal(s.pe_flag, true);
    assert.equal(s.reit_flag, false);
    assert.deepEqual(s.org_owners, ['Example Capital Partners LP']);
    assert.ok(cmsRoleRank('W-2 MANAGING EMPLOYEE') >= 99);
  });

  it('builds a universe row with NPI, CCN, the top owner and flags', () => {
    const e = { 'ENROLLMENT ID': 'O1', NPI: '1234567890', CCN: '450001', 'ORGANIZATION NAME': 'SUNNY DAY HOME HEALTH LLC', 'DOING BUSINESS AS NAME': 'SUNNY DAY CARE', 'ADDRESS LINE 1': '1 MAIN ST', CITY: 'AUSTIN', STATE: 'TX', 'ZIP CODE': '787011234' };
    const row = cmsUniverseRow('hha', e, [owner({ 'FIRST NAME - OWNER': 'Morgan', 'LAST NAME - OWNER': 'Majority', 'PERCENTAGE OWNERSHIP': '100' })], '2026-10-01');
    assert.equal(row.source, 'cms_hha');
    assert.equal(row.source_record_id, 'O1');
    assert.equal(row.owner_last, 'Majority');
    assert.equal(row.ownership_pct, 100);
    assert.equal(row.zip5, '78701');
    assert.equal(row.confidence, 'high');
    assert.equal(row.waterfall_ready, true);
    const orgOnly = cmsUniverseRow('hha', e, [owner({ 'TYPE - OWNER': 'O', 'ORGANIZATION NAME - OWNER': 'Example Holdings LLC' })], '2026-10-01');
    assert.equal(orgOnly.owner_last, null);
    assert.equal(orgOnly.waterfall_ready, false);
    assert.deepEqual(orgOnly.org_owners, ['Example Holdings LLC']);
  });

  it('resolves the newest release of each family from the catalog, falling back to pinned ids', () => {
    const api = (id: string) => [{ accessURL: `https://data.cms.gov/data-api/v1/dataset/${id}/data` }];
    const ids = cmsIdsFromCatalog({
      dataset: [
        { title: 'Hospice All Owners : 2026-07-01', distribution: api('11111111-1111-1111-1111-111111111111') },
        { title: 'Hospice All Owners : 2027-01-01', distribution: api('22222222-2222-2222-2222-222222222222') },
        { title: 'Hospice Enrollments : 2027-01-01', distribution: api('33333333-3333-3333-3333-333333333333') },
      ],
    });
    assert.equal(ids.hospice.owners, '22222222-2222-2222-2222-222222222222');
    assert.equal(ids.hospice.enrollments, '33333333-3333-3333-3333-333333333333');
    assert.equal(ids.hospice.as_of, '2027-01-01');
    assert.deepEqual(ids.hha, CMS_PINNED_IDS.hha);
  });

  it('only searches CMS files that fit the company name, unless an NPI is given', () => {
    assert.deepEqual(cmsTypesFor({ company_name: 'Sunny Day Home Health', state: 'TX' }), ['hha']);
    assert.deepEqual(cmsTypesFor({ company_name: 'Peaceful Hospice', state: 'TX' }), ['hospice']);
    assert.deepEqual(cmsTypesFor({ company_name: 'Acme Roofing', state: 'TX' }), []);
    assert.equal(cmsTypesFor({ company_name: 'Acme', state: 'TX', npi: '1234567890' }).length, 5);
    assert.equal(inputZip5({ company_name: 'x', state: 'TX', address: '1 Main St, Austin, TX 78701-1234' }), '78701');
  });

  it('overlay: matches the enrollment by name + city, then names the top individual owner', async () => {
    resetCmsIdsCache();
    const enrollment = { 'ENROLLMENT ID': 'O9', 'ORGANIZATION NAME': 'SUNNY DAY HOME HEALTH LLC', 'DOING BUSINESS AS NAME': '', CITY: 'AUSTIN', STATE: 'TX', 'ZIP CODE': '78701' };
    const owners = [owner({ 'ENROLLMENT ID': 'O9', 'FIRST NAME - OWNER': 'Morgan', 'LAST NAME - OWNER': 'Majority', 'PERCENTAGE OWNERSHIP': '100' })];
    const ctx: LookupContext = {
      live: false,
      fetch: async (u) => {
        const url = decodeURIComponent(String(u).replace(/\+/g, ' '));
        if (url.endsWith('data.json')) return new Response('{}', { status: 200 });
        if (url.includes(CMS_PINNED_IDS.hha.owners)) return new Response(JSON.stringify(owners), { status: 200 });
        if (url.includes(CMS_PINNED_IDS.hha.enrollments) && url.includes('ORGANIZATION NAME')) return new Response(JSON.stringify([enrollment]), { status: 200 });
        return new Response('[]', { status: 200 });
      },
    };
    const r = await resolveCmsOwners({ company_name: 'Sunny Day Home Health', city: 'Austin', state: 'TX', zip: '78701' }, ctx);
    assert.ok(r);
    assert.equal(r!.open_data_source, 'cms_owners');
    assert.equal(r!.people[0].last_name?.toUpperCase(), 'MAJORITY');
    assert.ok(isWaterfallReady(r!.people[0]));
    // Same name, different ZIP and city: refused.
    resetCmsIdsCache();
    const far = await resolveCmsOwners({ company_name: 'Sunny Day Home Health Agency', city: 'El Paso', state: 'TX', zip: '79901' }, ctx);
    assert.equal(far, null);
    resetCmsIdsCache();
  });
});

describe('FMCSA universe', () => {
  it('keeps active carriers with an officer and enough power units, and names the officer', () => {
    assert.match(fmcsaWhere({ minPowerUnits: 5, state: 'tx' }), /power_units::number >= 5 AND phy_state='TX'/);
    const row = fmcsaUniverseRow({ dot_number: '123', legal_name: 'ACME HAULING LLC', company_officer_1: 'CASEY EXAMPLE', phy_city: 'DALLAS', phy_state: 'TX', phy_zip: '75201', phone: '(214) 555-0100', power_units: '12', total_drivers: '14', mcs150_date: '20250115' });
    assert.ok(row);
    assert.equal(row!.usdot, '123');
    assert.equal(row!.owner_last?.toUpperCase(), 'EXAMPLE');
    assert.equal(row!.size_power_units, 12);
    assert.equal(row!.phone, '2145550100');
    assert.equal(row!.as_of, '2025-01-15');
    assert.equal(row!.waterfall_ready, true);
    const entityOfficer = fmcsaUniverseRow({ dot_number: '9', legal_name: 'X TRUCKING', company_officer_1: 'X TRUCKING LLC' });
    assert.equal(entityOfficer!.waterfall_ready, false);
  });
});

describe('Form 5500', () => {
  const sf = (o: Record<string, string>) => ({
    SF_SPONS_EIN: '123456789',
    SF_SPONSOR_NAME: 'EXAMPLE MACHINE WORKS INC',
    SF_SPONS_US_CITY: 'AKRON',
    SF_SPONS_US_STATE: 'OH',
    SF_SPONS_US_ZIP: '44301',
    SF_SPONS_PHONE_NUM: '3305550100',
    SF_BUSINESS_CODE: '332710',
    SF_PLAN_YEAR_BEGIN_DATE: '2024-01-01',
    SF_TOT_ACT_PARTCP_BOY_CNT: '42',
    SF_SPONS_SIGNED_NAME: '',
    SF_ADMIN_SIGNED_NAME: '',
    SF_ADMIN_NAME: '',
    SF_ADMIN_EIN: '',
    SF_ADMIN_NAME_SAME_SPON_IND: '',
    ...o,
  });

  it('uses the sponsor signer, or the administrator signer only when the administrator is the employer', () => {
    assert.equal(f5500Filing(sf({ SF_SPONS_SIGNED_NAME: 'Casey Example' }), 'sf')!.signer_kind, 'sponsor');
    assert.equal(f5500Filing(sf({ SF_ADMIN_SIGNED_NAME: 'Casey Example' }), 'sf')!.signer_kind, 'admin_is_sponsor');
    const tpa = f5500Filing(sf({ SF_ADMIN_SIGNED_NAME: 'Robin Paper', SF_ADMIN_NAME: 'BIG TPA LLC', SF_ADMIN_EIN: '999999999' }), 'sf')!;
    assert.equal(tpa.signer_kind, 'admin_third_party');
    assert.equal(tpa.signer, null);
    assert.equal(f5500Filing(sf({ SF_SPONS_EIN: '12' }), 'sf'), null);
    const full = f5500Filing({ SPONS_DFE_EIN: '223456789', SPONSOR_DFE_NAME: 'BIG CO', ADMIN_SIGNED_NAME: 'Dana Example', ADMIN_NAME_SAME_SPON_IND: 'Y', TOT_ACTIVE_PARTCP_CNT: '150' }, 'full')!;
    assert.equal(full.signer, 'Dana Example');
    assert.equal(full.participants, 150);
  });

  it('one row per EIN, latest year wins, professional signers are dropped, band filter applies', () => {
    const acc = new F5500Accumulator();
    acc.add(f5500Filing(sf({ SF_SPONS_SIGNED_NAME: 'Casey Example', SF_PLAN_YEAR_BEGIN_DATE: '2023-01-01' }), 'sf')!);
    acc.add(f5500Filing(sf({ SF_PLAN_YEAR_BEGIN_DATE: '2024-01-01', SF_TOT_ACT_PARTCP_BOY_CNT: '48' }), 'sf')!);
    for (let i = 0; i < PROFESSIONAL_SIGNER_MIN_EINS; i++) {
      acc.add(f5500Filing(sf({ SF_SPONS_EIN: `90000000${i}`, SF_SPONSOR_NAME: `CLIENT ${i} LLC`, SF_ADMIN_SIGNED_NAME: 'Robin Paper' }), 'sf')!);
    }
    acc.add(f5500Filing(sf({ SF_SPONS_EIN: '300000000', SF_SPONSOR_NAME: 'TINY LLC', SF_SPONS_SIGNED_NAME: 'Lee Example', SF_TOT_ACT_PARTCP_BOY_CNT: '3' }), 'sf')!);
    const rows = [...acc.rows({ minParticipants: 10 })];
    const main = rows.find((r) => r.ein === '123456789')!;
    assert.equal(main.as_of, '2024-01-01');
    assert.equal(main.owner_last?.toUpperCase(), 'EXAMPLE', 'signer from the earlier year is kept');
    assert.equal(main.size_participants, 48);
    assert.equal(main.confidence, 'medium');
    assert.equal(main.waterfall_ready, true);
    const pro = rows.filter((r) => r.legal_name.startsWith('CLIENT'));
    assert.equal(pro.length, PROFESSIONAL_SIGNER_MIN_EINS);
    assert.ok(pro.every((r) => r.owner_last === null && !r.waterfall_ready));
    assert.ok(!rows.some((r) => r.ein === '300000000'), 'below the participant floor');
  });

  it('overlay reads the universe table: EIN first, then name + ZIP; medium confidence', async () => {
    const stored = {
      source: 'form5500', source_record_id: '123456789', ein: '123456789', legal_name: 'EXAMPLE MACHINE WORKS INC', name_key: 'EXAMPLEMACHINEWORKS',
      dba_key: null, zip5: '44301', phone: '3305550100', owner_first: 'Casey', owner_last: 'Example', waterfall_ready: true,
    };
    const calls: unknown[] = [];
    const store = {
      lookup: async (src: string, keys: unknown) => {
        calls.push({ src, keys });
        return [stored];
      },
    } as unknown as UniverseStore;
    const ctx: LookupContext = { live: false, universeStore: store };
    const r = await resolveForm5500({ company_name: 'Example Machine Works', city: 'Akron', state: 'OH', zip: '44301' }, ctx);
    assert.ok(r);
    assert.equal(r!.open_data_source, 'form5500');
    assert.equal(r!.people[0].last_name?.toUpperCase(), 'EXAMPLE');
    assert.equal(r!.people[0].confidence, 'medium');
    assert.ok(isWaterfallReady(r!.people[0]));
    const noKeys = await resolveForm5500({ company_name: 'Example Machine Works', city: 'Akron', state: 'OH' }, ctx);
    assert.equal(noKeys, null, 'no EIN, ZIP or phone: no lookup');
    const off = await resolveForm5500({ company_name: 'Example Machine Works', state: 'OH', zip: '44301' }, { live: false, universeStore: null });
    assert.equal(off, null);
  });
});

describe('streaming CSV inside a zip', () => {
  it('reads one entry without buffering and joins quoted line breaks', async () => {
    const csv = 'A,B,C\r\n1,"two, with comma",3\r\n4,"multi\nline",6\r\n';
    const data = Buffer.from(csv, 'latin1');
    const comp = deflateRawSync(data);
    const name = Buffer.from('f_5500_test.csv');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc32(data), 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(46 + name.length, 12); eocd.writeUInt32LE(30 + name.length + comp.length, 16);
    const dir = mkdtempSync(join(tmpdir(), 'uv-'));
    const path = join(dir, 't.zip');
    writeFileSync(path, Buffer.concat([local, name, comp, cd, name, eocd]));
    const rows: Array<Record<string, string>> = [];
    for await (const r of csvRecords(zipEntryStream(path, (n) => n.endsWith('.csv')))) rows.push(r);
    assert.deepEqual(rows, [
      { A: '1', B: 'two, with comma', C: '3' },
      { A: '4', B: 'multi\nline', C: '6' },
    ]);
    assert.deepEqual(splitCsvRecord('a,"b ""q""",c'), ['a', 'b "q"', 'c']);
  });
});

describe('universe helpers', () => {
  it('validates the destination table and normalizes dates and ZIPs', () => {
    assert.equal(assertUniverseTable('client_pe.bo_universe'), 'client_pe.bo_universe');
    assert.throws(() => assertUniverseTable('public.bo_universe'));
    assert.throws(() => assertUniverseTable('client_pe.universe'));
    assert.throws(() => assertUniverseTable('client_pe.bo_x; drop table y'));
    assert.equal(isoDate('2024-01-01'), '2024-01-01');
    assert.equal(isoDate('20250115'), '2025-01-15');
    assert.equal(isoDate('01-JAN-24'), '2024-01-01');
    assert.equal(zip5('44301-1234'), '44301');
    assert.equal(zip5('443'), null);
  });
});
