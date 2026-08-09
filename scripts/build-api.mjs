// Generates the public JSON API published alongside the status page:
//
//   status.json   overall indicator, for badges and one-line integrations
//   summary.json  per-service detail plus active incidents
//
// Shapes follow the Statuspage convention teams already integrate against, so
// existing tooling can consume them without bespoke parsing.
//
// Run from the repo root:  node scripts/build-api.mjs [outDir]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { publicIncidents, serviceNameOf, HIDDEN_SLUGS } from './incidents-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://status.salaaz.com';

/** Regex-parse the Upptime YAML, mirroring fetchYamlData() in index.html. */
function readYaml(slug) {
  const path = resolve(ROOT, `history/${slug}.yml`);
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  const pick = re => (text.match(re) || [])[1] || null;
  return {
    status: pick(/^status:\s*(\S+)/m),
    startTime: pick(/startTime:\s*(\S+)/),
    lastUpdated: pick(/lastUpdated:\s*(\S+)/),
    responseTime: Number(pick(/responseTime:\s*(\d+)/)) || null,
  };
}

function uptime90(service) {
  const down = Object.values(service.dailyMinutesDown || {}).reduce((a, b) => a + b, 0);
  const total = 90 * 1440;
  return Number(Math.min(100, Math.max(0, ((total - down) / total) * 100)).toFixed(2));
}

export function buildApi(summary, issues, yamlBySlug, now) {
  // YAML status wins over summary.json — it is written first by Upptime and
  // summary.json can hold a stale status from the previous cycle. Same
  // precedence the page banner uses.
  const services = summary
    .filter(s => !HIDDEN_SLUGS.includes(s.slug))
    .map(s => {
      const y = yamlBySlug[s.slug] || {};
      return {
        slug: s.slug,
        name: s.name,
        url: s.url,
        status: y.status || s.status,
        response_time_ms: y.responseTime ?? s.time ?? null,
        uptime_90d: uptime90(s),
        monitored_since: y.startTime || null,
        last_checked: y.lastUpdated || null,
      };
    });

  const active = publicIncidents(issues)
    .filter(i => i.state === 'open')
    .map(i => ({
      id: i.number,
      service: serviceNameOf(i),
      started_at: i.created_at,
      url: `${SITE}/incidents.html#incident-${i.number}`,
    }));

  const anyDown = services.some(s => s.status === 'down');
  const anyDegraded = services.some(s => s.status && s.status !== 'up' && s.status !== 'down');

  const indicator = anyDown ? 'major' : anyDegraded ? 'degraded' : 'none';
  const description = anyDown
    ? `${services.filter(s => s.status === 'down').length} service(s) down`
    : anyDegraded
      ? 'Some systems degraded'
      : 'All systems operational';

  // last_checked is the newest per-service check, not generation time — the same
  // distinction the page's "Last updated" header makes.
  const stamps = services.map(s => s.last_checked).filter(Boolean).sort();
  const lastChecked = stamps.length ? stamps[stamps.length - 1] : now.toISOString();

  return {
    status: {
      page: { name: 'Salaaz Status', url: SITE },
      status: { indicator, description },
      last_checked: lastChecked,
    },
    summary: {
      page: { name: 'Salaaz Status', url: SITE },
      status: { indicator, description },
      services,
      active_incidents: active,
      last_checked: lastChecked,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outDir = resolve(process.argv[2] || ROOT);
  const summary = JSON.parse(readFileSync(resolve(ROOT, 'history/summary.json'), 'utf8'));
  const issues = JSON.parse(readFileSync(resolve(ROOT, 'history/incidents.json'), 'utf8'));
  const yamlBySlug = Object.fromEntries(summary.map(s => [s.slug, readYaml(s.slug)]));

  const { status, summary: summaryDoc } = buildApi(summary, issues, yamlBySlug, new Date());
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summaryDoc, null, 2) + '\n');
  console.log(`status.json + summary.json written to ${outDir} (${summaryDoc.services.length} public services)`);
}
