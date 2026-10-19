import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkedinOwnerQuery, resolveAgentFallback } from './agentFallback.js';
import { isWaterfallReady } from './waterfall.js';
import { SerperCreditTracker } from './spend.js';

describe('agent fallback', () => {
  it('builds a LinkedIn owner query with company and city', () => {
    const q = linkedinOwnerQuery({ company_name: 'Harbor Dental', city: 'San Diego', state: 'CA' });
    assert.match(q, /site:linkedin\.com\/in/);
    assert.match(q, /Harbor Dental/);
    assert.match(q, /San Diego/);
  });

  it('takes an About-page founder and marks them waterfall-ready', async () => {
    const html =
      '<html><body><h1>About us</h1><p>Harbor Dental was founded by Maya Chen, President, in San Diego.</p></body></html>';
    const got = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA', domain: 'harbordental.example' },
      {
        live: false,
        htmlByUrl: { 'https://harbordental.example/about': html },
        serper: new SerperCreditTracker(),
      },
    );
    assert.equal(got.source, 'website');
    assert.match(got.people[0]?.first_name || '', /maya/i);
    assert.match(got.people[0]?.last_name || '', /chen/i);
    assert.equal(isWaterfallReady(got.people[0]!), true);
    assert.ok((got.people[0]?.confidence_score ?? 0) >= 0.55);
  });

  it('accepts a LinkedIn Serper hit that matches company and city', async () => {
    const got = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA' },
      {
        live: true,
        serperEnabled: true,
        serper: new SerperCreditTracker(),
        serperOrganic: {
          organic: [
            {
              title: 'Maya Chen - Owner - Harbor Dental',
              link: 'https://www.linkedin.com/in/maya-chen-example',
              snippet: 'Owner at Harbor Dental · San Diego, California',
            },
          ],
        },
      },
    );
    assert.equal(got.source, 'linkedin');
    assert.match(got.people[0]?.last_name || '', /chen/i);
    assert.equal(isWaterfallReady(got.people[0]!), true);
  });
});
