import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attachConfidence, scoreOwnerConfidence } from './confidence.js';

describe('scoreOwnerConfidence', () => {
  it('scores SOS exact + city as high', () => {
    const got = scoreOwnerConfidence({
      source: 'ca_bizfile',
      role: 'officer',
      match_method: 'exact',
      city_match: true,
      labeled: true,
    });
    assert.equal(got.band, 'high');
    assert.ok(got.score >= 0.8);
  });

  it('never scores a registered agent above low', () => {
    const got = scoreOwnerConfidence({
      source: 'ca_bizfile',
      role: 'registered_agent',
      match_method: 'exact',
      city_match: true,
    });
    assert.equal(got.band, 'low');
    assert.equal(got.score, 0.2);
  });

  it('attaches a 0–1 score on the hit', () => {
    const hit = attachConfidence({
      first_name: 'JANE',
      last_name: 'SAMPLE',
      title: 'President',
      company_name: 'Sample LLC',
      domain: null,
      source_url: 'https://example.test',
      confidence: 'medium',
      state: 'CA',
      source: 'website',
      role: 'owner',
      coverage_reason: null,
    });
    assert.ok((hit.confidence_score ?? 0) > 0.5);
    assert.ok((hit.confidence_score ?? 0) <= 0.6);
  });
});
