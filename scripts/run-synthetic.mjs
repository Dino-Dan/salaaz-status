// CLI for the synthetic checks. Invoked by .github/workflows/synthetic-api.yml.
//
//   node scripts/run-synthetic.mjs --state history/synthetic-status.json
//
// On failure it re-probes once after a delay before concluding anything: webstore
// deploys ship per-commit image tags with no blue/green, and nginx serves
// index.html as no-cache while hashed assets are immutable, so a probe landing
// mid-deploy can legitimately see a broken page. A live dry run also caught a
// one-off `fetch failed` on a healthy site, so transient blips are real.
//
// Writes the state file, prints a report, and sets outputs for the workflow.
// Exit code is always 0 on a completed run — "degraded" is a result, not a crash,
// and the workflow decides what to do with it. A non-zero exit means the runner
// itself broke.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { runChecks, updateState } from './synthetic-checks.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const origin = arg('origin', 'https://salaaz.com');
const statePath = arg('state', null);
const slug = arg('slug', 'salaaz-marketplace');
const retryDelayMs = Number(arg('retry-delay', '30000'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function printReport(label, report) {
  console.log(`\n--- ${label} ---`);
  for (const r of report.results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(26)} ${r.ok ? `${r.detail} (${r.ms}ms)` : r.error}`);
  }
}

let report = await runChecks({ origin });
printReport('probe 1', report);

if (!report.healthy) {
  console.log(`\nFailing: ${report.failing.join(', ')} — re-probing in ${retryDelayMs}ms before concluding.`);
  await sleep(retryDelayMs);
  const second = await runChecks({ origin });
  printReport('probe 2', second);
  if (second.healthy) {
    console.log('\nSecond probe passed — treating the first as a transient blip. No alert.');
  }
  report = second;
}

const nowIso = new Date().toISOString();
let state = {};
if (statePath && existsSync(statePath)) {
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    console.log(`Warning: ${statePath} was unreadable; starting from empty state.`);
  }
}

const next = updateState(state, report, nowIso, slug);
const entry = next[slug];

if (statePath) writeFileSync(statePath, JSON.stringify(next, null, 2) + '\n');

console.log(
  `\nRESULT: ${entry.status} | consecutiveFailures=${entry.consecutiveFailures} | publicDegraded=${entry.publicDegraded}`,
);
if (!report.healthy) console.log(`DETAIL: ${entry.detail}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `healthy=${report.healthy}`,
      `public_degraded=${entry.publicDegraded}`,
      `failing=${report.failing.join(',')}`,
      // Single-line: multi-line step outputs need heredoc framing and the detail
      // is already one line by construction.
      `detail=${entry.detail.replace(/\n/g, ' ')}`,
    ].join('\n') + '\n',
  );
}
