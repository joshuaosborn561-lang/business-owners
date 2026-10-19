import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  companySearchQueries,
  coreCompanySearchName,
  hasCompanyWord,
  htmlToText,
  isNycCity,
  isPlaceName,
  labeledValue,
  looksLikeSolePropPerson,
  namesMatchNormalized,
  normalizeCompanyName,
  normalizeState,
  parseBoardPersonName,
  pickBestNameMatch,
  pickBestNameMatchScored,
  sodaNameNeedle,
  splitPersonName,
  splitLegalAndDba,
  trigramSimilarity,
  validateOfficerPersonName,
} from './names.js';
import { sodaWhereContains, sodaWhereContainsLoose } from './soda.js';
import { looksBlocked } from './http.js';

describe('splitPersonName', () => {
  it('splits two and three tokens on the last word', () => {
    assert.deepEqual(splitPersonName('JANE PUBLIC'), {
      first_name: 'JANE',
      last_name: 'PUBLIC',
      full_name_raw: 'JANE PUBLIC',
      review_flag: false,
    });
    assert.equal(splitPersonName('JANE Q PUBLIC').last_name, 'PUBLIC');
    assert.equal(splitPersonName('JANE Q PUBLIC').first_name, 'JANE Q');
  });

  it('does not guess first/last on four tokens', () => {
    const split = splitPersonName('MARY ELLEN ANN GARCIA');
    assert.equal(split.first_name, null);
    assert.equal(split.review_flag, true);
  });

  it('flags a single token as a partial name', () => {
    const split = splitPersonName('JANE');
    assert.equal(split.first_name, null);
    assert.equal(split.last_name, 'JANE');
    assert.equal(split.review_flag, true);
  });
});

describe('officer person name validation', () => {
  it('strips honorifics and rejects cities, company words, and partial names', () => {
    const ok = validateOfficerPersonName('REV DR JANE SAMPLE DVM');
    assert.equal(ok.ok, true);
    assert.equal(ok.first_name, 'JANE');
    assert.equal(ok.last_name, 'SAMPLE');
    assert.equal(ok.review_flag, false);

    assert.equal(validateOfficerPersonName('SAN DIEGO').ok, false);
    assert.equal(validateOfficerPersonName('SAN DIEGO').reason, 'place');
    assert.equal(isPlaceName('LOS ANGELES'), true);

    assert.equal(validateOfficerPersonName('ACME ADVISORS').ok, false);
    assert.equal(validateOfficerPersonName('VALLEY GROUP LLC').reason, 'company');
    assert.equal(hasCompanyWord('SMITH ADVISORS'), true);

    const partial = validateOfficerPersonName('JANE');
    assert.equal(partial.ok, false);
    assert.equal(partial.reason, 'partial');
    assert.equal(partial.review_flag, true);

    assert.equal(validateOfficerPersonName('OAKLAND', ['Oakland']).reason, 'place');
    assert.equal(validateOfficerPersonName('JANE SAMPLE', ['Oakland']).ok, true);
  });
});

describe('company search query normalization', () => {
  it('strips DBA, dash/pipe marketing, Division, and Dr…DVM tails', () => {
    assert.equal(coreCompanySearchName('Valley Pets - Dr. Jane Smith DVM'), 'Valley Pets');
    assert.equal(coreCompanySearchName('Acme Advisors | Wealth Management Division'), 'Acme Advisors');
    assert.equal(coreCompanySearchName('Dr. Smith Veterinary'), 'Dr. Smith Veterinary');
    const queries = companySearchQueries('Sample Builders LLC - Extra Marketing');
    assert.equal(queries[0], 'Sample Builders LLC');
    assert.ok(queries.includes('SAMPLE BUILDERS'));
  });
});

describe('parseBoardPersonName', () => {
  it('splits LAST, FIRST M from registry dumps', () => {
    const split = parseBoardPersonName('SMITH, JOHN A');
    assert.equal(split.first_name, 'JOHN A');
    assert.equal(split.last_name, 'SMITH');
    assert.equal(split.review_flag, false);
  });
});

describe('looksBlocked', () => {
  it('does not treat a registry page with a recaptcha widget as blocked', () => {
    assert.equal(
      looksBlocked(200, 'Business Information\nACME INC\nLicense Status\nCurrent and active\ng-recaptcha captcha widget'),
      false,
    );
  });

  it('treats a Turnstile search shell as blocked', () => {
    assert.equal(looksBlocked(200, '<div class="cf-turnstile"></div>Please wait'), true);
  });
});

describe('normalizeCompanyName', () => {
  it('strips punctuation, legal suffixes, and DBA tails', () => {
    assert.equal(normalizeCompanyName('Smith HVAC, L.L.C. DBA Cool Air'), 'SMITH HVAC');
    assert.equal(normalizeCompanyName('J & J ELECTRIC INC'), 'J AND J ELECTRIC');
  });
});

describe('splitLegalAndDba', () => {
  it('keeps the trade name that normalizeCompanyName would strip', () => {
    assert.deepEqual(splitLegalAndDba('Sample Builders LLC DBA Sample Crew'), {
      legal: 'Sample Builders LLC',
      dba: 'Sample Crew',
    });
    assert.equal(splitLegalAndDba('Sample Builders LLC').dba, null);
  });
});

describe('sole prop person heuristic', () => {
  it('accepts 2–3 word names without company words', () => {
    assert.equal(looksLikeSolePropPerson('MARY ELLEN'), true);
    assert.equal(looksLikeSolePropPerson('VALLEY ROOFING'), false);
    assert.equal(looksLikeSolePropPerson('ACME CONSTRUCTION'), false);
    assert.equal(hasCompanyWord('VALLEY SERVICES'), true);
  });
});

describe('geo helpers', () => {
  it('normalizes state names and NYC cities', () => {
    assert.equal(normalizeState('California'), 'CA');
    assert.equal(normalizeState('Illinois'), 'IL');
    assert.equal(normalizeState('Colorado'), 'CO');
    assert.equal(isNycCity('Brooklyn'), true);
    assert.equal(isNycCity('Albany'), false);
  });
});

describe('htmlToText', () => {
  it('strips tags to lines', () => {
    const text = htmlToText('<div>Business Information</div><p>ACME INC</p>');
    assert.match(text, /Business Information/);
    assert.match(text, /ACME INC/);
  });

  it('turns </td> </tr> </div> </p> and <br> into newlines', () => {
    const text = htmlToText(
      '<tr><td>License Status</td><td>This license is current and active.</td></tr><div>Entity</div><p>Corporation</p>Business Phone<br>(916) 555-0100',
    );
    assert.match(text, /License Status\n+This license is current and active/);
    assert.match(text, /Entity\n+Corporation/);
    assert.match(text, /Business Phone\n+\(916\) 555-0100/);
  });
});

describe('labeledValue', () => {
  it('captures a value on the same line or the next line', () => {
    assert.equal(labeledValue('License Status This license is current and active.', 'License Status'), 'This license is current and active.');
    assert.equal(labeledValue('License Status\n This license is current and active.', 'License Status'), 'This license is current and active.');
  });
});

describe('normalized name match', () => {
  it('matches after stripping punctuation, legal suffixes, and DBA tails', () => {
    assert.equal(namesMatchNormalized('Smith HVAC, L.L.C. DBA Cool Air', 'SMITH HVAC'), true);
    assert.equal(pickBestNameMatch('Acme Builders LLC', [{ n: 'ACME BUILDERS' }, { n: 'OTHER CO' }], (r) => r.n)?.n, 'ACME BUILDERS');
    assert.equal(pickBestNameMatch('Acme', [{ n: 'ZETA ROOFING' }], (r) => r.n), null);
  });
});

describe('trigram fallback', () => {
  it('scores near-equal names above the threshold and rejects unrelated ones', () => {
    assert.ok(trigramSimilarity('JOHNSON MECHANICAL GROUP', 'JOHNSON MECHNICAL GRP') >= 0.48);
    assert.ok(trigramSimilarity('ACME BUILDERS', 'ZETA ROOFING') < 0.4);
    const hit = pickBestNameMatchScored(
      'Johnson Mechanical Group LLC',
      [{ n: 'JOHNSON MECHNICAL GRP', city: 'Austin' }, { n: 'ZETA ROOFING', city: 'Dallas' }],
      (r) => r.n,
      { allowTrigram: true, city: 'Austin', cityOf: (r) => r.city },
    );
    assert.equal(hit?.item.n, 'JOHNSON MECHNICAL GRP');
    assert.equal(hit?.method, 'trigram');
    const noSubstring = pickBestNameMatchScored(
      'Builders LLC',
      [{ n: 'ACME BUILDERS LLC' }],
      (r) => r.n,
      { allowTrigram: true, allowSubstring: false, minTrigram: 0.8 },
    );
    assert.equal(noSubstring, null);
    const stillSubstring = pickBestNameMatchScored(
      'Builders LLC',
      [{ n: 'ACME BUILDERS LLC' }],
      (r) => r.n,
      { allowTrigram: false },
    );
    assert.equal(stillSubstring?.method, 'substring');
    const cityTie = pickBestNameMatchScored(
      'Acme Builders LLC',
      [
        { n: 'ACME BUILDERS', city: 'Fresno' },
        { n: 'ACME BUILDERS', city: 'Oakland' },
      ],
      (r) => r.n,
      { city: 'Oakland', cityOf: (r) => r.city, allowTrigram: false },
    );
    assert.equal(cityTie?.item.city, 'Oakland');
    assert.ok((cityTie?.score || 0) > 100);
    assert.equal(sodaNameNeedle('Smith HVAC, LLC DBA Cool'), 'SMITH HVAC');
    assert.match(sodaWhereContains('business_name', 'Smith HVAC Heating Cooling LLC'), /SMITH/);
    assert.match(sodaWhereContains('business_name', 'Smith HVAC Heating Cooling LLC'), /COOLING/);
    assert.match(sodaWhereContainsLoose('business_name', 'Smith HVAC Heating Cooling LLC'), /SMITH/);
    assert.match(sodaWhereContainsLoose('business_name', 'Smith HVAC Heating Cooling LLC'), /HVAC/);
    assert.equal(sodaWhereContainsLoose('business_name', 'Smith HVAC Heating Cooling LLC').includes('COOLING'), false);
  });
});
