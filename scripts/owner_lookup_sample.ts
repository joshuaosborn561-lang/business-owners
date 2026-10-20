#!/usr/bin/env tsx
/**
 * Local name-path probe: CSV in (company, city, state) → results CSV + summary.
 * Does not write to Supabase. Uses env SERPER_API_KEY / APIFY_TOKEN / IL_DTA_DIR.
 * Serper (google.serper.dev) is first for every state; Apify is the blocked-HTML fallback.
 *
 *   npx tsx scripts/owner_lookup_sample.ts --in sample.csv --out results.csv
 *
 * Writes each row as it completes (append). Re-runs skip ids already in --out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  LOOKUP_CONCURRENCY_DEFAULT,
  LOOKUP_CONCURRENCY_MAX,
  defaultLookupContext,
  lookupMaxSecondsFromEnv,
} from '../src/server/lib/stateOwners/sos/context.ts';
import {
  createSampleResultSink,
  readCompanyCsv,
  readCompletedSampleIds,
  resultToCsvRow,
  sampleRowId,
  summarizeSample,
  type SampleResultLine,
  type SampleRow,
} from '../src/server/lib/stateOwners/sos/sampleCsv.ts';
import { runCaBatch } from '../src/server/lib/stateOwners/sos/caBatch.ts';
import { resolveNameLookup } from '../src/server/lib/stateOwners/sos/namePath.ts';
import { mapPool } from '../src/server/lib/stateOwners/sos/pool.ts';
import {
  ApifySpendTracker,
  SerperCreditTracker,
  apifyMaxUsdFromEnv,
  apifyUsdPerCompanyFromEnv,
  estimateCaBatchUsd,
  estimateCaHybridUsd,
} from '../src/server/lib/stateOwners/sos/spend.ts';
import { normalizeState } from '../src/server/lib/stateOwners/names.ts';
import type { NameLookupResult } from '../src/server/lib/stateOwners/sos/types.ts';

function arg(flag: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  return fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printHelp(): void {
  process.stdout.write(`Usage: npx tsx scripts/owner_lookup_sample.ts --in <companies.csv> --out <results.csv>

CSV columns: company (or company_name), city, state

Options:
  --summary <path>     Write summary JSON (default: <out>.summary.json)
  --states CA,IL       Limit to these states
  --concurrency 5      Parallel company lookups (default 5, max 8)
  --max-seconds N      Stop starting new companies after N seconds
  --resume             Skip ids already in --out (default when --out exists)
  --no-resume          Re-run every row even if --out already has them
  --jsonl              Write JSONL instead of CSV (also if --out ends in .jsonl)
  --include-agents     Include registered-agent people (still not waterfall-ready)
  --no-serper          Skip google.serper.dev (default: Serper-first for every state)
  --no-apify           Never call Apify Playwright (fallback only after Serper miss)
  --spend-file <path>  Shared Apify spend ledger (default: <out>.apify-spend.json)
  --ca-batch           CA SOS batched lookup (hybrid dz_omar + web-fetch by default)
  --ca-hybrid-only     Skip Playwright (implied by --ca-batch unless --ca-playwright)
  --ca-playwright      Opt into the Incapsula-blocked Playwright UI path
  --ca-max-results N   dz_omar maxResultsPerQuery (default 3)
  --ca-debug           With --ca-batch: dump per-step HTTP status (search/history/SI)
  --checkpoint <path>  Resume file for --ca-batch (default: tmpdir)
  --il-dta-dir <path>  Illinois Data Transparency Act files (or env IL_DTA_DIR)
  --live false         Skip official HTTP (fixture/offline)

Env: SERPER_API_KEY, APIFY_TOKEN, APIFY_MAX_USD, APIFY_USD_PER_COMPANY, APIFY_SPEND_FILE,
     LOOKUP_CONCURRENCY, LOOKUP_MAX_SECONDS, IL_DTA_DIR, CA_BATCH_CHECKPOINT
No Supabase writes. This service has no permit/license path.

3-company CA smoke (hybrid-only; skip Playwright):
  export APIFY_TOKEN=... APIFY_MAX_USD=2
  npx tsx scripts/owner_lookup_sample.ts --in ca-3.csv --out ca-3-results.csv --ca-batch --ca-hybrid-only --states CA --no-serper --ca-debug --checkpoint /tmp/ca-batch-3.json
`);
}

function skippedResult(row: SampleRow, reason: NameLookupResult['coverage_reason']): NameLookupResult {
  return {
    people: [],
    coverage_reason: reason,
    source: 'us_sos',
    implemented: true,
  };
}

async function main(): Promise<void> {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    return;
  }
  const inPath = arg('--in') || arg('-i');
  const outPath = arg('--out') || arg('-o');
  if (!inPath || !outPath) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  const states = (arg('--states') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const concurrency = Math.max(
    1,
    Math.min(Number(arg('--concurrency', String(LOOKUP_CONCURRENCY_DEFAULT))) || LOOKUP_CONCURRENCY_DEFAULT, LOOKUP_CONCURRENCY_MAX),
  );
  const live = arg('--live') === 'false' || hasFlag('--offline') ? false : true;
  const outAbs = resolve(outPath);
  const jsonl = hasFlag('--jsonl') || /\.jsonl$/i.test(outAbs);
  const writePath = jsonl && !/\.jsonl$/i.test(outAbs) ? `${outAbs}.jsonl` : outAbs;
  const resume = hasFlag('--no-resume') ? false : hasFlag('--resume') || true;
  const maxSeconds = Number(arg('--max-seconds') || lookupMaxSecondsFromEnv() || 0);
  const deadlineAt = Number.isFinite(maxSeconds) && maxSeconds > 0 ? Date.now() + maxSeconds * 1000 : null;
  const spendFile = arg('--spend-file') || process.env.APIFY_SPEND_FILE || `${writePath}.apify-spend.json`;
  const spend = new ApifySpendTracker({
    persistPath: spendFile,
    capUsd: apifyMaxUsdFromEnv(),
    companyCapUsd: apifyUsdPerCompanyFromEnv(),
  });
  const serper = new SerperCreditTracker();
  const caBatch = hasFlag('--ca-batch') || hasFlag('--ca-hybrid-only');
  const caPlaywright = hasFlag('--ca-playwright');
  const maxResultsRaw = Number(arg('--ca-max-results'));
  const ctx = defaultLookupContext({
    live,
    includeAgents: hasFlag('--include-agents'),
    apifyEnabled: !hasFlag('--no-apify'),
    serperEnabled: caBatch ? false : !hasFlag('--no-serper'),
    ilDtaDir: arg('--il-dta-dir') || process.env.IL_DTA_DIR || null,
    caBatchCheckpointPath: arg('--checkpoint') || undefined,
    caBatchDebug: hasFlag('--ca-debug'),
    caPlaywright,
    caHybridOnly: !caPlaywright,
    caHybridMaxResultsPerQuery: Number.isFinite(maxResultsRaw) && maxResultsRaw > 0 ? maxResultsRaw : undefined,
    spend,
    serper,
    apifySpendFile: spendFile,
    deadlineAt,
  });
  const inputRows = await readCompanyCsv(resolve(inPath));
  const filtered = states.length ? inputRows.filter((r) => states.includes(r.state)) : inputRows;
  const already = resume ? await readCompletedSampleIds(writePath) : new Set<string>();
  const pending = filtered.filter((row) => !already.has(sampleRowId(row)));
  const sink = createSampleResultSink(writePath);
  const lines: SampleResultLine[] = [];

  const writeDone = async (row: SampleRow, result: NameLookupResult) => {
    const line = resultToCsvRow(row, result);
    lines.push(line);
    already.add(line.id);
    await sink.write(line);
  };

  const lookupOne = async (row: SampleRow) => {
    if (deadlineAt && Date.now() >= deadlineAt) {
      await writeDone(row, skippedResult(row, 'blocked'));
      return;
    }
    const result = await resolveNameLookup(row, ctx);
    await writeDone(row, result);
  };

  const caRows = pending.filter((r) => normalizeState(r.state) === 'CA');
  const otherRows = pending.filter((r) => normalizeState(r.state) !== 'CA');
  if (caBatch && caRows.length) {
    const batch = await runCaBatch(caRows, ctx, {
      jobId: 'cli-ca-batch',
      checkpointPath: arg('--checkpoint') || ctx.caBatchCheckpointPath,
    });
    for (let i = 0; i < caRows.length; i++) {
      await writeDone(caRows[i], batch.results[i]);
    }
    if (hasFlag('--ca-debug')) {
      const debugPath = resolve(arg('--debug-out') || `${writePath}.debug.json`);
      const debugRows = Object.values(batch.checkpoint.items).map((item) => ({
        company: item.company_name,
        city: item.city,
        status: item.status,
        error: item.error || '',
        steps: item.debug_steps || [],
      }));
      mkdirSync(dirname(debugPath), { recursive: true });
      writeFileSync(debugPath, JSON.stringify(debugRows, null, 2) + '\n', 'utf8');
    }
  } else if (!caBatch) {
    await mapPool(pending, concurrency, lookupOne, {
      shouldStop: () => Boolean(deadlineAt && Date.now() >= deadlineAt),
    });
    if (deadlineAt && Date.now() >= deadlineAt) {
      for (const row of pending) {
        if (already.has(sampleRowId(row))) continue;
        await writeDone(row, skippedResult(row, 'blocked'));
      }
    }
  }
  if (caBatch && otherRows.length) {
    await mapPool(otherRows, concurrency, lookupOne, {
      shouldStop: () => Boolean(deadlineAt && Date.now() >= deadlineAt),
    });
    if (deadlineAt && Date.now() >= deadlineAt) {
      for (const row of otherRows) {
        if (already.has(sampleRowId(row))) continue;
        await writeDone(row, skippedResult(row, 'blocked'));
      }
    }
  }

  const summary = summarizeSample(lines);
  summary.apify_usd_spent = Number((spend.usd || summary.apify_usd_spent).toFixed(2));
  summary.serper_credits = serper.credits || summary.serper_credits;
  summary.serper_usd = Number((serper.usd || summary.serper_usd).toFixed(4));
  const summaryPath = resolve(arg('--summary') || `${writePath}.summary.json`);
  const payload = {
    ...summary,
    ca_batch: caBatch,
    resumed: already.size - lines.length,
    pending: pending.length,
    apify_compute_units: Number(spend.computeUnits.toFixed(4)),
    apify_proxy_gb: Number(spend.proxyGb.toFixed(4)),
    apify_runs: spend.runs,
    apify_estimate_usd: caBatch
      ? caPlaywright
        ? estimateCaBatchUsd(caRows.length)
        : estimateCaHybridUsd(caRows.length, ctx.caHybridMaxResultsPerQuery)
      : summary.apify_usd_spent,
    apify_usd_per_company: spend.companyCapUsd,
    spend_file: spendFile,
    deadline_hit: Boolean(deadlineAt && Date.now() >= deadlineAt),
  };
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        in: resolve(inPath),
        out: writePath,
        summary: summaryPath,
        rows: summary.rows,
        named: summary.named,
        agent_only: summary.agent_only,
        hit_rate: summary.hit_rate,
        hit_rate_by_state: summary.hit_rate_by_state,
        officer_vs_agent: summary.officer_vs_agent,
        ca_batch: caBatch,
        ca_debug: hasFlag('--ca-debug'),
        resumed_skipped: filtered.length - pending.length,
        apify_usd_spent: summary.apify_usd_spent,
        apify_runs: spend.runs,
        apify_compute_units: payload.apify_compute_units,
        apify_proxy_gb: payload.apify_proxy_gb,
        serper_credits: summary.serper_credits,
        serper_usd: summary.serper_usd,
        via_serper: summary.via_serper,
        writes: false,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write((err instanceof Error ? err.stack || err.message : String(err)) + '\n');
  process.exitCode = 1;
});
