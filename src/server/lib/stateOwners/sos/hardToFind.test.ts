import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptHardName, isFranchiseBrand, isGenericName, parseHardHit } from './hardToFind.js';

test('generic and place names rejected', () => {
  assert.equal(isGenericName('North Carolina'), true);
  assert.equal(isGenericName('Auto Shop'), true);
  assert.equal(isGenericName('Jane Doe'), false);
});
test('accept rule: surname in company or two sources', () => {
  assert.equal(acceptHardName('Ray Doe', 'Doe Mechanical Inc', 1), true);
  assert.equal(acceptHardName('Ray Smith', 'Doe Mechanical Inc', 1), false);
  assert.equal(acceptHardName('Ray Smith', 'Doe Mechanical Inc', 2), true);
});
test('franchise brands skipped', () => {
  assert.equal(isFranchiseBrand('Two Maids'), true);
  assert.equal(isFranchiseBrand('Doe Mechanical'), false);
});
test('parses LinkedIn title', () => {
  const n = parseHardHit('li_title', { title: 'Jane Doe - Owner - Doe Mechanical | LinkedIn', snippet: '' }, 'Doe Mechanical');
  assert.equal(n, 'Jane Doe');
});
