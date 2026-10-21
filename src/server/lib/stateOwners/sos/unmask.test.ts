import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeShellEntity, operatorsAtAddress, streetLine } from './unmask.js';

test('shell entity names', () => {
  assert.equal(looksLikeShellEntity('1445 Ross Ave LLC'), true);
  assert.equal(looksLikeShellEntity('Northside Holdings LLC'), true);
  assert.equal(looksLikeShellEntity('Bright Smile Family Dentistry'), false);
});

test('street line', () => {
  assert.equal(streetLine('12 Main St Ste 4, Austin, TX 78701'), '12 Main St Ste 4');
  assert.equal(streetLine('Austin, TX'), null);
});

test('operators at address skip self and virtual offices', () => {
  const ops = operatorsAtAddress('100 Glass Site LLC', '500 Oak Ave', [
    { title: '100 Glass Site LLC', address: '500 Oak Ave, X, TX' },
    { title: 'The UPS Store', address: '500 Oak Ave, X, TX' },
    { title: 'Acme Sitework Co', address: '500 Oak Ave Ste 2, X, TX' },
    { title: 'Far Away Inc', address: '9 Elm St, X, TX' },
  ]);
  assert.deepEqual(ops, ['Acme Sitework Co']);
});

import { siblingEntitiesFromOrganic } from './unmask.js';
test('sibling entities from organic', () => {
  const sibs = siblingEntitiesFromOrganic('100 Glass Site LLC', [
    { title: '100 Glass Site LLC in Austin, TX', snippet: 'Also at this address: Acme Sitework, LLC and Registered Agents Inc' },
  ]);
  assert.deepEqual(sibs, ['Acme Sitework, LLC']);
});
