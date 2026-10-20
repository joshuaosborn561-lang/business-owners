import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { resolveHtmlOfficerState, usesHtmlOfficerAdapter } from './htmlStates.js';
import { resolveNameLookup } from './namePath.js';
import { officerPriority } from './officers.js';
import { isWaterfallReady } from './waterfall.js';
import { emptyIlIndex, ingestIlDtaText } from './ilDta.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function html(name: string): string {
  return readFileSync(join(dir, name), 'utf8');
}

describe('HTML registry adapters', () => {
  it('extracts GA officers from official HTML fixtures', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders LLC', city: 'Atlanta', state: 'GA' },
      'GA',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('ga-search.html') : html('ga-detail.html')),
      },
    );
    assert.equal(result.implemented, true);
    assert.equal(result.coverage_reason, null);
    assert.ok(result.people.some((p) => isWaterfallReady(p) && p.last_name === 'SAMPLE'));
  });

  it('extracts NC company officials from HTML fixtures', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Plumbing LLC', city: 'Raleigh', state: 'NC' },
      'NC',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('nc-search.html') : html('nc-detail.html')),
      },
    );
    assert.ok(result.people.some((p) => p.first_name === 'JANE'));
  });

  it('extracts AZ members from the Business Center JSON API shape', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Electric LLC', city: 'Phoenix', state: 'AZ' },
      'AZ',
      {
        live: false,
        azPayload: JSON.parse(html('az-search.json')),
        azDetailPayload: JSON.parse(html('az-detail.json')),
      },
    );
    assert.ok(result.people.some((p) => p.role === 'member' || p.last_name === 'SAMPLE'));
  });

  it('extracts AZ members from HTML fixtures', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Electric LLC', city: 'Phoenix', state: 'AZ' },
      'AZ',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('az-search.html') : html('az-detail.html')),
      },
    );
    assert.ok(result.people.some((p) => p.role === 'member'));
  });

  it('treats recorded Cloudflare search HTML as blocked and never parses officers', async () => {
    const cf = html('nc-cloudflare-just-a-moment.html');
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Plumbing LLC', city: 'Raleigh', state: 'NC' },
      'NC',
      { live: false, htmlFor: cf },
    );
    assert.equal(result.coverage_reason, 'blocked');
    assert.equal(result.people.length, 0);
    assert.equal(result.people.some((p) => isWaterfallReady(p)), false);
  });

  it('does not match the input name against itself when SOS returns no result links', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders LLC', city: 'Atlanta', state: 'GA' },
      'GA',
      { live: false, htmlFor: '<html><body><div>No records found</div></body></html>' },
    );
    assert.equal(result.coverage_reason, 'not_found');
    assert.equal(result.people.length, 0);
  });

  it('does not treat the Arizona empty SPA shell as a company match', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Electric LLC', city: 'Phoenix', state: 'AZ' },
      'AZ',
      { live: false, htmlFor: html('az-spa-shell.html') },
    );
    assert.equal(result.people.length, 0);
    assert.ok(result.coverage_reason === 'not_found' || result.coverage_reason === 'blocked');
  });

  it('uses Apify Playwright only after a blocked direct fetch', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders LLC', city: 'Atlanta', state: 'GA' },
      'GA',
      {
        live: true,
        fetch: async () =>
          new Response('<html>Incapsula incident id 1</html>', {
            status: 403,
            headers: { 'content-type': 'text/html' },
          }),
        apifyFetchHtml: async (url) => ({
          html: /BusinessInformation/i.test(url) ? html('ga-detail.html') : html('ga-search.html'),
          usd: 0.015,
        }),
      },
    );
    assert.equal(result.via_apify, true);
    assert.ok((result.apify_usd || 0) > 0);
    assert.ok(result.people.some((p) => p.last_name === 'SAMPLE'));
  });

  it('extracts TX Comptroller officers from official HTML fixtures', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders LLC', city: 'Austin', state: 'TX' },
      'TX',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('tx-search.html') : html('tx-detail.html')),
      },
    );
    assert.equal(result.implemented, true);
    assert.ok(result.people.some((p) => p.last_name === 'SAMPLE' && p.first_name === 'JANE'));
    assert.equal(result.people[0]?.title, 'President');
  });

  it('extracts MN, UT, and WA officers from official HTML fixtures', async () => {
    const cases: Array<{ state: 'MN' | 'UT' | 'WA'; city: string; search: string; detail: string }> = [
      { state: 'MN', city: 'Minneapolis', search: 'mn-search.html', detail: 'mn-detail.html' },
      { state: 'UT', city: 'Salt Lake City', search: 'ut-search.html', detail: 'ut-detail.html' },
      { state: 'WA', city: 'Seattle', search: 'wa-search.html', detail: 'wa-detail.html' },
    ];
    for (const row of cases) {
      const result = await resolveHtmlOfficerState(
        { company_name: 'Sample Builders LLC', city: row.city, state: row.state },
        row.state,
        {
          live: false,
          htmlFor: (_state, kind) => (kind === 'search' ? html(row.search) : html(row.detail)),
        },
      );
      assert.ok(
        result.people.some((p) => p.last_name === 'SAMPLE' && isWaterfallReady(p)),
        `${row.state} should return a named officer`,
      );
    }
  });

  it('runs TX/GA/IL/MN/UT/WA official registries after a Serper miss', async () => {
    const index = emptyIlIndex();
    ingestIlDtaText(index, readFileSync(join(dir, 'il', 'officers.tsv'), 'utf8'), 'officers.tsv');
    const htmlFor = (state: string, kind: 'search' | 'detail' | 'document') => {
      const map: Record<string, [string, string]> = {
        TX: ['tx-search.html', 'tx-detail.html'],
        GA: ['ga-search.html', 'ga-detail.html'],
        MN: ['mn-search.html', 'mn-detail.html'],
        UT: ['ut-search.html', 'ut-detail.html'],
        WA: ['wa-search.html', 'wa-detail.html'],
      };
      const pair = map[state];
      if (!pair) return null;
      return kind === 'search' ? html(pair[0]) : html(pair[1]);
    };
    const rows: Array<{ state: string; city: string; company: string }> = [
      { state: 'TX', city: 'Austin', company: 'Sample Builders LLC' },
      { state: 'GA', city: 'Atlanta', company: 'Sample Builders LLC' },
      { state: 'IL', city: 'Chicago', company: 'Sample HVAC LLC' },
      { state: 'MN', city: 'Minneapolis', company: 'Sample Builders LLC' },
      { state: 'UT', city: 'Salt Lake City', company: 'Sample Builders LLC' },
      { state: 'WA', city: 'Seattle', company: 'Sample Builders LLC' },
    ];
    for (const row of rows) {
      const result = await resolveNameLookup(
        { company_name: row.company, city: row.city, state: row.state },
        { live: false, serperEnabled: false, ilIndex: index, htmlFor },
      );
      assert.equal(result.implemented, true, `${row.state} should be implemented`);
      assert.notEqual(result.coverage_reason, 'not_implemented', `${row.state} must not stay not_implemented`);
      assert.ok(
        result.people.some((p) => p.last_name === 'SAMPLE' || p.last_name === 'PUBLIC'),
        `${row.state} should name an officer from the free official source`,
      );
    }
  });

  it('matches a punctuation/LLC-stripped SOS query against the registry legal name', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders, L.L.C.', city: 'Atlanta', state: 'GA' },
      'GA',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('ga-search.html') : html('ga-detail.html')),
      },
    );
    assert.ok(result.people.some((p) => p.last_name === 'SAMPLE' && isWaterfallReady(p)));
  });

  it('retries SOS with the DBA-resolved legal name after a trade-name miss', async () => {
    const htmlFor = (_state: string, kind: 'search' | 'detail' | 'document', _input: unknown, url?: string) => {
      const q = decodeURIComponent(String(url || ''));
      if (kind === 'search') {
        if (/Sample Builders/i.test(q)) return html('ga-search.html');
        return '<html><body><div>No records found</div></body></html>';
      }
      return html('ga-detail.html');
    };
    const result = await resolveNameLookup(
      { company_name: 'Sample Crew', city: 'Atlanta', state: 'GA' },
      {
        live: true,
        serperEnabled: true,
        htmlFor,
        serperOrganic: (query) => {
          if (/LLC OR Inc/i.test(query) || /fictitious/i.test(query)) {
            return {
              organic: [
                {
                  title: 'Sample Builders LLC DBA Sample Crew',
                  link: 'https://opencorporates.com/companies/us_ga/1',
                  snippet: 'Legal name: Sample Builders LLC doing business as Sample Crew in Atlanta, GA.',
                },
              ],
            };
          }
          return { organic: [] };
        },
      },
    );
    assert.equal(result.implemented, true);
    assert.match(result.legal_name || '', /Sample Builders LLC/i);
    assert.ok(result.people.some((p) => p.last_name === 'SAMPLE'));
  });

  it('reads TX Comptroller franchise-tax officers and prefers President over VP/CFO', async () => {
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders LLC', city: 'Austin', state: 'TX' },
      'TX',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('tx-search.html') : html('tx-coa-officers.html')),
      },
    );
    assert.equal(result.people[0]?.title, 'President');
    assert.equal(result.people[0]?.first_name, 'JANE');
  });

  it('uses the generic HTML adapter for other officer-publishing states', async () => {
    assert.equal(usesHtmlOfficerAdapter('KY'), true);
    assert.equal(usesHtmlOfficerAdapter('VA'), true);
    assert.equal(usesHtmlOfficerAdapter('OK'), false);
    const result = await resolveHtmlOfficerState(
      { company_name: 'Sample Builders LLC', city: 'Louisville', state: 'KY' },
      'KY',
      {
        live: false,
        htmlFor: (_state, kind) => (kind === 'search' ? html('ky-search.html') : html('ky-detail.html')),
      },
    );
    assert.equal(result.implemented, true);
    assert.equal(result.people[0]?.title, 'President');
    assert.ok(officerPriority(result.people[0]?.title || '') < officerPriority('Vice President'));
    assert.ok(result.people.some((p) => p.last_name === 'SAMPLE' && isWaterfallReady(p)));
  });
});
