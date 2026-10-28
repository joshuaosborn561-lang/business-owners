import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkPlausiblePersonName, isNonOwnerTitle } from './personName.js';
import { validateOfficerPersonName } from './names.js';
import { isWaterfallReady } from './sos/waterfall.js';
import type { WaterfallOwnerHit } from './sos/types.js';

describe('checkPlausiblePersonName', () => {
  it('accepts ordinary people, including surnames that are also common nouns', () => {
    for (const [f, l] of [['Daniel', 'Forte'], ['Shannon S', 'Russell'], ['Kevin', 'Krikorian'], ['Maria', "O'Brien"], ['Jean-Luc', 'Picard'], ['Tom', 'Baker'], ['Ann', 'Mason'], ['Bob', 'Cook'], ['J.', 'Carpenter']]) {
      assert.equal(checkPlausiblePersonName(f, l).ok, true, `${f} ${l}`);
    }
  });
  it('rejects business words, page text and junk', () => {
    for (const [f, l] of [['Self', 'Storage'], ['Sports', 'Lounge'], ['Customer', 'Service'], ['About', 'Us'], ['Dental', 'Group'], ['The', 'Team'], ['John', 'Smith2'], ['A', 'B'], ['Brewing', 'Company'], ['Contact', 'Us'], ['Pizza', 'Pizza']]) {
      assert.equal(checkPlausiblePersonName(f, l).ok, false, `${f} ${l}`);
    }
  });
  it('is wired into validateOfficerPersonName for every source', () => {
    assert.equal(validateOfficerPersonName('Self Storage').ok, false);
    assert.equal(validateOfficerPersonName('Kevin Krikorian').ok, true);
  });
});

describe('isNonOwnerTitle', () => {
  it('flags staff titles but not owner-type titles', () => {
    for (const t of ['Manager', 'General Manager', 'Office Manager', 'Assistant', 'Supervisor', 'Sales Representative']) assert.equal(isNonOwnerTitle(t), true, t);
    for (const t of ['Owner', 'Owner/Manager', 'President', 'Managing Member', 'Founder & CEO', 'Principal', 'Co-Owner', null, '']) assert.equal(isNonOwnerTitle(t as string), false, String(t));
  });
});

describe('isWaterfallReady guards', () => {
  const base = (over: Partial<WaterfallOwnerHit>): WaterfallOwnerHit =>
    ({ first_name: 'Samina', last_name: 'Zanzi', title: 'Owner', company_name: 'X', source_url: 'https://example.com/p', confidence: 'high', source: 'linkedin', role: 'owner', coverage_reason: null, state: 'CA', ...over }) as WaterfallOwnerHit;
  it('passes a normal LinkedIn owner', () => assert.equal(isWaterfallReady(base({})), true));
  it('rejects a hard_to_find non-person', () => assert.equal(isWaterfallReady(base({ source: 'hard_to_find', first_name: 'Self', last_name: 'Storage' })), false));
  it('rejects a manager from a web source', () => assert.equal(isWaterfallReady(base({ title: 'Manager' })), false));
  it('rejects a free-text hit that just echoes the company name', () => {
    assert.equal(isWaterfallReady(base({ source: 'hard_to_find', first_name: 'Action', last_name: 'Lanes', company_name: 'Action Lanes' })), false);
    assert.equal(isWaterfallReady(base({ source: 'hard_to_find', first_name: 'Jiu', last_name: 'Jitsu', company_name: 'Academy of Jiu Jitsu - Ripon' })), false);
    assert.equal(isWaterfallReady(base({ source: 'serper', first_name: 'Action', last_name: 'Lanes', company_name: 'Action Lanes' })), false);
  });
  it('keeps a real person on a free-text source when only the surname is in the company name', () => {
    assert.equal(isWaterfallReady(base({ source: 'hard_to_find', first_name: 'Pat', last_name: 'Blach', company_name: 'Blach Beverage LLC' })), true);
  });
  it('keeps registry officer titles untouched', () => assert.equal(isWaterfallReady(base({ source: 'ca_bizfile', title: 'Manager', confidence: 'high' })), true));
});
