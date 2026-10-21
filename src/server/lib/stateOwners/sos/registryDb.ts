/**
 * Supabase-backed FL / IL registry lookups (project set by BO_SUPABASE_URL).
 * Token-checked RPCs in schema business_owners; the service holds no index in memory.
 * Env: BO_SUPABASE_URL, BO_SUPABASE_KEY (publishable/anon), BO_REGISTRY_TOKEN.
 */
export function registryDbConfigured(): boolean {
  return Boolean(process.env.BO_SUPABASE_URL && process.env.BO_SUPABASE_KEY && process.env.BO_REGISTRY_TOKEN);
}

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  const url = String(process.env.BO_SUPABASE_URL).replace(/\/$/, '');
  const key = String(process.env.BO_SUPABASE_KEY);
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tok: process.env.BO_REGISTRY_TOKEN, ...body }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface FlEntityRow {
  doc: string; name_key: string; city: string; principal_street: string; mail_street: string;
  ra_name: string; ra_type: string; ra_street: string;
  officers: Array<{ title: string; name: string; street: string }>;
}
export interface FlFicRow {
  doc: string; name_key: string; city: string; street: string; owner_name: string; owner_type: string; owner_street: string; owner_doc: string;
}
export async function lookupFlDb(keys: string[]): Promise<{ entities: FlEntityRow[]; fictitious: FlFicRow[] } | null> {
  return rpc('bo_lookup_fl', { keys });
}

export interface IlDbRow { file: string; name_key: string; city: string | null; managers: Array<{ name: string; street: string; city: string }> }
export async function lookupIlDb(keys: string[]): Promise<IlDbRow[] | null> {
  return rpc('bo_lookup_il', { keys });
}

export interface FlCross { by_person: Array<{ doc: string; name_key: string; city: string }>; by_ra: Array<{ doc: string; name_key: string; city: string }>; by_street: Array<{ doc: string; name_key: string; city: string }> }
export async function flCrossDb(person: string | null, street: string | null, city: string | null): Promise<FlCross | null> {
  return rpc('bo_fl_cross', { person, street, city });
}

export interface FlLicenseRow { name_key: string; license_no: string; class: string; person: string; city: string; status: string }
export async function lookupFlLicenseDb(keys: string[]): Promise<FlLicenseRow[] | null> {
  return rpc('bo_lookup_fl_license', { keys });
}

/** Name-key prefix search in one city (trade names often extend the legal name). */
export async function lookupFlPrefixDb(prefix: string, city: string): Promise<{ entities: FlEntityRow[]; fictitious: FlFicRow[] } | null> {
  return rpc('bo_lookup_fl_prefix', { prefix, city });
}
