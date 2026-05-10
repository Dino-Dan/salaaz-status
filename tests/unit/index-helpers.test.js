import { describe, it, expect } from 'vitest';

// Pure functions re-defined from status-page/index.html for unit testing.
// Keep in sync if the originals change.

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function localToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function formatDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dayStatus(dateStr, startDate, dailyMinutesDown) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (!startDate || d < startDate) return 'nodata';
  const mins = (dailyMinutesDown || {})[dateStr] || 0;
  if (mins >= 720) return 'down';
  if (mins > 0)    return 'degraded';
  return 'up';
}

function barColor(status) {
  return { up: '#76AD2A', degraded: '#FAA72A', down: '#E04343', nodata: '#D1D0C9' }[status];
}

function barLabel(dateStr, status, mins) {
  const d = formatDisplay(dateStr);
  if (status === 'nodata')   return `${d}: No data`;
  if (status === 'down')     return `${d}: Outage — ${mins} min down`;
  if (status === 'degraded') return `${d}: Degraded — ${mins} min down`;
  return `${d}: Operational`;
}

// ── localDateStr ─────────────────────────────────────────────────────────────

describe('localDateStr', () => {
  it('T01 — formats date as YYYY-MM-DD', () => {
    expect(localDateStr(new Date(2026, 4, 10))).toBe('2026-05-10');
  });

  it('T02 — zero-pads single-digit month', () => {
    expect(localDateStr(new Date(2026, 0, 15))).toBe('2026-01-15');
  });

  it('T03 — zero-pads single-digit day', () => {
    expect(localDateStr(new Date(2026, 4, 5))).toBe('2026-05-05');
  });

  it('T04 — uses local year/month/day (not UTC)', () => {
    const d = new Date(2026, 4, 10, 0, 0, 0);
    expect(localDateStr(d)).toBe('2026-05-10');
  });

  it('T05 — handles December correctly (month 11 → "12")', () => {
    expect(localDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

// ── localToday ───────────────────────────────────────────────────────────────

describe('localToday', () => {
  it('T06 — hours, minutes, seconds are all zero', () => {
    const today = localToday();
    expect(today.getHours()).toBe(0);
    expect(today.getMinutes()).toBe(0);
    expect(today.getSeconds()).toBe(0);
  });

  it('T07 — matches the current local year, month, and date', () => {
    const now = new Date();
    const today = localToday();
    expect(today.getFullYear()).toBe(now.getFullYear());
    expect(today.getMonth()).toBe(now.getMonth());
    expect(today.getDate()).toBe(now.getDate());
  });
});

// ── dayStatus ────────────────────────────────────────────────────────────────

describe('dayStatus', () => {
  const startDate = new Date(Date.UTC(2026, 4, 8)); // 2026-05-08 UTC

  it('T08 — returns "nodata" when date is strictly before startDate', () => {
    expect(dayStatus('2026-05-07', startDate, {})).toBe('nodata');
  });

  it('T09 — returns "nodata" when startDate is null', () => {
    expect(dayStatus('2026-05-10', null, {})).toBe('nodata');
  });

  it('T10 — returns "nodata" when startDate is undefined', () => {
    expect(dayStatus('2026-05-10', undefined, {})).toBe('nodata');
  });

  it('T11 — returns "up" on the exact startDate with 0 minutes down', () => {
    expect(dayStatus('2026-05-08', startDate, {})).toBe('up');
  });

  it('T12 — returns "up" when dailyMinutesDown entry is 0', () => {
    expect(dayStatus('2026-05-08', startDate, { '2026-05-08': 0 })).toBe('up');
  });

  it('T13 — returns "degraded" when 1 minute down', () => {
    expect(dayStatus('2026-05-08', startDate, { '2026-05-08': 1 })).toBe('degraded');
  });

  it('T14 — returns "degraded" when 719 minutes down', () => {
    expect(dayStatus('2026-05-08', startDate, { '2026-05-08': 719 })).toBe('degraded');
  });

  it('T15 — returns "down" at exactly 720 minutes (half-day threshold)', () => {
    expect(dayStatus('2026-05-08', startDate, { '2026-05-08': 720 })).toBe('down');
  });

  it('T16 — returns "down" when 1440 minutes down (full day)', () => {
    expect(dayStatus('2026-05-08', startDate, { '2026-05-08': 1440 })).toBe('down');
  });

  it('T17 — returns "up" when key is missing from dailyMinutesDown', () => {
    expect(dayStatus('2026-05-10', startDate, { '2026-05-08': 60 })).toBe('up');
  });
});

// ── barColor ─────────────────────────────────────────────────────────────────

describe('barColor', () => {
  it('T18 — "up" → #76AD2A (green)', () => {
    expect(barColor('up')).toBe('#76AD2A');
  });

  it('T19 — "degraded" → #FAA72A (amber)', () => {
    expect(barColor('degraded')).toBe('#FAA72A');
  });

  it('T20 — "down" → #E04343 (red)', () => {
    expect(barColor('down')).toBe('#E04343');
  });

  it('T21 — "nodata" → #D1D0C9 (grey)', () => {
    expect(barColor('nodata')).toBe('#D1D0C9');
  });
});

// ── barLabel ─────────────────────────────────────────────────────────────────

describe('barLabel', () => {
  it('T22 — "nodata" label contains "No data"', () => {
    expect(barLabel('2026-05-10', 'nodata', 0)).toContain('No data');
  });

  it('T23 — "up" label contains "Operational"', () => {
    expect(barLabel('2026-05-10', 'up', 0)).toContain('Operational');
  });

  it('T24 — "degraded" label contains "Degraded" and minute count', () => {
    const label = barLabel('2026-05-10', 'degraded', 45);
    expect(label).toContain('Degraded');
    expect(label).toContain('45');
  });

  it('T25 — "down" label contains "Outage" and minute count', () => {
    const label = barLabel('2026-05-10', 'down', 720);
    expect(label).toContain('Outage');
    expect(label).toContain('720');
  });

  it('T26 — label includes the formatted date (e.g. "May 10, 2026")', () => {
    expect(barLabel('2026-05-10', 'up', 0)).toContain('May 10, 2026');
  });
});

// ── formatDisplay ─────────────────────────────────────────────────────────────

describe('formatDisplay', () => {
  it('T27 — "2026-05-10" → "May 10, 2026"', () => {
    expect(formatDisplay('2026-05-10')).toBe('May 10, 2026');
  });

  it('T28 — "2026-01-01" → "Jan 1, 2026"', () => {
    expect(formatDisplay('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('T29 — "2026-12-25" → "Dec 25, 2026"', () => {
    expect(formatDisplay('2026-12-25')).toBe('Dec 25, 2026');
  });
});
