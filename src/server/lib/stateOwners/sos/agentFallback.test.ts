import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  linkedinOwnerQuery,
  linkedinSlugAgreesWithName,
  resolveAgentFallback,
} from './agentFallback.js';
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
    assert.ok((got.people[0]?.confidence_score ?? 0) >= 0.8);
  });

  it('accepts a title-adjacent About name and keeps the junk filter', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const html = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'about-title-adjacent.html'),
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
    assert.equal(got.source, 'website');
    assert.match(got.people[0]?.first_name || '', /jane/i);
    assert.match(got.people[0]?.last_name || '', /sample/i);
    assert.equal(got.people[0]?.corroborated, false);
    assert.ok((got.people[0]?.confidence_score ?? 0) <= 0.6);
  });

  it('accepts an About name that matches a Serper/SOS corroborator', async () => {
    const got = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA', website: 'https://harbordental.example' },
      {
        live: false,
        htmlByUrl: {
          'https://harbordental.example/about':
            '<html><body><p>The practice is led by Jane Sample in San Diego.</p></body></html>',
        },
        serper: new SerperCreditTracker(),
      },
      [
        {
          first_name: 'Jane',
          last_name: 'Sample',
          title: 'Owner',
          company_name: 'Harbor Dental',
          domain: null,
          source_url: 'https://search.sunbiz.org/example',
          confidence: 'high',
          state: 'CA',
          source: 'sunbiz',
          role: 'officer',
          coverage_reason: null,
        },
      ],
    );
    assert.equal(got.source, 'website');
    assert.equal(got.people[0]?.corroborated, true);
    assert.ok((got.people[0]?.confidence_score ?? 0) >= 0.8);
    assert.equal(isWaterfallReady(got.people[0]!), true);
  });

  it('requires the LinkedIn profile name to agree with the URL slug', () => {
    assert.equal(
      linkedinSlugAgreesWithName('https://www.linkedin.com/in/maya-chen-example', 'Maya', 'Chen'),
      true,
    );
    assert.equal(
      linkedinSlugAgreesWithName('https://www.linkedin.com/in/alex-other-123', 'Maya', 'Chen'),
      false,
    );
  });

  it('rejects LinkedIn rows whose title is a job title or whose slug disagrees', async () => {
    const titled = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA' },
      {
        live: true,
        serperEnabled: true,
        serper: new SerperCreditTracker(),
        serperOrganic: {
          organic: [
            {
              title: 'Owner | Harbor Dental | San Diego',
              link: 'https://www.linkedin.com/in/harbor-dental-owner',
              snippet: 'Owner at Harbor Dental · San Diego, California',
            },
          ],
        },
      },
    );
    assert.equal(titled.people.length, 0);

    const mismatch = await resolveAgentFallback(
      { company_name: 'Harbor Dental', city: 'San Diego', state: 'CA' },
      {
        live: true,
        serperEnabled: true,
        serper: new SerperCreditTracker(),
        serperOrganic: {
          organic: [
            {
              title: 'Maya Chen - Owner - Harbor Dental',
              link: 'https://www.linkedin.com/in/alex-other-example',
              snippet: 'Owner at Harbor Dental · San Diego, California',
            },
          ],
        },
      },
    );
    assert.equal(mismatch.people.length, 0);
  });
});
