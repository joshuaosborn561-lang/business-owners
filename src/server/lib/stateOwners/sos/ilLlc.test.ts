import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ilManagerPerson, ilNormName, matchIlLlc, parseIlManagerLine } from './ilLlc.js';

test('normalizes LLC suffixes', () => {
  assert.equal(ilNormName('Acme Plumbing, L.L.C.'), ilNormName('ACME PLUMBING LLC'));
});
test('manager person vs entity', () => {
  assert.equal(ilManagerPerson('DOE, JANE A.'), 'JANE A. DOE');
  assert.equal(ilManagerPerson('DOE FAMILY TRUST'), null);
});
test('parses manager line', () => {
  const line = '00000019' + 'DOE, JANE'.padEnd(60) + '1 MAIN ST'.padEnd(45) + 'CHICAGO'.padEnd(30) + 'IL60614';
  assert.deepEqual(parseIlManagerLine(line), { file: '00000019', name: 'DOE, JANE', city: 'CHICAGO' });
});
test('matches with city tie-break', () => {
  const index = {
    byName: new Map([[ilNormName('Acme LLC'), ['1', '2']]]),
    city: new Map([['1', 'PEORIA'], ['2', 'CHICAGO']]),
    managers: new Map([['2', 'DOE, JANE']]),
  };
  const hit = matchIlLlc(index, ['Acme'], 'Chicago');
  assert.equal(hit?.file, '2');
  assert.equal(hit?.roster[0].name, 'JANE DOE');
  assert.equal(matchIlLlc(index, ['Acme'], 'Springfield'), null);
});
