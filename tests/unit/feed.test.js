import { describe, it, expect } from 'vitest';
import {
  publicIncidents, slugOf, serviceNameOf, hasExcludedLabel, isQualifyingIncident,
} from '../../scripts/incidents-lib.mjs';
import { buildFeed } from '../../scripts/build-feed.mjs';
import { buildApi } from '../../scripts/build-api.mjs';

// Unlike tests/unit/index-helpers.test.js, these import the real modules the
// deploy runs — a regression here fails the build rather than passing against a
// stale copy.

const iso = (min) => new Date(Date.UTC(2026, 7, 1, 12, min, 0)).toISOString();

function issue(over = {}) {
  return {
    number: 1,
    title: '🛑 Salaaz Marketplace is down (500 in 1234 ms)',
    state: 'closed',
    created_at: iso(0),
    closed_at: iso(20),
    html_url: 'https://github.com/Dino-Dan/salaaz-status/issues/1',
    labels: [{ name: 'status' }, { name: 'salaaz-marketplace' }],
    body: '',
    ...over,
  };
}

describe('label handling', () => {
  it('F01 — reads the service slug from labels, not the title', () => {
    expect(slugOf(issue())).toBe('salaaz-marketplace');
  });

  it('F02 — tolerates plain-string labels as well as objects', () => {
    expect(slugOf(issue({ labels: ['status', 'vendor-portal'] }))).toBe('vendor-portal');
  });

  it('F03 — internal-labelled issues are excluded', () => {
    expect(hasExcludedLabel(issue({ labels: [{ name: 'internal' }, { name: 'dep-payments' }] }))).toBe(true);
  });

  it('F04 — maintenance is excluded: planned work is not an incident', () => {
    expect(hasExcludedLabel(issue({ labels: [{ name: 'maintenance' }] }))).toBe(true);
  });

  it('F05 — a normal incident is not excluded', () => {
    expect(hasExcludedLabel(issue())).toBe(false);
  });

  it('F06 — strips emoji and the trailing clause from the title', () => {
    expect(serviceNameOf(issue())).toBe('Salaaz Marketplace');
  });
});

describe('isQualifyingIncident', () => {
  it('F07 — 20 minutes qualifies', () => {
    expect(isQualifyingIncident(issue())).toBe(true);
  });

  it('F08 — under 5 minutes is noise', () => {
    expect(isQualifyingIncident(issue({ closed_at: iso(4) }))).toBe(false);
  });

  it('F09 — an open incident is not "qualifying" (but is still published)', () => {
    expect(isQualifyingIncident(issue({ state: 'open', closed_at: null }))).toBe(false);
  });
});

describe('publicIncidents', () => {
  it('F10 — drops internal alert issues', () => {
    const internal = issue({ number: 2, labels: [{ name: 'internal' }, { name: 'dep-payments' }] });
    expect(publicIncidents([issue(), internal]).map(i => i.number)).toEqual([1]);
  });

  it('F11 — drops hidden services by slug', () => {
    const hidden = issue({ number: 3, labels: [{ name: 'status' }, { name: 'ethics-dashboard' }] });
    expect(publicIncidents([hidden])).toEqual([]);
  });

  it('F12 — drops hidden services by name even without a slug label', () => {
    const hidden = issue({ number: 4, title: '🛑 Ethics Dashboard is down', labels: [{ name: 'status' }] });
    expect(publicIncidents([hidden])).toEqual([]);
  });

  it('F13 — drops maintenance windows', () => {
    const maint = issue({ number: 5, labels: [{ name: 'maintenance' }] });
    expect(publicIncidents([maint])).toEqual([]);
  });

  it('F14 — keeps open incidents regardless of duration', () => {
    const open = issue({ number: 6, state: 'open', closed_at: null });
    expect(publicIncidents([open]).map(i => i.number)).toEqual([6]);
  });

  it('F15 — returns [] for a non-array payload', () => {
    expect(publicIncidents(null)).toEqual([]);
  });
});

describe('buildFeed', () => {
  const now = new Date(Date.UTC(2026, 7, 2));

  it('F16 — emits one entry per public incident', () => {
    const xml = buildFeed([issue()], now);
    expect(xml.match(/<entry>/g)).toHaveLength(1);
  });

  it('F17 — never leaks an internal or hidden incident', () => {
    const xml = buildFeed([
      issue({ number: 2, labels: [{ name: 'internal' }, { name: 'dep-payments' }], title: '⚠️ [internal] Payments dependency (Square) is unhealthy' }),
      issue({ number: 3, labels: [{ name: 'status' }, { name: 'ethics-dashboard' }], title: '🛑 Ethics Dashboard is down' }),
    ], now);
    expect(xml).not.toContain('<entry>');
    expect(xml).not.toContain('Square');
    expect(xml).not.toContain('Ethics');
  });

  it('F18 — escapes XML-significant characters in titles', () => {
    const xml = buildFeed([issue({ title: '🛑 A & B <script> is down' })], now);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('<script>');
  });

  it('F19 — links each entry to its incidents.html anchor', () => {
    const xml = buildFeed([issue({ number: 42 })], now);
    expect(xml).toContain('incidents.html#incident-42');
  });

  it('F20 — is well-formed when there are no incidents', () => {
    const xml = buildFeed([], now);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml.trimEnd().endsWith('</feed>')).toBe(true);
  });
});

describe('buildApi', () => {
  const now = new Date(Date.UTC(2026, 7, 2));
  const summary = [
    { slug: 'salaaz-marketplace', name: 'Salaaz Marketplace', url: 'https://salaaz.com/', status: 'up', time: 460, dailyMinutesDown: {} },
    { slug: 'ethics-dashboard', name: 'Ethics Dashboard', url: 'https://ethics.salaaz.com/', status: 'up', time: 144, dailyMinutesDown: {} },
  ];

  it('F21 — omits hidden services', () => {
    const { summary: doc } = buildApi(summary, [], {}, now);
    expect(doc.services.map(s => s.slug)).toEqual(['salaaz-marketplace']);
  });

  it('F22 — YAML status overrides summary.json', () => {
    const { status } = buildApi(summary, [], { 'salaaz-marketplace': { status: 'down' } }, now);
    expect(status.status.indicator).toBe('major');
  });

  it('F23 — reports "none" when everything is up', () => {
    const { status } = buildApi(summary, [], {}, now);
    expect(status.status.indicator).toBe('none');
    expect(status.status.description).toBe('All systems operational');
  });

  it('F24 — a degraded service yields the degraded indicator', () => {
    const { status } = buildApi(summary, [], { 'salaaz-marketplace': { status: 'degraded' } }, now);
    expect(status.status.indicator).toBe('degraded');
  });

  it('F25 — uptime falls as recorded downtime rises', () => {
    const withDown = [{ ...summary[0], dailyMinutesDown: { '2026-08-01': 1440 } }];
    const { summary: doc } = buildApi(withDown, [], {}, now);
    expect(doc.services[0].uptime_90d).toBeCloseTo(98.89, 2);
  });

  it('F26 — active incidents exclude internal alerts', () => {
    const issues = [
      issue({ number: 7, state: 'open', closed_at: null }),
      issue({ number: 8, state: 'open', closed_at: null, labels: [{ name: 'internal' }, { name: 'dep-api' }] }),
    ];
    const { summary: doc } = buildApi(summary, issues, {}, now);
    expect(doc.active_incidents.map(i => i.id)).toEqual([7]);
  });
});

// ── No GitHub exposure ───────────────────────────────────────────────────────
//
// The feed goes to subscribers we do not control. <id> is nominally just an
// identifier, but readers surface it and some make it clickable, so a github.com
// value would leak the monitoring repo into every subscriber's client.

describe('feed does not expose GitHub', () => {
  const NOW = new Date(Date.UTC(2026, 8, 2));
  const withUrl = (n) => issue({
    number: n,
    html_url: `https://github.com/Dino-Dan/salaaz-status/issues/${n}`,
  });

  it('F27 — no github.com anywhere in the feed, even though html_url is in the data', () => {
    const xml = buildFeed([withUrl(42), withUrl(43)], NOW);
    expect(xml).not.toContain('github.com');
  });

  it('F28 — <id> is our own canonical incident URL', () => {
    const xml = buildFeed([withUrl(42)], NOW);
    expect(xml).toContain('<id>https://status.salaaz.com/incidents.html#incident-42</id>');
  });

  it('F29 — ids stay unique per incident, so readers can still tell entries apart', () => {
    const xml = buildFeed([withUrl(42), withUrl(43)], NOW);
    const ids = [...xml.matchAll(/<id>([^<]+)<\/id>/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
