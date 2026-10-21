/**
 * Free state open-data (Socrata) owner sources, queried live (no bulk load):
 *  CT  data.ct.gov Business Master (n7gp-d28j) → Principals (ka36-64k6)
 *  OR  data.oregon.gov Active Businesses (tckn-sxa6): authorized representative / RA
 *  CO  data.colorado.gov Business Entities (4ykn-tg5h): registered agent (person-RA rule)
 *  NY  data.ny.gov Active Corporations (n9v6-gdp6): DOS process name (person-RA rule)
 */
import { normalizeState } from '../names.js';
import type { LookupContext } from './context.js';
import { ctxFetch } from './context.js';
import { ilNormName } from './ilLlc.js';
import { hitsFromRoster, type RosterEntry } from './officers.js';
import type { NameLookupInput, NameLookupResult } from './types.js';
import { promoteAgentCandidate } from './waterfall.js';

export const SODA_STATES = new Set(['CT', 'OR', 'CO', 'NY']);

function tokensWhere(col: string, company: string): string | null {
  const toks = String(company).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
    .filter((t) => t.length > 2 && !/^(LLC|INC|THE|AND|CORP|COMPANY|CO)$/.test(t)).slice(0, 4);
  if (!toks.length) return null;
  return toks.map((t) => `upper(${col}) like '%${t.replace(/'/g, "''")}%'`).join(' AND ');
}

async function soda(ctx: LookupContext | undefined, url: string): Promise<Array<Record<string, string>>> {
  try {
    const res = await ctxFetch(ctx)(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) } as RequestInit);
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

const exact = (a: string, b: string) => ilNormName(a) === ilNormName(b) && ilNormName(a).length >= 3;
const name = (f?: string, l?: string) => [f, l].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

function ok(input: NameLookupInput, roster: RosterEntry[], url: string, cityMatch: boolean): NameLookupResult | null {
  const people = hitsFromRoster(input, roster, 'us_sos', url, 'exact', { cityMatch });
  return people.length ? { people, coverage_reason: null, source: 'us_sos', source_url: url, match_method: 'exact', implemented: true } : null;
}

export async function resolveSodaState(input: NameLookupInput, ctx?: LookupContext): Promise<NameLookupResult | null> {
  const st = normalizeState(input.state);
  const city = String(input.city || '').toUpperCase();
  if (st === 'CT') {
    const w = tokensWhere('name', input.company_name);
    if (!w) return null;
    const url = `https://data.ct.gov/resource/n7gp-d28j.json?$select=id,name,billingcity&$where=${encodeURIComponent(w)}&$limit=50`;
    const rows = (await soda(ctx, url)).filter((r) => exact(r.name, input.company_name));
    const pick = rows.find((r) => String(r.billingcity || '').toUpperCase() === city) || (rows.length === 1 ? rows[0] : null);
    if (!pick) return null;
    const purl = `https://data.ct.gov/resource/ka36-64k6.json?business_id=${encodeURIComponent(pick.id)}&$limit=10`;
    const roster = (await soda(ctx, purl)).map((p) => ({ name: name(p.firstname, p.lastname), title: 'Principal', role: 'officer' as const, labeled: true })).filter((p) => p.name);
    return ok(input, roster.slice(0, 4), purl, true);
  }
  if (st === 'OR') {
    const w = tokensWhere('business_name', input.company_name);
    if (!w) return null;
    const url = `https://data.oregon.gov/resource/tckn-sxa6.json?$where=${encodeURIComponent(`${w} AND associated_name_type in ('AUTHORIZED REPRESENTATIVE','REGISTERED AGENT','PRINCIPAL PLACE OF BUSINESS')`)}&$limit=100`;
    const rows = (await soda(ctx, url)).filter((r) => exact(r.business_name, input.company_name));
    if (!rows.length) return null;
    const regs = [...new Set(rows.map((r) => r.registry_number))];
    const reg = regs.length === 1 ? regs[0] : rows.find((r) => r.associated_name_type === 'PRINCIPAL PLACE OF BUSINESS' && String(r.city || '').toUpperCase() === city)?.registry_number;
    if (!reg) return null;
    const mine = rows.filter((r) => r.registry_number === reg);
    const rep = mine.find((r) => r.associated_name_type === 'AUTHORIZED REPRESENTATIVE' && r.last_name);
    if (rep) return ok(input, [{ name: name(rep.first_name, rep.last_name), title: 'Authorized Representative', role: 'owner', labeled: true }], url, true);
    const ra = mine.find((r) => r.associated_name_type === 'REGISTERED AGENT' && r.last_name);
    const ppb = mine.find((r) => r.associated_name_type === 'PRINCIPAL PLACE OF BUSINESS');
    const p = ra ? promoteAgentCandidate(input, name(ra.first_name, ra.last_name), 'us_sos', url, { agentAddress: ra.address, businessAddress: ppb?.address }) : null;
    return p?.accepted ? { people: [p.hit], coverage_reason: null, source: 'us_sos', source_url: url, implemented: true, agent_promoted: p.reason } : null;
  }
  if (st === 'CO') {
    const w = tokensWhere('entityname', input.company_name);
    if (!w) return null;
    const url = `https://data.colorado.gov/resource/4ykn-tg5h.json?$where=${encodeURIComponent(w)}&$limit=50`;
    const rows = (await soda(ctx, url)).filter((r) => exact(r.entityname, input.company_name) && r.agentlastname);
    const pick = rows.find((r) => String(r.principalcity || '').toUpperCase() === city) || (rows.length === 1 ? rows[0] : null);
    if (!pick) return null;
    const p = promoteAgentCandidate(input, name(pick.agentfirstname, pick.agentlastname), 'us_sos', url, { agentAddress: pick.agentprincipaladdress1, businessAddress: pick.principaladdress1 });
    return p?.accepted ? { people: [p.hit], coverage_reason: null, source: 'us_sos', source_url: url, implemented: true, agent_promoted: p.reason } : null;
  }
  if (st === 'NY') {
    const w = tokensWhere('current_entity_name', input.company_name);
    if (!w) return null;
    const url = `https://data.ny.gov/resource/n9v6-gdp6.json?$where=${encodeURIComponent(w)}&$limit=50`;
    const rows = (await soda(ctx, url)).filter((r) => exact(r.current_entity_name, input.company_name) && r.dos_process_name);
    const pick = rows.find((r) => String(r.dos_process_city || '').toUpperCase() === city) || (rows.length === 1 ? rows[0] : null);
    if (!pick) return null;
    const p = promoteAgentCandidate(input, pick.dos_process_name, 'us_sos', url, {});
    return p?.accepted ? { people: [p.hit], coverage_reason: null, source: 'us_sos', source_url: url, implemented: true, agent_promoted: p.reason } : null;
  }
  return null;
}
