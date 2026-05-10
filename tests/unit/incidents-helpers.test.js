import { describe, it, expect } from 'vitest';

// Pure functions re-defined from status-page/incidents.html for unit testing.
// Keep in sync if the originals change.

function duration(a, b) {
  const secs = Math.round((new Date(b) - new Date(a)) / 1000);
  if (secs < 60) return secs + 's';
  const mins = Math.floor(secs / 60), remS = secs % 60;
  if (mins < 60) return mins + 'm ' + (remS > 0 ? remS + 's' : '');
  const hrs = Math.floor(mins / 60), remM = mins % 60;
  return hrs + 'h ' + (remM > 0 ? remM + 'm' : '');
}

function serviceName(title) {
  let t = title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  for (const s of [' is down', ' is degraded', ' has degraded performance']) {
    if (t.toLowerCase().includes(s)) { t = t.slice(0, t.toLowerCase().indexOf(s)); break; }
  }
  return t.trim();
}

function statusCode(title) {
  const m = title.match(/\((\d+)\s+in/);
  return m ? m[1] : null;
}

// ── duration ─────────────────────────────────────────────────────────────────

describe('duration', () => {
  it('T01 — 0 seconds → "0s"', () => {
    const t = '2026-05-09T10:00:00Z';
    expect(duration(t, t).trim()).toBe('0s');
  });

  it('T02 — 45 seconds → "45s"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T10:00:45Z').trim()).toBe('45s');
  });

  it('T03 — 59 seconds → "59s"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T10:00:59Z').trim()).toBe('59s');
  });

  it('T04 — exactly 60 seconds → "1m"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T10:01:00Z').trim()).toBe('1m');
  });

  it('T05 — 90 seconds → "1m 30s"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T10:01:30Z').trim()).toBe('1m 30s');
  });

  it('T06 — exactly 60 minutes → "1h"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T11:00:00Z').trim()).toBe('1h');
  });

  it('T07 — 61 minutes → "1h 1m"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T11:01:00Z').trim()).toBe('1h 1m');
  });

  it('T08 — 90 minutes → "1h 30m"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T11:30:00Z').trim()).toBe('1h 30m');
  });

  it('T09 — 2 hours → "2h"', () => {
    expect(duration('2026-05-09T10:00:00Z', '2026-05-09T12:00:00Z').trim()).toBe('2h');
  });
});

// ── serviceName ───────────────────────────────────────────────────────────────

describe('serviceName', () => {
  it('T10 — strips "is down" and trailing status code', () => {
    expect(serviceName('Salaaz Marketplace is down (200 in 0ms)')).toBe('Salaaz Marketplace');
  });

  it('T11 — strips "is degraded" suffix', () => {
    expect(serviceName('Vendor Portal is degraded')).toBe('Vendor Portal');
  });

  it('T12 — strips "has degraded performance" suffix', () => {
    expect(serviceName('Ethics Dashboard has degraded performance')).toBe('Ethics Dashboard');
  });

  it('T13 — strips leading emoji (🟥)', () => {
    expect(serviceName('🟥 Salaaz Marketplace is down')).toBe('Salaaz Marketplace');
  });

  it('T14 — strips leading emoji (🟨)', () => {
    expect(serviceName('🟨 Vendor Portal is degraded')).toBe('Vendor Portal');
  });

  it('T15 — case-insensitive suffix matching', () => {
    expect(serviceName('Salaaz Marketplace IS DOWN')).toBe('Salaaz Marketplace');
  });

  it('T16 — returns original (trimmed) name when no known suffix is present', () => {
    expect(serviceName('Salaaz Marketplace')).toBe('Salaaz Marketplace');
  });

  it('T17 — handles multi-word service names', () => {
    expect(serviceName('🟥 Ethics Dashboard is down')).toBe('Ethics Dashboard');
  });
});

// ── statusCode ────────────────────────────────────────────────────────────────

describe('statusCode', () => {
  it('T18 — extracts "200" from "(200 in 0ms)"', () => {
    expect(statusCode('🟥 Site is down (200 in 0ms)')).toBe('200');
  });

  it('T19 — extracts "503" from "(503 in ...)"', () => {
    expect(statusCode('Site is down (503 in 12ms)')).toBe('503');
  });

  it('T20 — returns null when title has no status code pattern', () => {
    expect(statusCode('Vendor Portal is degraded')).toBeNull();
  });

  it('T21 — returns null for empty string', () => {
    expect(statusCode('')).toBeNull();
  });

  it('T22 — returns null when number not followed by " in"', () => {
    expect(statusCode('Issue number 42 reported')).toBeNull();
  });
});
