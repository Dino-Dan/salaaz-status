// Generates feed.xml (Atom 1.0) from history/incidents.json.
//
// An incident feed is the cheapest standard integration a status page can offer:
// a static file, no backend, no subscriber PII to hold. Ops teams point their
// readers or Slack/Discord feed bots at it.
//
// Run from the repo root:  node scripts/build-feed.mjs [outDir]

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { publicIncidents, serviceNameOf, fmtDuration, escapeXml } from './incidents-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://status.salaaz.com';
const MAX_ENTRIES = 50;

export function buildFeed(issues, now) {
  const entries = publicIncidents(issues)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, MAX_ENTRIES)
    .map(issue => {
      const service = serviceNameOf(issue);
      const open = issue.state === 'open';
      const updated = issue.closed_at || issue.created_at;
      const title = open
        ? `${service} — ongoing incident`
        : `${service} — resolved after ${fmtDuration(issue.created_at, issue.closed_at)}`;
      const summary = open
        ? `An incident affecting ${service} began at ${issue.created_at} and is still open.`
        : `${service} was affected from ${issue.created_at} until ${issue.closed_at} ` +
          `(${fmtDuration(issue.created_at, issue.closed_at)} of impact).`;

      return [
        '  <entry>',
        `    <title>${escapeXml(title)}</title>`,
        // Our own canonical URL, never the GitHub issue. <id> is an identifier,
        // but readers surface it and some make it clickable, so pointing it at
        // github.com would leak the monitoring repo into every subscriber's feed.
        `    <id>${escapeXml(`${SITE}/incidents.html#incident-${issue.number}`)}</id>`,
        `    <link rel="alternate" href="${escapeXml(`${SITE}/incidents.html#incident-${issue.number}`)}"/>`,
        `    <published>${new Date(issue.created_at).toISOString()}</published>`,
        `    <updated>${new Date(updated).toISOString()}</updated>`,
        `    <category term="${escapeXml(open ? 'ongoing' : 'resolved')}"/>`,
        `    <summary type="text">${escapeXml(summary)}</summary>`,
        '  </entry>',
      ].join('\n');
    });

  // Feed-level <updated> tracks the newest entry so readers can short-circuit;
  // fall back to `now` only when there are no entries at all.
  const newest = entries.length
    ? publicIncidents(issues)
        .map(i => new Date(i.closed_at || i.created_at).getTime())
        .sort((a, b) => b - a)[0]
    : now.getTime();

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>Salaaz Status — Incidents</title>',
    '  <subtitle>Incident history for all Salaaz services.</subtitle>',
    `  <link rel="self" href="${SITE}/feed.xml"/>`,
    `  <link rel="alternate" href="${SITE}/incidents.html"/>`,
    `  <id>${SITE}/</id>`,
    `  <updated>${new Date(newest).toISOString()}</updated>`,
    '  <author><name>Salaaz</name></author>',
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}

// Only run when invoked directly, so tests can import buildFeed().
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outDir = resolve(process.argv[2] || ROOT);
  const issues = JSON.parse(readFileSync(resolve(ROOT, 'history/incidents.json'), 'utf8'));
  const xml = buildFeed(issues, new Date());
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'feed.xml'), xml);
  console.log(`feed.xml written to ${outDir} (${publicIncidents(issues).length} public incidents)`);
}
