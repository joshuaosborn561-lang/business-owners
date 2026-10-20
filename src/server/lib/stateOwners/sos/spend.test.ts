import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  APIFY_USD_PER_BLOCKED_LOOKUP,
  APIFY_USD_PER_COMPANY,
  ApifySpendTracker,
  SERPER_USD_PER_QUERY,
  companySpendKey,
  eventUsdFromApifyRun,
  runHasBillData,
  usdFromApifyRun,
} from './spend.js';

describe('usdFromApifyRun', () => {
  it('uses the run billed usageTotalUsd even when the actor failed', () => {
    const cost = usdFromApifyRun(
      { id: 'run-1', status: 'FAILED', usageTotalUsd: 0.047 },
      { succeeded: false, started: true },
    );
    assert.equal(cost.usd, 0.047);
  });

  it('charges a started run with no usage yet instead of counting $0', () => {
    const cost = usdFromApifyRun({ id: 'run-2', status: 'FAILED' }, { succeeded: false, started: true });
    assert.equal(cost.usd, APIFY_USD_PER_BLOCKED_LOOKUP);
  });

  it('does not invent spend when the actor never started', () => {
    const cost = usdFromApifyRun({ status: 'FAILED' }, { succeeded: false, started: false });
    assert.equal(cost.usd, 0);
  });

  it('adds pay-per-event charges on top of usageTotalUsd', () => {
    const run = {
      id: 'run-ppe',
      status: 'SUCCEEDED',
      usageTotalUsd: 0.004,
      chargedEventCounts: { 'actor-start': 1, GET: 2 },
      pricingInfo: {
        pricingModel: 'PAY_PER_EVENT',
        pricingPerEvent: {
          actorChargeEvents: {
            'actor-start': { eventPriceUsd: 0.0005 },
            GET: { eventPriceUsd: 0.01 },
          },
        },
      },
    };
    assert.equal(eventUsdFromApifyRun(run), 0.0205);
    const cost = usdFromApifyRun(run, { succeeded: true, started: true });
    assert.equal(cost.usd, 0.0245);
    assert.equal(cost.eventUsd, 0.0205);
    assert.equal(runHasBillData({ chargedEventCounts: { GET: 1 } }), false);
    assert.equal(runHasBillData({ usageTotalUsd: 0.006, chargedEventCounts: { GET: 1 } }), true);
  });
});

describe('ApifySpendTracker shared cap', () => {
  it('persists billed spend so a second process sees the same global cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owners-spend-'));
    const path = join(dir, 'spend.json');
    const a = new ApifySpendTracker({ persistPath: path, capUsd: 0.04, companyCapUsd: APIFY_USD_PER_COMPANY });
    a.add(0.03);
    const b = new ApifySpendTracker({ persistPath: path, capUsd: 0.04, companyCapUsd: APIFY_USD_PER_COMPANY });
    assert.equal(b.usd, 0.03);
    assert.equal(b.wouldExceed(0.015), true);
    assert.equal(b.reserve(0.015), false);
    const disk = JSON.parse(readFileSync(path, 'utf8')) as { usd: number };
    assert.equal(disk.usd, 0.03);
  });

  it('enforces a per-company ceiling on reserve', () => {
    const spend = new ApifySpendTracker({ capUsd: 2, companyCapUsd: 0.02 });
    const key = companySpendKey({ state: 'TX', city: 'Austin', company_name: 'Sample Builders LLC' });
    assert.equal(spend.reserve(0.015, key), true);
    assert.equal(spend.reserve(0.015, key), true);
    assert.equal(spend.reserve(0.015, key), false);
    assert.equal(spend.remainingCompanyUsd(key), 0);
    assert.equal(spend.reserve(0.015, companySpendKey({ state: 'GA', city: 'Atlanta', company_name: 'Other LLC' })), true);
  });

  it('settles a reservation to the actual billed usageTotalUsd', () => {
    const spend = new ApifySpendTracker({ capUsd: 2 });
    assert.equal(spend.reserve(0.015), true);
    spend.commit(0.047, 0.015);
    assert.equal(spend.usd, 0.047);
    assert.equal(spend.apifyUsd, 0.047);
    assert.equal(spend.runs, 1);
  });

  it('puts Serper queries on the same TOTAL_MAX_USD ledger and hard-stops', () => {
    const spend = new ApifySpendTracker({ capUsd: 0.003 });
    assert.equal(spend.reserveSerper(2, 'TX|austin|sample'), true);
    assert.equal(spend.usd, Number((2 * SERPER_USD_PER_QUERY).toFixed(4)));
    assert.equal(spend.apifyUsd, 0);
    assert.equal(spend.reserveSerper(2, 'TX|austin|sample'), false);
    assert.equal(spend.exhausted(), false);
    assert.equal(spend.reserve(0.015), false);
  });
});
