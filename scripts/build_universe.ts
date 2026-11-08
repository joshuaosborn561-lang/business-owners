/**
 * Universe mode: turn a whole public file into company + owner rows in a client_* table (default client_pe.bo_universe).
 * Dry run by default (reads the source, counts, writes nothing). --run upserts on (source, source_record_id).
 * Output is counts only. Never prints names or rows.
 *
 *   npx tsx scripts/build_universe.ts --source cms_hha [--state TX] [--run]
 *   npx tsx scripts/build_universe.ts --source cms_all --run
 *   npx tsx scripts/build_universe.ts --source fmcsa [--min-power-units 5] [--state OH] [--run]
 *   npx tsx scripts/build_universe.ts --source form5500 [--years 2024,2025] [--min-participants 10] [--max-participants 2000] [--run]
 *
 * Env for --run: TABLE_JOBS_SUPABASE_URL, TABLE_JOBS_SUPABASE_KEY, TABLE_JOBS_TOKEN (same as table jobs).
 * Form 5500 zips are cached in --cache-dir (default /tmp/form5500), about 170 MB per year.
 */
import 'dotenv/config';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CMS_TYPES, cmsUniverse, type CmsType } from '../src/server/lib/universe/cms.js';
import { csvRecords, zipEntryStream } from '../src/server/lib/universe/csvStream.js';
import { FMCSA_DEFAULT_MIN_POWER_UNITS, fmcsaUniverse } from '../src/server/lib/universe/fmcsa.js';
import { F5500Accumulator, f5500Filing, f5500ZipUrl, type F5500Form } from '../src/server/lib/universe/form5500.js';
import { assertUniverseTable, DEFAULT_UNIVERSE_TABLE, UniverseStore } from '../src/server/lib/universe/store.js';
import type { UniverseRow } from '../src/server/lib/universe/types.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const source = arg('source') || '';
const state = arg('state')?.toUpperCase() || null;
const run = flag('run');
const dest = assertUniverseTable(arg('dest') || process.env.UNIVERSE_TABLE || DEFAULT_UNIVERSE_TABLE);
const cacheDir = arg('cache-dir') || process.env.FORM5500_DIR || '/tmp/form5500';

class Counter {
  rows = 0;
  named = 0;
  ready = 0;
  written = 0;
  pe = 0;
  byState = new Map<string, number>();
  add(r: UniverseRow) {
    this.rows++;
    if (r.owner_last) this.named++;
    if (r.waterfall_ready) this.ready++;
    if (r.pe_flag) this.pe++;
    const st = r.state || 'UNK';
    this.byState.set(st, (this.byState.get(st) || 0) + 1);
  }
  report(label: string) {
    const top = [...this.byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => `${s}:${n}`).join(' ');
    console.log(
      JSON.stringify({ source: label, dest, mode: run ? 'run' : 'dry_run', rows: this.rows, named: this.named, waterfall_ready: this.ready, pe_flagged: this.pe, written: this.written, states: this.byState.size, top_states: top }),
    );
  }
}

async function drain(label: string, rows: AsyncIterable<UniverseRow> | Iterable<UniverseRow>, store: UniverseStore | null): Promise<void> {
  const c = new Counter();
  let batch: UniverseRow[] = [];
  const flush = async () => {
    if (store && batch.length) c.written += await store.upsert(batch);
    batch = [];
  };
  let lastLog = Date.now();
  for await (const r of rows as AsyncIterable<UniverseRow>) {
    if (state && String(r.state || '').toUpperCase() !== state) continue;
    c.add(r);
    if (store) {
      batch.push(r);
      if (batch.length >= 1000) await flush();
    }
    if (Date.now() - lastLog > 30_000) {
      lastLog = Date.now();
      console.error(`[${label}] rows=${c.rows} named=${c.named} written=${c.written}`);
    }
  }
  await flush();
  c.report(label);
}

async function download(url: string, path: string): Promise<void> {
  const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < 7 * 86400_000;
  if (fresh) return;
  console.error(`downloading ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'business-owners-universe/1.0' } });
  if (!res.ok || !res.body) throw new Error(`download failed: http_${res.status} ${url}`);
  const tmp = `${path}.part`;
  await pipeline(Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream), createWriteStream(tmp));
  renameSync(tmp, path);
}

async function form5500Rows(): Promise<Iterable<UniverseRow>> {
  const years = (arg('years') || '2024,2025').split(',').map((y) => Number(y.trim())).filter((y) => y >= 2009 && y <= 2100);
  const minP = Number(arg('min-participants') ?? 10);
  const maxRaw = arg('max-participants');
  const maxP = maxRaw === null ? 2000 : maxRaw === 'none' ? null : Number(maxRaw);
  mkdirSync(cacheDir, { recursive: true });
  const acc = new F5500Accumulator();
  let filings = 0;
  for (const year of years) {
    for (const form of ['sf', 'full'] as F5500Form[]) {
      const url = f5500ZipUrl(year, form);
      const path = join(cacheDir, `f5500_${form}_${year}.zip`);
      try {
        await download(url, path);
      } catch (e) {
        console.error(`skip ${form} ${year}: ${(e as Error).message}`);
        continue;
      }
      for await (const rec of csvRecords(zipEntryStream(path, (n) => /\.csv$/i.test(n)))) {
        const f = f5500Filing(rec, form);
        if (f) {
          acc.add(f);
          filings++;
        }
      }
      console.error(`[form5500] ${form} ${year} read; filings so far ${filings}, employers ${acc.size}`);
    }
  }
  return acc.rows({ minParticipants: minP, maxParticipants: maxP, state });
}

async function main() {
  if (!source) {
    console.error('usage: --source cms_hha|cms_hospice|cms_snf|cms_rhc|cms_hospital|cms_all|fmcsa|form5500 [--state XX] [--run]');
    process.exit(2);
  }
  let store: UniverseStore | null = null;
  if (run) {
    store = UniverseStore.fromEnv(dest);
    if (!store) throw new Error('--run needs TABLE_JOBS_SUPABASE_URL, TABLE_JOBS_SUPABASE_KEY and TABLE_JOBS_TOKEN');
    const prep = await store.prepare();
    console.error(`dest ${prep.dest_table} ${prep.created ? 'created' : 'exists'}`);
  }
  if (source === 'cms_all' || source.startsWith('cms_')) {
    const types: CmsType[] = source === 'cms_all' ? [...CMS_TYPES] : [source.slice(4) as CmsType];
    for (const t of types) {
      if (!CMS_TYPES.includes(t)) throw new Error(`unknown CMS type ${t}`);
      await drain(`cms_${t}`, cmsUniverse(t, { state }), store);
    }
  } else if (source === 'fmcsa') {
    const min = Number(arg('min-power-units') ?? FMCSA_DEFAULT_MIN_POWER_UNITS);
    await drain('fmcsa', fmcsaUniverse({ state, minPowerUnits: min }), store);
  } else if (source === 'form5500') {
    await drain('form5500', await form5500Rows(), store);
  } else {
    throw new Error(`unknown source ${source}`);
  }
  if (store) console.log(JSON.stringify({ dest, counts: await store.counts() }));
}

main().catch((e) => {
  console.error(String((e as Error)?.message || e).slice(0, 300));
  process.exit(1);
});
