import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchOfficialPage } from './htmlFetch.js';
import { ApifySpendTracker } from './spend.js';
import { SOS_HTTP_TIMEOUT_MS } from './context.js';

const input = { company_name: 'Sample Builders LLC', city: 'Austin', state: 'TX' };

describe('fetchOfficialPage Apify gate', () => {
  it('caps the SOS HTTP timeout at 15s', () => {
    assert.equal(SOS_HTTP_TIMEOUT_MS, 15_000);
  });

  it('does not call Apify on a 200 not-found page', async () => {
    let apify = 0;
    const page = await fetchOfficialPage('https://mycpa.cpa.state.tx.us/coa/search.do?name=x', {
      live: true,
      fetch: async () => new Response('<html><body>No records found</body></html>', { status: 200 }),
      apifyFetchHtml: async () => {
        apify += 1;
        return { html: '<html>officers</html>', usd: 0.015 };
      },
    }, { state: 'TX', allowApify: true, input, kind: 'search' });
    assert.equal(apify, 0);
    assert.equal(page.via_apify, false);
    assert.equal(page.apify_worthy, false);
    assert.match(page.body, /No records found/);
  });

  it('does not call Apify on timeout or abort', async () => {
    let apify = 0;
    const page = await fetchOfficialPage('https://mycpa.cpa.state.tx.us/coa/search.do?name=x', {
      live: true,
      fetch: async () => {
        const err = new Error('The operation was aborted');
        err.name = 'TimeoutError';
        throw err;
      },
      apifyFetchHtml: async () => {
        apify += 1;
        return { html: '<html>officers</html>', usd: 0.015 };
      },
    }, { state: 'TX', allowApify: true, input, kind: 'search' });
    assert.equal(apify, 0);
    assert.equal(page.via_apify, false);
    assert.equal(page.apify_worthy, false);
    assert.equal(page.timed_out, true);
    assert.equal(page.blocked, false);
  });

  it('calls Apify only after a 403 / Incapsula block', async () => {
    let apify = 0;
    const page = await fetchOfficialPage('https://ecorp.sos.ga.gov/BusinessSearch', {
      live: true,
      spend: new ApifySpendTracker({ capUsd: 2, companyCapUsd: 0.02 }),
      fetch: async () =>
        new Response('<html>_Incapsula_Resource incident id 1</html>', { status: 403 }),
      apifyFetchHtml: async () => {
        apify += 1;
        return { html: '<html><body>Entity Name SAMPLE BUILDERS LLC</body></html>', usd: 0.008 };
      },
    }, { state: 'GA', allowApify: true, input: { ...input, state: 'GA', city: 'Atlanta' }, kind: 'search' });
    assert.equal(apify, 1);
    assert.equal(page.via_apify, true);
    assert.equal(page.blocked, false);
    assert.match(page.body, /SAMPLE BUILDERS/);
  });

  it('refuses Apify when the per-company budget is exhausted', async () => {
    let apify = 0;
    const spend = new ApifySpendTracker({ capUsd: 2, companyCapUsd: 0.02 });
    spend.add(0.02, { companyKey: 'TX|austin|sample builders llc' });
    const page = await fetchOfficialPage('https://mycpa.cpa.state.tx.us/coa/search.do?name=x', {
      live: true,
      spend,
      fetch: async () => new Response('captcha Incapsula', { status: 403 }),
      apifyFetchHtml: async () => {
        apify += 1;
        return { html: '<html>x</html>', usd: 0.015 };
      },
    }, { state: 'TX', allowApify: true, input, kind: 'search' });
    assert.equal(apify, 0);
    assert.equal(page.via_apify, false);
    assert.equal(page.blocked, true);
    assert.equal(page.apify_worthy, true);
  });
});
