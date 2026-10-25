import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LookupContext } from './context.js';
import { fetchOfficialPage } from './htmlFetch.js';
import { ApifySpendTracker } from './spend.js';
import {
  UNBLOCKER_STATES,
  buildUnblockerRequest,
  fetchViaUnblocker,
  parseUnblockerResponse,
  unblockerConfigFromEnv,
  unblockerConfigured,
  usesUnblocker,
} from './unblocker.js';

const cfg = { provider: 'zyte' as const, apiKey: 'k', zone: null, usdPerRequest: 0.004, renderJs: true };

describe('unblocker config', () => {
  it('is off without a key and reads provider + price from env', () => {
    assert.equal(unblockerConfigFromEnv({}), null);
    assert.equal(unblockerConfigFromEnv({ UNBLOCKER_API_KEY: 'k', UNBLOCKER_PROVIDER: 'nope' }), null);
    const c = unblockerConfigFromEnv({ UNBLOCKER_API_KEY: 'k', UNBLOCKER_PROVIDER: 'ScrapingBee', UNBLOCKER_USD_PER_REQUEST: '0.01', UNBLOCKER_RENDER_JS: 'false' });
    assert.equal(c?.provider, 'scrapingbee');
    assert.equal(c?.usdPerRequest, 0.01);
    assert.equal(c?.renderJs, false);
    assert.equal(unblockerConfigured({ unblockerEnabled: false, unblockerFetch: async () => ({ status: 200, body: '' }) }), false);
  });

  it('routes only the bot-walled officer states', () => {
    assert.ok(usesUnblocker('GA'));
    assert.ok(usesUnblocker('ma'));
    assert.ok(!usesUnblocker('TX'));
    assert.ok(!usesUnblocker('PA'), 'PA uses open data');
    assert.ok(!usesUnblocker('FL'), 'FL uses the bulk file');
    assert.ok(!UNBLOCKER_STATES.has('OH'), 'OH is agent-only');
  });
});

describe('vendor request shapes', () => {
  it('builds a Zyte browserHtml request for GET and an httpResponseBody request for POST', () => {
    const get = buildUnblockerRequest(cfg, 'https://ecorp.sos.ga.gov/BusinessSearch');
    assert.equal(get.url, 'https://api.zyte.com/v1/extract');
    assert.match(String((get.init.headers as Record<string, string>).Authorization), /^Basic /);
    assert.deepEqual(JSON.parse(String(get.init.body)), { url: 'https://ecorp.sos.ga.gov/BusinessSearch', browserHtml: true });
    const post = buildUnblockerRequest(cfg, 'https://x.gov/s', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const body = JSON.parse(String(post.init.body)) as Record<string, unknown>;
    assert.equal(body.httpRequestMethod, 'POST');
    assert.equal(body.httpRequestBody, Buffer.from('a=1').toString('base64'));
    assert.equal(body.httpResponseBody, true);
  });
  it('builds Bright Data and ScrapingBee requests', () => {
    const bd = buildUnblockerRequest({ ...cfg, provider: 'brightdata', zone: 'zone1' }, 'https://x.gov/');
    assert.equal(bd.url, 'https://api.brightdata.com/request');
    assert.equal(JSON.parse(String(bd.init.body)).zone, 'zone1');
    const sb = buildUnblockerRequest({ ...cfg, provider: 'scrapingbee' }, 'https://x.gov/');
    assert.match(sb.url, /app\.scrapingbee\.com.*render_js=true.*premium_proxy=true/);
  });
  it('parses a Zyte response and a ScrapingBee original-status header', async () => {
    const z = await parseUnblockerResponse(cfg, new Response(JSON.stringify({ statusCode: 200, browserHtml: '<html>Officers</html>' }), { status: 200 }), 'https://x.gov/');
    assert.equal(z.status, 200);
    assert.match(z.body, /Officers/);
    const sb = await parseUnblockerResponse({ ...cfg, provider: 'scrapingbee' }, new Response('<html>x</html>', { status: 200, headers: { 'Spb-original-status': '404' } }), 'https://x.gov/');
    assert.equal(sb.status, 404);
  });
});

describe('spend ledger', () => {
  it('refuses the vendor call when the cap would be exceeded and records spend otherwise', async () => {
    const spend = new ApifySpendTracker({ capUsd: 0.005, companyCapUsd: 0.02 });
    let calls = 0;
    const ctx: LookupContext = {
      live: true,
      spend,
      companyKey: 'GA|atlanta|acme',
      unblockerFetch: async () => {
        calls += 1;
        return { status: 200, body: '<html>Officer</html>' };
      },
    };
    const first = await fetchViaUnblocker('https://ecorp.sos.ga.gov/a', ctx);
    assert.equal(first?.refused, undefined);
    assert.equal(calls, 1);
    assert.equal(spend.unblockerUsd, 0.004);
    assert.equal(spend.unblockerRequests, 1);
    const second = await fetchViaUnblocker('https://ecorp.sos.ga.gov/b', ctx);
    assert.equal(second?.refused, true);
    assert.equal(calls, 1, 'no vendor call past the cap');
  });
});

describe('fetchOfficialPage with the unblocker lane', () => {
  const input = { company_name: 'Acme', city: 'Atlanta', state: 'GA' };
  it('falls through to the unblocker on a 403 and marks the page', async () => {
    const ctx: LookupContext = {
      live: true,
      apifyEnabled: false,
      spend: new ApifySpendTracker({ capUsd: 1, companyCapUsd: 0.02 }),
      fetch: async () => new Response('Forbidden', { status: 403 }),
      unblockerFetch: async () => ({ status: 200, body: '<html><table><tr><td>Officer</td><td>JANE DOE</td></tr></table></html>' }),
    };
    const page = await fetchOfficialPage('https://ecorp.sos.ga.gov/BusinessSearch', ctx, { state: 'GA', allowApify: true, input });
    assert.equal(page.via_unblocker, true);
    assert.equal(page.blocked, false);
    assert.match(page.body, /JANE DOE/);
    assert.equal(page.usd, 0.004);
  });
  it('treats a challenge page from the unblocker as still blocked', async () => {
    const ctx: LookupContext = {
      live: true,
      apifyEnabled: false,
      spend: new ApifySpendTracker({ capUsd: 1, companyCapUsd: 0.02 }),
      fetch: async () => new Response('Forbidden', { status: 403 }),
      unblockerFetch: async () => ({ status: 200, body: '<html>Just a moment...</html>' }),
    };
    const page = await fetchOfficialPage('https://ecorp.sos.ga.gov/BusinessSearch', ctx, { state: 'GA', allowApify: true, input });
    assert.equal(page.via_unblocker, true);
    assert.equal(page.blocked, true);
    assert.equal(page.body, '');
  });
  it('does not use the unblocker for states that are not walled', async () => {
    let used = 0;
    const ctx: LookupContext = {
      live: true,
      apifyEnabled: false,
      spend: new ApifySpendTracker({ capUsd: 1, companyCapUsd: 0.02 }),
      fetch: async () => new Response('Forbidden', { status: 403 }),
      unblockerFetch: async () => {
        used += 1;
        return { status: 200, body: '<html>Officer</html>' };
      },
    };
    const page = await fetchOfficialPage('https://sosbes.sos.ky.gov/x', ctx, { state: 'KY', allowApify: true, input: { ...input, state: 'KY' } });
    assert.equal(used, 0);
    assert.equal(page.blocked, true);
  });
});
