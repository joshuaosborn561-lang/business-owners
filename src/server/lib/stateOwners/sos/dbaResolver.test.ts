import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dbaFbnQuery, dbaLlcIncQuery, resolveDbaLegalName } from './dbaResolver.js';
import { SerperCreditTracker } from './spend.js';

describe('DBA resolver', () => {
  it('builds the LLC OR Inc Serper query', () => {
    assert.match(dbaLlcIncQuery({ company_name: 'Joe\'s HVAC', city: 'Fresno', state: 'CA' }), /LLC OR Inc/);
    assert.match(dbaFbnQuery({ company_name: 'Joe\'s HVAC', city: 'Fresno', state: 'CA' }), /fictitious business name/i);
  });

  it('splits an input legal-name DBA', async () => {
    const got = await resolveDbaLegalName(
      { company_name: 'Acme Holdings LLC DBA Joe HVAC', city: 'Fresno', state: 'CA' },
      { live: false },
    );
    assert.equal(got.source, 'input_dba');
    assert.match(got.legal_name, /Acme Holdings LLC/i);
    assert.match(got.dba_name || '', /Joe HVAC/i);
  });

  it('reads a copyright line from the company website fixture', async () => {
    const html =
      '<html><footer>© 2024 Valley Mechanical Services LLC. All rights reserved.</footer></html>';
    const got = await resolveDbaLegalName(
      { company_name: 'Valley Air', city: 'Fresno', state: 'CA', domain: 'valleyair.example' },
      {
        live: false,
        htmlByUrl: {
          'https://valleyair.example/': html,
        },
        serper: new SerperCreditTracker(),
      },
    );
    assert.equal(got.source, 'website');
    assert.match(got.legal_name, /Valley Mechanical Services LLC/i);
    assert.equal(got.serper_credits, 0);
  });

  it('upgrades a trade name from a Serper LLC snippet', async () => {
    const got = await resolveDbaLegalName(
      { company_name: 'Sunrise Pets', city: 'Oakland', state: 'CA' },
      {
        live: true,
        serperEnabled: true,
        serper: new SerperCreditTracker(),
        serperOrganic: {
          organic: [
            {
              title: 'Sunrise Companion Care LLC | Oakland',
              link: 'https://opencorporates.com/companies/us_ca/123',
              snippet: 'Legal name: Sunrise Companion Care LLC doing business as Sunrise Pets in Oakland, CA.',
            },
          ],
        },
      },
    );
    assert.equal(got.source, 'serper');
    assert.match(got.legal_name, /Sunrise Companion Care LLC/i);
  });
});
