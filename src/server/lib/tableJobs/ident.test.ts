import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ValidationError,
  detectColumnMap,
  parseTableRef,
  validateColumnMap,
  validateFilters,
  validateIdentifier,
} from './ident.js';

const throwsValidation = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ValidationError);

describe('table job identifiers', () => {
  it('accepts plain lowercase identifiers', () => {
    assert.equal(validateIdentifier('place_id', 'c'), 'place_id');
    assert.equal(validateIdentifier('_x1', 'c'), '_x1');
  });

  for (const bad of [
    'Place_Id',
    'a-b',
    'a b',
    'a;drop table x',
    'a"b',
    "a'b",
    'a.b',
    '1abc',
    '',
    'x'.repeat(64),
    'a\nb',
    'a--',
    'a/**/b',
    'a)or(1=1',
  ]) {
    it(`rejects identifier ${JSON.stringify(bad).slice(0, 30)}`, () => throwsValidation(() => validateIdentifier(bad, 'c')));
  }

  it('rejects non-strings', () => {
    throwsValidation(() => validateIdentifier(5, 'c'));
    throwsValidation(() => validateIdentifier(null, 'c'));
    throwsValidation(() => validateIdentifier({ a: 1 }, 'c'));
  });
});

describe('table refs and schema allowlists', () => {
  it('allows listed read schemas', () => {
    assert.deepEqual(parseTableRef('client_emcor.some_table', 'read'), { schema: 'client_emcor', table: 'some_table', ref: 'client_emcor.some_table' });
    assert.equal(parseTableRef('public.emcor_companies', 'read').ref, 'public.emcor_companies');
  });

  it('rejects schemas that are not allowlisted', () => {
    for (const s of ['claude', 'auth', 'pg_catalog', 'information_schema', 'business_owners', 'bo_jobs', 'storage', 'vault', 'private', 'topup', 'crmbrain']) {
      throwsValidation(() => parseTableRef(`${s}.t`, 'read'));
    }
  });

  it('writes are narrower than reads and need a bo_ table name', () => {
    throwsValidation(() => parseTableRef('public.bo_x', 'write'));
    throwsValidation(() => parseTableRef('lp.bo_x', 'write'));
    throwsValidation(() => parseTableRef('scratch.emcor_companies', 'write'));
    throwsValidation(() => parseTableRef('scratch.BO_x', 'write'));
    assert.equal(parseTableRef('scratch.bo_owners_run1', 'write').ref, 'scratch.bo_owners_run1');
    assert.equal(parseTableRef('client_emcor.bo_owner_hits', 'write').ref, 'client_emcor.bo_owner_hits');
  });

  it('rejects malformed refs and injection attempts', () => {
    for (const bad of ['scratch', 'a.b.c', 'scratch.t; drop table x', 'scratch."t"', 'scratch.t--', '.t', 'scratch.', 'scratch.t union select 1', '../etc.passwd']) {
      throwsValidation(() => parseTableRef(bad, 'read'));
    }
    throwsValidation(() => parseTableRef(42, 'read'));
  });

  it('honors TABLE_JOBS_* env overrides', () => {
    process.env.TABLE_JOBS_READ_SCHEMAS = 'scratch';
    try {
      throwsValidation(() => parseTableRef('public.x', 'read'));
      assert.equal(parseTableRef('scratch.x', 'read').ref, 'scratch.x');
    } finally {
      delete process.env.TABLE_JOBS_READ_SCHEMAS;
    }
  });
});

describe('filters are structured, never SQL', () => {
  it('normalizes valid filters', () => {
    const f = validateFilters([
      { column: 'state', value: 'CA' },
      { column: 'n', op: 'gte', value: 5 },
      { column: 'status', op: 'in', values: ['a', 'b'] },
      { column: 'domain', op: 'is_null' },
    ]);
    assert.deepEqual(f[0], { column: 'state', op: 'eq', value: 'CA' });
    assert.equal(f.length, 4);
  });

  it('rejects bad columns, ops and shapes', () => {
    throwsValidation(() => validateFilters('state = 1'));
    throwsValidation(() => validateFilters([{ column: 'a; drop table x', value: 1 }]));
    throwsValidation(() => validateFilters([{ column: 'a', op: 'exec', value: 1 }]));
    throwsValidation(() => validateFilters([{ column: 'a', op: 'eq', value: { x: 1 } }]));
    throwsValidation(() => validateFilters([{ column: 'a', op: 'in', values: [] }]));
    throwsValidation(() => validateFilters([{ column: 'a', op: 'in', values: [{}] }]));
    throwsValidation(() => validateFilters(['a=1']));
    throwsValidation(() => validateFilters(new Array(21).fill({ column: 'a', value: 1 })));
    throwsValidation(() => validateFilters([{ column: 'a', value: 'x'.repeat(201) }]));
  });

  it('lets hostile VALUES through as plain data (the database quotes them with %L)', () => {
    const f = validateFilters([{ column: 'name', op: 'eq', value: "x'; drop table t; --" }]);
    assert.equal(f[0].value, "x'; drop table t; --");
  });
});

describe('column maps', () => {
  it('validates keys and column names', () => {
    assert.deepEqual(validateColumnMap({ company_name: 'name', state: 'st' }), { company_name: 'name', state: 'st' });
    throwsValidation(() => validateColumnMap({ owner: 'x' }));
    throwsValidation(() => validateColumnMap({ company_name: 'a;b' }));
    throwsValidation(() => validateColumnMap([]));
  });

  it('auto-detects, explicit entries win', () => {
    const cols = ['place_id', 'name', 'company_name', 'city', 'state', 'phone', 'domain'];
    assert.deepEqual(detectColumnMap(cols, {}), { company_name: 'company_name', city: 'city', state: 'state', phone: 'phone', domain: 'domain' });
    assert.equal(detectColumnMap(cols, { company_name: 'name' }).company_name, 'name');
  });
});
