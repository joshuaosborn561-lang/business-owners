import type { BoardSource, OwnerConfidence, OwnerRole } from '../types.js';
import type { WaterfallOwnerHit } from './types.js';

export interface ConfidenceInput {
  source: BoardSource;
  role: OwnerRole;
  match_method?: WaterfallOwnerHit['match_method'];
  city_match?: boolean;
  labeled?: boolean;
  serper_score?: number;
  dba_resolved?: boolean;
  title_leadership?: boolean;
  corroborated?: boolean;
  slug_agreed?: boolean;
}

const SOURCE_BASE: Partial<Record<BoardSource, number>> = {
  ca_bizfile: 0.88,
  us_sos: 0.86,
  sunbiz: 0.86,
  tx_sos: 0.86,
  ma_sos: 0.84,
  pa_dos: 0.84,
  serper: 0.62,
  website: 0.55,
  dba: 0.55,
  maps: 0.6,
  fbn: 0.72,
  linkedin: 0.68,
  find_named_person: 0.7,
};

export function scoreOwnerConfidence(input: ConfidenceInput): { band: OwnerConfidence; score: number } {
  if (input.role === 'registered_agent') {
    return { band: 'low', score: 0.2 };
  }

  let score = SOURCE_BASE[input.source] ?? 0.5;

  if (input.match_method === 'exact') score += 0.06;
  else if (input.match_method === 'substring') score += 0.02;
  else if (input.match_method === 'trigram') score -= 0.18;

  if (input.city_match === true) score += 0.06;
  if (input.city_match === false) score -= 0.1;
  if (input.labeled) score += 0.04;
  if (input.title_leadership) score += 0.05;
  if (input.dba_resolved) score += 0.03;
  if (typeof input.serper_score === 'number') {
    score = Math.max(score, input.serper_score);
  }
  if (input.slug_agreed && input.source === 'linkedin') {
    score = Math.max(score, 0.8);
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  if (input.source === 'website') {
    if (input.corroborated) score = Math.max(score, 0.82);
    else score = Math.min(score, 0.6);
  }
  const band: OwnerConfidence = score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';
  return { band, score };
}

export function attachConfidence<T extends WaterfallOwnerHit>(hit: T, extra?: Partial<ConfidenceInput>): T {
  const { band, score } = scoreOwnerConfidence({
    source: hit.source,
    role: hit.role,
    match_method: extra?.match_method ?? hit.match_method,
    city_match: extra?.city_match ?? hit.city_match,
    labeled: extra?.labeled,
    serper_score: extra?.serper_score,
    dba_resolved: extra?.dba_resolved,
    title_leadership: extra?.title_leadership,
    corroborated: extra?.corroborated ?? hit.corroborated,
    slug_agreed: extra?.slug_agreed,
  });
  return {
    ...hit,
    confidence: hit.role === 'registered_agent' ? 'low' : band,
    confidence_score: score,
  };
}
