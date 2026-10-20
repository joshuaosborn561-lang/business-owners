import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  downloadIlDtaFiles,
  emptyIlIndex,
  ingestIlDtaText,
  loadIlDtaDir,
  matchIlDta,
  parseCorpAnnualLine,
  parseIlDtaHomeLinks,
  IL_DTA_PREFERRED_ZIPS,
} from './ilDta.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

describe('IL DTA bulk files', () => {
  it('parses a 126-byte corporate annual-report line', () => {
    const line =
      '20240001' +
      '2024' +
      'JANE SAMPLE'.padEnd(40) +
      'MANAGER'.padEnd(20) +
      'JOHN SAMPLE'.padEnd(40) +
      'MEMBER'.padEnd(14);
    assert.equal(line.length, 126);
    const parsed = parseCorpAnnualLine(line);
    assert.ok(parsed);
    assert.equal(parsed!.file_number, '20240001');
    assert.ok(parsed!.officers.some((o) => o.name === 'JANE SAMPLE'));
  });

  it('ingests a TSV annual-report extract and city-matches', () => {
    const index = emptyIlIndex();
    ingestIlDtaText(
      index,
      [
        'file_number\tlegal_name\tdba_name\tcity\tofficer_name\tofficer_title',
        '20240001\tSAMPLE HVAC LLC\t\tChicago\tJANE SAMPLE\tMANAGER',
      ].join('\n'),
      'officers.tsv',
    );
    const hit = matchIlDta({ company_name: 'Sample HVAC LLC', city: 'Chicago', state: 'IL' }, index);
    assert.ok(hit);
    assert.equal(hit!.entity.officers[0]?.name, 'JANE SAMPLE');
    const stripped = matchIlDta({ company_name: 'Sample HVAC', city: 'Chicago', state: 'IL' }, index);
    assert.ok(stripped);
    assert.equal(stripped!.entity.file_number, '20240001');
  });

  it('parses official DTA homepage zip links and auto-downloads them', async () => {
    const html = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'il-dta-home.html'),
      'utf8',
    );
    const links = parseIlDtaHomeLinks(html);
    assert.ok(links.some((u) => u.endsWith('cdxallarp.zip')));
    assert.ok(IL_DTA_PREFERRED_ZIPS.includes('cdxallarp.zip'));

    const dir = mkdtempSync(join(tmpdir(), 'il-dta-'));
    try {
      const tsv = [
        'file_number\tlegal_name\tdba_name\tcity\tofficer_name\tofficer_title',
        '20240001\tSAMPLE HVAC LLC\t\tChicago\tJANE SAMPLE\tMANAGER',
      ].join('\n');
      const got = await downloadIlDtaFiles(dir, {
        live: true,
        fetch: async (url) => {
          const href = String(url);
          if (href.includes('bus-serv-home')) {
            return new Response(html, { headers: { 'content-type': 'text/html' } });
          }
          return new Response(tsv, { headers: { 'content-type': 'text/plain' } });
        },
      });
      assert.ok(got.downloaded >= 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unzips DTA archives already on disk instead of reading them as empty text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'il-dta-zip-'));
    try {
      const tsv = [
        'file_number\tlegal_name\tdba_name\tcity\tofficer_name\tofficer_title',
        '20240001\tSAMPLE HVAC LLC\t\tChicago\tJANE SAMPLE\tMANAGER',
      ].join('\n');
      const inner = join(dir, 'officers.tsv');
      writeFileSync(inner, tsv);
      const zipPath = join(dir, 'llcallmgr.zip');
      execFileSync('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1],"w").write(sys.argv[2], "officers.tsv")', zipPath, inner]);
      rmSync(inner);
      const index = loadIlDtaDir(dir);
      assert.ok(index.list.length >= 1, 'zip must be unzipped and ingested');
      const hit = matchIlDta({ company_name: 'Sample HVAC LLC', city: 'Chicago', state: 'IL' }, index);
      assert.equal(hit?.entity.officers[0]?.name, 'JANE SAMPLE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
