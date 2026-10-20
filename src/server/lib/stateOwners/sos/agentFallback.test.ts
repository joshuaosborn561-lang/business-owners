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

  it('takes an About-page founder but does not mark website-only hits waterfall-ready', async () => {
    const html =
      '<html><body><h1>About us</h1><p>Harbor Dental was founded by Maya Chen, President, in San Diego.</p></body></html>';
    const got = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA', website: 'https://harbordental.example' },
      {
        live: false,
        htmlByUrl: { 'https://harbordental.example/about': html },
        serper: new SerperCreditTracker(),
      },
    );
    assert.equal(got.source, 'website');
    assert.match(got.people[0]?.first_name || '', /maya/i);
    assert.match(got.people[0]?.last_name || '', /chen/i);
    assert.equal(got.people[0]?.corroborated, false);
    assert.equal(isWaterfallReady(got.people[0]!), false);
    assert.ok((got.people[0]?.confidence_score ?? 0) <= 0.6);
    assert.ok((got.people[0]?.confidence_score ?? 0) >= 0.55);
  });

  it('rejects nav/menu words from an About page', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const html = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'about-nav.html'),
      'utf8',
    );
    const got = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA', website: 'https://harbordental.example' },
      {
        live: false,
        htmlByUrl: { 'https://harbordental.example/about': html },
        serper: new SerperCreditTracker(),
      },
    );
    assert.equal(got.people.length, 0);
  });

  it('marks a website founder waterfall-ready when LinkedIn corroborates', async () => {
    const html =
      '<html><body><h1>About us</h1><p>Harbor Dental was founded by Maya Chen, President, in San Diego.</p></body></html>';
    const got = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA', website: 'https://harbordental.example' },
      {
        live: true,
        htmlByUrl: { 'https://harbordental.example/about': html },
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
    assert.equal(got.people.some((p) => p.corroborated), true);
    assert.equal(isWaterfallReady(got.people[0]!), true);
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
