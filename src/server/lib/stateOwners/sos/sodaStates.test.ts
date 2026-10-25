import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LookupContext } from './context.js';
import { resolveSodaState } from './sodaStates.js';
import { isWaterfallReady } from './waterfall.js';

function ctxWith(rows: unknown[]): LookupContext {
  return {
    live: false,
    fetch: async () => new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  };
}

describe('Oregon open data (tckn-sxa6)', () => {
  it('accepts the authorized representative only on an assumed business name', async () => {
    const abn = [
      { registry_number: '1', business_name: 'ROSE CITY PLUMBING', entity_type: 'ASSUMED BUSINESS NAME', associated_name_type: 'AUTHORIZED REPRESENTATIVE', first_name: 'Nora', last_name: 'Kim', city: 'PORTLAND' },
      { registry_number: '1', business_name: 'ROSE CITY PLUMBING', entity_type: 'ASSUMED BUSINESS NAME', associated_name_type: 'PRINCIPAL PLACE OF BUSINESS', address: '1 MAIN ST', city: 'PORTLAND' },
    ];
    const r = await resolveSodaState({ company_name: 'Rose City Plumbing', city: 'Portland', state: 'OR' }, ctxWith(abn));
    assert.ok(r);
    assert.equal(r!.people[0].last_name?.toUpperCase(), 'KIM');
    assert.equal(r!.people[0].title, 'Owner (assumed business name)');
    assert.ok(isWaterfallReady(r!.people[0]));
  });
  it('does not promote a representative on an LLC and falls back to the person-RA rule', async () => {
    const llc = [
      { registry_number: '2', business_name: 'ROSE CITY PLUMBING LLC', entity_type: 'DOMESTIC LIMITED LIABILITY COMPANY', associated_name_type: 'AUTHORIZED REPRESENTATIVE', first_name: 'Some', last_name: 'Filer', city: 'PORTLAND' },
      { registry_number: '2', business_name: 'ROSE CITY PLUMBING LLC', entity_type: 'DOMESTIC LIMITED LIABILITY COMPANY', associated_name_type: 'REGISTERED AGENT', first_name: 'Nora', last_name: 'Kim', address: '1 MAIN ST', city: 'PORTLAND' },
      { registry_number: '2', business_name: 'ROSE CITY PLUMBING LLC', entity_type: 'DOMESTIC LIMITED LIABILITY COMPANY', associated_name_type: 'PRINCIPAL PLACE OF BUSINESS', address: '1 MAIN ST', city: 'PORTLAND' },
    ];
    const r = await resolveSodaState({ company_name: 'Rose City Plumbing', city: 'Portland', state: 'OR' }, ctxWith(llc));
    assert.ok(r, 'person RA at the business address is promoted');
    assert.equal(r!.people[0].last_name?.toUpperCase(), 'KIM');
    assert.equal(r!.agent_promoted, 'same_address');
    const noRa = llc.filter((x) => x.associated_name_type !== 'REGISTERED AGENT');
    const r2 = await resolveSodaState({ company_name: 'Rose City Plumbing', city: 'Portland', state: 'OR' }, ctxWith(noRa));
    assert.equal(r2, null, 'the LLC filer is not an owner');
  });
});
