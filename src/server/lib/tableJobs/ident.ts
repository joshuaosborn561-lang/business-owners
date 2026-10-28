/**
 * Identifier + filter validation for table-driven jobs.
 *
 * The database re-validates everything (supabase/migrations/20261028_table_jobs.sql). These checks run first so a
 * bad request never reaches the database, and so the error message is clear.
 *
 * Rules: lowercase [a-z_][a-z0-9_]{0,62} only (no quoting, no dots inside a part, no case folding surprises),
 * schema must be on the allowlist, filters are structured (column, op, value), never SQL text.
 */

export const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;
export const DEST_NAME_RE = /^bo_[a-z0-9_]{1,60}$/;

/** Mirrors the defaults in bo_jobs.allowed_schema. Override with TABLE_JOBS_READ_SCHEMAS / TABLE_JOBS_WRITE_SCHEMAS. */
export const DEFAULT_READ_SCHEMAS = [
  'scratch',
  'client_emcor',
  'client_salesglider',
  'client_peterson',
  'client_techevo',
  'lp',
  'public',
];
export const DEFAULT_WRITE_SCHEMAS = ['scratch', 'client_emcor', 'client_salesglider', 'client_peterson', 'client_techevo'];

export const COLUMN_TARGETS = [
  'company_name',
  'city',
  'state',
  'phone',
  'domain',
  'website',
  'address',
  'mailing_address',
] as const;
export type ColumnTarget = (typeof COLUMN_TARGETS)[number];

export const FILTER_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'in',
  'not_in',
  'is_null',
  'not_null',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface TableFilter {
  column: string;
  op?: FilterOp;
  value?: string | number | boolean | null;
  values?: Array<string | number | boolean>;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function schemaListFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const s of list) if (!IDENT_RE.test(s)) throw new ValidationError(`${name}: invalid schema name`);
  return list;
}

export function readSchemas(): string[] {
  return schemaListFromEnv('TABLE_JOBS_READ_SCHEMAS', DEFAULT_READ_SCHEMAS);
}
export function writeSchemas(): string[] {
  return schemaListFromEnv('TABLE_JOBS_WRITE_SCHEMAS', DEFAULT_WRITE_SCHEMAS);
}

export function validateIdentifier(value: unknown, what: string): string {
  if (typeof value !== 'string' || !IDENT_RE.test(value)) {
    throw new ValidationError(`${what} must be lowercase letters, digits and underscores (max 63), starting with a letter or underscore`);
  }
  return value;
}

/** 'schema.table' -> parts, checked against the allowlist. */
export function parseTableRef(
  spec: unknown,
  kind: 'read' | 'write',
  schemas: string[] = kind === 'read' ? readSchemas() : writeSchemas(),
): { schema: string; table: string; ref: string } {
  if (typeof spec !== 'string') throw new ValidationError('table must be a string like schema.table');
  const parts = spec.split('.');
  if (parts.length !== 2) throw new ValidationError('table must be schema.table');
  const [schema, table] = parts;
  validateIdentifier(schema, 'schema');
  validateIdentifier(table, 'table');
  if (!schemas.includes(schema)) {
    throw new ValidationError(`schema "${schema}" is not allowed for ${kind === 'read' ? 'sources' : 'destinations'} (allowed: ${schemas.join(', ')})`);
  }
  if (kind === 'write' && !DEST_NAME_RE.test(table)) {
    throw new ValidationError('destination table name must start with bo_ (lowercase letters, digits, underscores)');
  }
  return { schema, table, ref: `${schema}.${table}` };
}

export function validateFilters(filters: unknown): TableFilter[] {
  if (filters == null) return [];
  if (!Array.isArray(filters)) throw new ValidationError('filters must be an array of { column, op, value }');
  if (filters.length > 20) throw new ValidationError('at most 20 filters');
  return filters.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new ValidationError(`filters[${i}] must be an object`);
    const f = raw as Record<string, unknown>;
    const column = validateIdentifier(f.column, `filters[${i}].column`);
    const op = String(f.op ?? 'eq').toLowerCase() as FilterOp;
    if (!FILTER_OPS.includes(op)) throw new ValidationError(`filters[${i}].op must be one of ${FILTER_OPS.join(', ')}`);
    const scalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    if (op === 'is_null' || op === 'not_null') return { column, op };
    if (op === 'in' || op === 'not_in') {
      const values = f.values;
      if (!Array.isArray(values) || values.length < 1 || values.length > 1000 || !values.every(scalar)) {
        throw new ValidationError(`filters[${i}].values must be 1-1000 strings/numbers`);
      }
      for (const v of values) if (String(v).length > 200) throw new ValidationError(`filters[${i}] value too long`);
      return { column, op, values: values as Array<string | number | boolean> };
    }
    if (!scalar(f.value)) throw new ValidationError(`filters[${i}].value must be a string, number or boolean`);
    if (String(f.value).length > 200) throw new ValidationError(`filters[${i}] value too long`);
    return { column, op, value: f.value as string | number | boolean };
  });
}

export function validateColumnMap(map: unknown): Partial<Record<ColumnTarget, string>> {
  if (map == null) return {};
  if (typeof map !== 'object' || Array.isArray(map)) throw new ValidationError('column_map must be an object');
  const out: Partial<Record<ColumnTarget, string>> = {};
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    if (!(COLUMN_TARGETS as readonly string[]).includes(k)) {
      throw new ValidationError(`column_map key "${k}" is not supported (use ${COLUMN_TARGETS.join(', ')})`);
    }
    out[k as ColumnTarget] = validateIdentifier(v, `column_map.${k}`);
  }
  return out;
}

const DETECT: Record<ColumnTarget, string[]> = {
  company_name: ['company_name', 'name', 'business_name', 'company', 'title'],
  city: ['city'],
  state: ['state', 'state_code', 'st'],
  phone: ['phone', 'phone_number', 'phone_e164'],
  domain: ['domain', 'company_domain'],
  website: ['website', 'url', 'site'],
  address: ['address', 'street_address', 'street'],
  mailing_address: ['mailing_address'],
};

/** Fill gaps in an explicit column_map from the table's real columns. Explicit entries always win. */
export function detectColumnMap(
  columns: string[],
  explicit: Partial<Record<ColumnTarget, string>>,
): Partial<Record<ColumnTarget, string>> {
  const out: Partial<Record<ColumnTarget, string>> = { ...explicit };
  const have = new Set(columns);
  for (const target of COLUMN_TARGETS) {
    if (out[target]) continue;
    const hit = DETECT[target].find((c) => have.has(c));
    if (hit) out[target] = hit;
  }
  return out;
}
