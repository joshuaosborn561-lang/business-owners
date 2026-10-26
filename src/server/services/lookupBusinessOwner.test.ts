import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getJob, resetJobsForTests } from '../lib/stateOwners/sos/jobs.js';
import { resetOwnerHitsForTests } from '../lib/stateOwners/sos/ownerHits.js';
import {
  APIFY_USD_PER_BLOCKED_LOOKUP,
  getOwnerResults,
  PHASE1_WRITES_ENABLED,
  WRITES_ENABLED,
  getBusinessOwnerJob,
  lookupBusinessOwner,
} from './lookupBusinessOwner.js';
import { AGENT_ONLY_SKIP_CODES, OFFICER_PUBLISHING_CODES } from '../lib/stateOwners/sos/catalog.js';

describe('lookup_business_owner scaffold', () => {
  it('returns a first-use envelope on estimate_only without calling SOS', async () => {
    const out = await lookupBusinessOwner({ estimate_only: true });
    assert.equal(out.ok, true);
    assert.equal(out.writes_enabled, true);
    assert.equal(PHASE1_WRITES_ENABLED, true);
    assert.equal(WRITES_ENABLED, true);
    assert.equal((out.quote as { rows: number }).rows, 0);
    assert.equal(out.requires_approval, true);
    assert.equal(out.phase, 3);
    const first = out.first_use as {
      assumed_total: number;
      ca_direct_http_usd: number;
      ca_bizfile_api: string;
      ca_apify_mid_usd: number;
      serper_credits: number;
      serper_usd: number;
      serper_queries_per_row: number;
    };
    assert.equal(first.assumed_total, 15359);
    assert.equal(first.ca_direct_http_usd, 0);
    assert.equal(first.ca_bizfile_api, 'unavailable_government_agencies_only');
    assert.ok(first.ca_apify_mid_usd > 100);
    assert.equal(out.apify_estimate_usd, 0);
    assert.equal(first.serper_queries_per_row, 8);
    assert.equal(first.serper_credits, 15359 * 8);
    assert.ok(first.serper_usd > 0);
    assert.equal(out.serper_estimate_credits, 15359 * 8);
    assert.ok(APIFY_USD_PER_BLOCKED_LOOKUP > 0);
    const priced = await lookupBusinessOwner({
      estimate_only: true,
      rows: [
        { company_name: 'Sample Builders LLC', city: 'Oakland', state: 'CA' },
        { company_name: 'Sample HVAC LLC', city: 'Denver', state: 'CO' },
      ],
    });
    assert.equal(priced.serper_estimate_credits, 16);
    assert.equal(priced.serper_estimate_usd, 0.016);
  });

  it('records a job and returns no owners when nothing matched', async () => {
    resetJobsForTests();
    const out = await lookupBusinessOwner({
      dry_run: true,
      context: { live: false },
      rows: [
        { company_name: 'Sample Builders LLC', city: 'Oakland', state: 'CA' },
        { company_name: 'Sample HVAC LLC', city: 'Denver', state: 'CO' },
      ],
    });
    assert.equal(out.ok, true);
    assert.equal(out.processed, 2);
    assert.equal(out.named, 0);
    assert.equal(out.writes_enabled, true);
    assert.deepEqual(out.owners, []);
    assert.equal(out.misses, 2);
    const job = getJob(String(out.job_id));
    assert.equal(job?.status, 'completed');
    const fetched = await getBusinessOwnerJob(String(out.job_id));
    assert.equal(fetched.ok, true);
    assert.equal(fetched.processed, 2);
  });

  it('batches rows, records job status, and spends $0 without Apify', async () => {
    resetJobsForTests();
    const out = await lookupBusinessOwner({
      dry_run: true,
      wait: true,
      context: { live: false, caPayload: { RecordCount: 0, EntityData: [] } },
      rows: [
        { company_name: 'Sample Builders LLC', city: 'Oakland', state: 'CA' },
        { company_name: 'Sample Masonry LLC', city: 'Columbus', state: 'OH' },
      ],
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'completed');
    assert.equal(out.processed, 2);
    assert.equal(out.apify_usd_spent, 0);
    const job = await getBusinessOwnerJob(String(out.job_id));
    assert.equal(job.status, 'completed');
    assert.equal(job.phase, 3);
  });
});

describe('officer-publishing rollout', () => {
  it('covers 41 jurisdictions and skips the 10 agent-only states', () => {
    assert.equal(OFFICER_PUBLISHING_CODES.length, 41);
    assert.equal(AGENT_ONLY_SKIP_CODES.length, 10);
    const officer = OFFICER_PUBLISHING_CODES as readonly string[];
    assert.ok(officer.includes('CA'));
    assert.ok(officer.includes('DC'));
    assert.ok(!officer.includes('CO'));
    assert.ok((AGENT_ONLY_SKIP_CODES as readonly string[]).includes('NY'));
  });

  it('returns owner names inline and through get_owner_results (json + csv)', async () => {
    resetJobsForTests();
    resetOwnerHitsForTests();
    const paRows = [
      { business_name: 'Keystone Roofing LLC', filing_number: '9', city: 'York', party_type: 'Member', first_name: 'ED', last_name: 'STOLTZFUS' },
    ];
    const fetch = async (input: string | URL | Request) =>
      new Response(JSON.stringify(/xvd7-5r2c/.test(String(input)) ? paRows : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const out = await lookupBusinessOwner({
      client_tag: 'test_client',
      context: { live: false, fetch, openDataSources: ['pa_dos'], serperEnabled: false },
      rows: [
        { company_name: 'Keystone Roofing', city: 'York', state: 'PA', phone: '717-555-0100' },
        { company_name: 'Nobody Here Co', city: 'Erie', state: 'PA' },
      ],
    });
    assert.equal(out.named, 1);
    const owners = out.owners as Array<Record<string, unknown>>;
    assert.equal(owners.length, 1);
    assert.equal(owners[0].first_name, 'Ed');
    assert.equal(owners[0].last_name, 'Stoltzfus');
    assert.equal(owners[0].company_name, 'Keystone Roofing');
    assert.equal(owners[0].source, 'pa_dos');
    assert.equal(out.owners_total, 1);
    const res = await getOwnerResults({ job_id: String(out.job_id) });
    assert.equal((res.owners as unknown[]).length, 1);
    const all = await getOwnerResults({ job_id: String(out.job_id), only_named: false });
    assert.equal((all.owners as unknown[]).length, 2);
    const csv = await getOwnerResults({ job_id: String(out.job_id), format: 'csv' });
    assert.match(String(csv.csv), /^input_company,/);
    assert.match(String(csv.csv), /Keystone Roofing,York,PA,717-555-0100,.*,Ed,Stoltzfus,/);
  });
});
