// Shared incident filtering for the feed and API generators.
//
// These rules are duplicated from status-page/index.html rather than imported —
// the page is a single self-contained HTML file with inline JS and exports
// nothing. The definitions below MUST stay in step with:
//   HIDDEN_SLUGS / HIDDEN_SERVICE_NAMES  (index.html)
//   EXCLUDED_LABELS / hasExcludedLabel   (index.html)
//   isQualifyingIncident                 (index.html)
// tests/unit/feed.test.js pins this behaviour.

/** Services monitored but never shown publicly. */
export const HIDDEN_SLUGS = ['ethics-dashboard'];
export const HIDDEN_SERVICE_NAMES = ['Ethics Dashboard'];

/** Alert-only issues opened by the smoke and dependency checks. */
export const EXCLUDED_LABELS = ['internal'];

export function labelNames(issue) {
  return (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));
}

/** Maintenance is planned work, not an incident — keep it out of the feed too. */
export const NON_INCIDENT_LABELS = EXCLUDED_LABELS.concat(['maintenance']);

export function hasExcludedLabel(issue) {
  return labelNames(issue).some(n => NON_INCIDENT_LABELS.includes(n));
}

/**
 * The slug label Upptime attaches alongside `status` (e.g. "salaaz-marketplace").
 * Preferred over parsing the issue title, which is fragile and already has two
 * divergent implementations across the two pages.
 */
export function slugOf(issue) {
  return labelNames(issue).find(n => n && n !== 'status' && !NON_INCIDENT_LABELS.includes(n)) || null;
}

/** Title minus the leading emoji and the trailing " is down (…)" clause. */
export function serviceNameOf(issue) {
  return String(issue.title || '')
    .replace(/^[^\w(]*\s*/, '')
    .replace(/\s+(is down|is degraded|has degraded performance|is slow|is up).*$/i, '')
    .trim();
}

/** Resolved, and lasted at least 5 minutes — sub-5-minute blips are noise. */
export function isQualifyingIncident(issue) {
  return issue.state === 'closed' && !!issue.closed_at &&
    (new Date(issue.closed_at) - new Date(issue.created_at)) >= 5 * 60 * 1000;
}

/**
 * Incidents safe to publish: never internal-labelled, never a hidden service,
 * and either currently open or a qualifying resolved incident.
 */
export function publicIncidents(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.filter(i => {
    if (hasExcludedLabel(i)) return false;
    if (HIDDEN_SLUGS.includes(slugOf(i))) return false;
    if (HIDDEN_SERVICE_NAMES.includes(serviceNameOf(i))) return false;
    return i.state === 'open' || isQualifyingIncident(i);
  });
}

export function fmtDuration(startIso, endIso) {
  const mins = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
