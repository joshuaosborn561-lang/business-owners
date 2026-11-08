import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scriptedSearchProhibited } from './catalog.js';
import { fetchOfficialPage } from './htmlFetch.js';
import { usesHtmlOfficerAdapter } from './htmlStates.js';
import { resolveOfficialNameLookup } from './namePath.js';
import { usesUnblocker } from './unblocker.js';

describe('registries whose terms forbid scripted searches', () => {
  it('NC is never routed to the registry, the unblocker or the HTML adapter', () => {
    assert.equal(scriptedSearchProhibited('NC'), true);
    assert.equal(scriptedSearchProhibited('nc'), true);
    assert.equal(scriptedSearchProhibited('GA'), false);
    assert.equal(usesUnblocker('NC'), false);
    assert.equal(usesHtmlOfficerAdapter('NC'), false);
  });

  it('a live fetch for NC is refused before any network call', async () => {
    let called = 0;
    const page = await fetchOfficialPage('https://www.sosnc.gov/online_services/search/Business_Registration_Results?SearchTerms=x', {
      live: true,
      fetch: async () => {
        called++;
        return new Response('<html></html>', { status: 200 });
      },
    }, { state: 'NC', allowApify: true, input: { company_name: 'X', state: 'NC' } });
    assert.equal(called, 0);
    assert.equal(page.blocked, true);
  });

  it('the official step reports terms_prohibited for NC', async () => {
    const r = await resolveOfficialNameLookup({ company_name: 'Sample Plumbing LLC', city: 'Raleigh', state: 'NC' }, { live: false });
    assert.equal(r.coverage_reason, 'terms_prohibited');
    assert.equal(r.people.length, 0);
  });
});
