import { DESKTOP_UA } from '../http.js';
import { validateOfficerPersonName } from '../names.js';
import type { LookupContext } from './context.js';
import { ctxFetch } from './context.js';
import type { NameLookupInput, WaterfallOwnerHit } from './types.js';
import { attachConfidence } from './confidence.js';

export function findNamedPersonUrlFromEnv(): string | null {
  return process.env.FIND_NAMED_PERSON_URL?.trim() || null;
}

export function findNamedPersonClientTag(): string {
  return process.env.FIND_NAMED_PERSON_CLIENT_TAG?.trim() || 'business_owners';
}

interface LookupOnePayload {
  first_name?: string;
  last_name?: string;
  job_title?: string;
  title?: string;
  source_url?: string;
  linkedin_url?: string;
}

/**
 * Optional last-resort when SOS is agent-only. The find-named-person MCP is
 * table-based; this calls a single-row HTTP shim if FIND_NAMED_PERSON_URL is set.
 */
export async function lookupFindNamedPerson(
  input: NameLookupInput,
  ctx?: LookupContext,
): Promise<WaterfallOwnerHit | null> {
  const base = (ctx?.findNamedPersonUrl !== undefined ? ctx.findNamedPersonUrl : findNamedPersonUrlFromEnv()) || '';
  if (!base) return null;
  if (ctx && ctx.live === false && !ctx.fetch) return null;

  const url = `${base.replace(/\/$/, '')}/lookup-one`;
  try {
    const res = await ctxFetch(ctx)(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': DESKTOP_UA,
      },
      body: JSON.stringify({
        company_name: input.company_name,
        city: input.city || null,
        state: input.state,
        domain: input.domain || null,
        client_tag: findNamedPersonClientTag(),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as LookupOnePayload & { person?: LookupOnePayload };
    const person = json.person || json;
    const first = String(person.first_name || '').trim();
    const last = String(person.last_name || '').trim();
    const verdict = validateOfficerPersonName(`${first} ${last}`, [input.city]);
    if (!verdict.ok) return null;
    return attachConfidence({
      first_name: verdict.first_name,
      last_name: verdict.last_name,
      title: person.job_title || person.title || 'Owner',
      company_name: input.company_name,
      domain: input.domain ?? null,
      source_url: person.source_url || person.linkedin_url || url,
      confidence: 'medium',
      state: input.state,
      source: 'find_named_person',
      role: 'owner',
      coverage_reason: null,
    });
  } catch {
    return null;
  }
}
