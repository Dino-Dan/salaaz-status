import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PAGE    = pathToFileURL(resolve(__dir, '../../status-page/index.html')).href;
const FIXTURE = (name) => readFileSync(resolve(__dir, '../fixtures', name), 'utf8');

function yml(status, start = '2020-01-01T00:00:00.000Z') {
  return `status: ${status}\nstartTime: ${start}\n`;
}

async function mockAll(page, summary, mkt = 'up', vnd = 'up', eth = 'up') {
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('/history/summary.json'))          return route.fulfill({ body: summary, contentType: 'application/json' });
    if (url.includes('/history/salaaz-marketplace.yml')) return route.fulfill({ body: yml(mkt), contentType: 'text/plain' });
    if (url.includes('/history/vendor-portal.yml'))      return route.fulfill({ body: yml(vnd), contentType: 'text/plain' });
    if (url.includes('/history/ethics-dashboard.yml'))   return route.fulfill({ body: yml(eth), contentType: 'text/plain' });
    return route.continue();
  });
}

// ── Page structure ────────────────────────────────────────────────────────────

test.describe('Page structure', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
  });

  test('T01 — title is "Salaaz Status"', async ({ page }) => {
    await expect(page).toHaveTitle('Salaaz Status');
  });

  test('T02 — html[lang] is "en"', async ({ page }) => {
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });

  test('T03 — nav brand shows "Salaaz Status"', async ({ page }) => {
    await expect(page.locator('.nav-brand')).toContainText('Salaaz Status');
  });

  test('T04 — footer shows copyright', async ({ page }) => {
    await expect(page.locator('footer')).toContainText('© 2026 Salaaz');
  });

  test('T05 — "Services" section label present', async ({ page }) => {
    await expect(page.locator('.section-label')).toContainText('Services');
  });

  test('T06 — color legend has all four entries', async ({ page }) => {
    const legend = page.locator('.color-legend');
    for (const label of ['Operational', 'Degraded', 'Outage', 'No data']) {
      await expect(legend).toContainText(label);
    }
  });
});

// ── Loading states ────────────────────────────────────────────────────────────

test.describe('Loading states', () => {
  test('T07 — skeleton cards are shown immediately before data arrives', async ({ page }) => {
    let resolve;
    const delayed = new Promise(r => { resolve = r; });
    await page.route('**/history/summary.json', async route => {
      await delayed;
      return route.abort('failed');
    });
    await page.goto(PAGE);
    await expect(page.locator('.skeleton-line').first()).toBeVisible();
    resolve();
  });

  test('T08 — skeleton replaced by real cards after successful load', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    await expect(page.locator('.skeleton-card')).toHaveCount(0);
    expect(await page.locator('.card').count()).toBeGreaterThan(0);
  });
});

// ── Status banner ─────────────────────────────────────────────────────────────

test.describe('Status banner', () => {
  test('T09 — all up → "All Systems Operational" with green dot', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner');
    await expect(page.locator('.banner-title')).toContainText('All Systems Operational');
    await expect(page.locator('.dot-green')).toBeVisible();
  });

  test('T10 — one down → "1 Service Down" (singular) with red dot', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-one-down.json'), 'down');
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner');
    await expect(page.locator('.banner-title')).toContainText('1 Service Down');
    await expect(page.locator('.dot-red')).toBeVisible();
  });

  test('T11 — two down → "2 Services Down" (plural)', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-two-down.json'), 'down', 'down');
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner');
    await expect(page.locator('.banner-title')).toContainText('2 Services Down');
  });

  test('T12 — degraded → "Some Systems Degraded" with amber dot', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-degraded.json'), 'degraded');
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner');
    await expect(page.locator('.banner-title')).toContainText('Some Systems Degraded');
    await expect(page.locator('.dot-amber')).toBeVisible();
  });
});

// ── Service cards ─────────────────────────────────────────────────────────────

test.describe('Service cards', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
  });

  test('T13 — renders exactly 3 service cards', async ({ page }) => {
    expect(await page.locator('.card').count()).toBe(3);
  });

  test('T14 — each expected service is present', async ({ page }) => {
    for (const name of ['Salaaz Marketplace', 'Vendor Portal', 'Ethics Dashboard']) {
      await expect(page.locator('.card').filter({ hasText: name })).toBeVisible();
    }
  });

  test('T15 — up service shows green "Operational" tag', async ({ page }) => {
    const card = page.locator('.card').filter({ hasText: 'Salaaz Marketplace' });
    await expect(card.locator('.tag-up')).toContainText('Operational');
  });

  test('T16 — down service shows red "Down" tag', async ({ page, context }) => {
    const p = await context.newPage();
    await mockAll(p, FIXTURE('summary-one-down.json'), 'down');
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-down')).toContainText('Down');
    await p.close();
  });

  test('T17 — degraded service shows amber "Degraded" tag', async ({ page, context }) => {
    const p = await context.newPage();
    await mockAll(p, FIXTURE('summary-degraded.json'), 'degraded');
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-degraded')).toContainText('Degraded');
    await p.close();
  });

  test('T18 — each card shows the service hostname', async ({ page }) => {
    await expect(page.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.service-url')).toContainText('salaaz.com');
    await expect(page.locator('.card').filter({ hasText: 'Vendor Portal' }).locator('.service-url')).toContainText('vendors.salaaz.com');
  });

  test('T19 — each card shows response time and uptime percentage', async ({ page }) => {
    const card = page.locator('.card').filter({ hasText: 'Salaaz Marketplace' });
    await expect(card.locator('.uptime-pct')).toContainText('ms avg');
    await expect(card.locator('.uptime-pct')).toContainText('%');
  });

  test('T20 — no Components panel is rendered (feature is disabled)', async ({ page }) => {
    expect(await page.locator('.card-toggle').count()).toBe(0);
    expect(await page.locator('.card-components').count()).toBe(0);
  });
});

// ── Bar chart ─────────────────────────────────────────────────────────────────

test.describe('Bar chart', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
  });

  test('T21 — each bar strip contains exactly 90 bars', async ({ page }) => {
    const strips = page.locator('.bar-strip');
    for (let i = 0; i < await strips.count(); i++) {
      expect(await strips.nth(i).locator('.bar').count()).toBe(90);
    }
  });

  test('T22 — bar legend shows "90 days ago" on left and "Today" on right', async ({ page }) => {
    const legend = page.locator('.bar-legend').first();
    await expect(legend).toContainText('90 days ago');
    await expect(legend).toContainText('Today');
  });

  test('T23 — bars before startDate are grey (#D1D0C9)', async ({ page, context }) => {
    const p = await context.newPage();
    // Future startDate → no bars have data yet → all 90 should be grey
    const futureYml = `status: up\nstartTime: 2099-01-01T00:00:00.000Z\n`;
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: futureYml, contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const firstBar = p.locator('.bar-strip').first().locator('.bar').first();
    const color = await firstBar.evaluate(el => el.style.background);
    expect(color).toBe('rgb(209, 208, 201)');
    await p.close();
  });

  test('T24 — operational day bar is green (#76AD2A)', async ({ page }) => {
    const lastBar = page.locator('.bar-strip').first().locator('.bar').last();
    const color = await lastBar.evaluate(el => el.style.background);
    expect(color).toBe('rgb(118, 173, 42)');
  });

  test('T25 — degraded day bar is amber (#FAA72A)', async ({ page, context }) => {
    const p = await context.newPage();
    const today = new Date().toISOString().split('T')[0];
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary[0].dailyMinutesDown = { [today]: 60 };
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: JSON.stringify(summary), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const lastBar = p.locator('.bar-strip').first().locator('.bar').last();
    expect(await lastBar.evaluate(el => el.style.background)).toBe('rgb(250, 167, 42)');
    await p.close();
  });

  test('T26 — outage day bar is red (#E04343) when >= 720 min down', async ({ page, context }) => {
    const p = await context.newPage();
    const today = new Date().toISOString().split('T')[0];
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary[0].dailyMinutesDown = { [today]: 720 };
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: JSON.stringify(summary), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const lastBar = p.locator('.bar-strip').first().locator('.bar').last();
    expect(await lastBar.evaluate(el => el.style.background)).toBe('rgb(224, 67, 67)');
    await p.close();
  });

  test('T27 — hovering a bar shows tooltip', async ({ page }) => {
    const bar = page.locator('.bar-strip').first().locator('.bar').last();
    await bar.hover();
    await expect(page.locator('#tooltip')).toBeVisible();
  });

  test('T28 — tooltip for operational bar contains "Operational"', async ({ page }) => {
    const bar = page.locator('.bar-strip').first().locator('.bar').last();
    await bar.hover();
    await expect(page.locator('#tooltip')).toContainText('Operational');
  });

  test('T29 — tooltip for today\'s bar contains the current month name', async ({ page }) => {
    const month = new Date().toLocaleDateString('en-US', { month: 'short' });
    const bar = page.locator('.bar-strip').first().locator('.bar').last();
    await bar.hover();
    await expect(page.locator('#tooltip')).toContainText(month);
  });

  test('T30 — moving mouse off bar hides tooltip', async ({ page }) => {
    const bar = page.locator('.bar-strip').first().locator('.bar').last();
    await bar.hover();
    await expect(page.locator('#tooltip')).toBeVisible();
    await page.locator('.nav-brand').hover();
    await expect(page.locator('#tooltip')).toBeHidden();
  });
});

// ── Uptime calculation ────────────────────────────────────────────────────────

test.describe('Uptime calculation', () => {
  test('T31 — service with no downtime shows "100.00%" uptime', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    const uptime = await page.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.uptime-pct').textContent();
    expect(uptime).toContain('100.00%');
  });

  test('T32 — one full day outage out of 90 monitored days → ~98.89% uptime', async ({ page, context }) => {
    const p = await context.newPage();
    const d = new Date();
    d.setDate(d.getDate() - 89);
    const ds = d.toISOString().split('T')[0];
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary[0].dailyMinutesDown = { [ds]: 1440 };
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: JSON.stringify(summary), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const uptime = await p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.uptime-pct').textContent();
    expect(uptime).toContain('98.89%');
    await p.close();
  });

  test('T33 — days before startDate are excluded from uptime denominator', async ({ page, context }) => {
    // startDate = yesterday → only 2 monitored days, both up → 100%
    const p = await context.newPage();
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const recentYml = `status: up\nstartTime: ${yest.toISOString()}\n`;
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: recentYml, contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const uptime = await p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.uptime-pct').textContent();
    expect(uptime).toContain('100.00%');
    await p.close();
  });

  test('T34 — future startDate yields "N/A" uptime (no monitored days)', async ({ page, context }) => {
    const p = await context.newPage();
    const futureYml = `status: up\nstartTime: 2099-01-01T00:00:00.000Z\n`;
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: futureYml, contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const uptime = await p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.uptime-pct').textContent();
    expect(uptime).toContain('N/A');
    await p.close();
  });
});

// ── YAML status override (false-positive prevention) ─────────────────────────

test.describe('YAML overrides summary.json status', () => {
  test('T35 — YAML "down" overrides summary.json "up"', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'), 'down');
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    await expect(page.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-down')).toContainText('Down');
  });

  test('T36 — YAML "up" overrides summary.json "down"', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-one-down.json'), 'up');
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    await expect(page.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-up')).toContainText('Operational');
  });

  test('T37 — banner reflects YAML status, not stale summary.json status', async ({ page }) => {
    // Summary says all up, but YAML says marketplace is down
    await mockAll(page, FIXTURE('summary-all-up.json'), 'down');
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner');
    await expect(page.locator('.banner-title')).toContainText('1 Service Down');
  });

  test('T38 — only the overridden service changes; others are unaffected', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'), 'down', 'up', 'up');
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    await expect(page.locator('.card').filter({ hasText: 'Vendor Portal' }).locator('.tag-up')).toContainText('Operational');
    await expect(page.locator('.card').filter({ hasText: 'Ethics Dashboard' }).locator('.tag-up')).toContainText('Operational');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('Error handling', () => {
  test('T39 — shows error banner when summary.json fetch fails', async ({ page }) => {
    await page.route('**/history/summary.json', route => route.abort('failed'));
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner.some-down');
    await expect(page.locator('.banner-title')).toContainText('Could not load status data');
    await expect(page.locator('.banner-sub')).toContainText('Please refresh the page.');
  });

  test('T40 — services container is empty on fetch error', async ({ page }) => {
    await page.route('**/history/summary.json', route => route.abort('failed'));
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner.some-down');
    expect(await page.locator('#services .card').count()).toBe(0);
  });

  test('T41 — page does not crash when all YAML fetches fail (falls back to summary status)', async ({ page }) => {
    await page.route('**/history/summary.json', route =>
      route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' }));
    await page.route('**/*.yml', route => route.abort('failed'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    expect(await page.locator('.card').count()).toBe(3);
  });

  test('T42 — no uncaught JS errors during a normal load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    expect(errors).toHaveLength(0);
  });
});

// ── Last-checked timestamp ────────────────────────────────────────────────────

test.describe('Last-checked timestamp', () => {
  test('T43 — populated after load with "Last checked:" prefix', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    const text = await page.locator('#last-checked').textContent();
    expect(text).toMatch(/^Last checked:/);
    expect(text!.length).toBeGreaterThan('Last checked: '.length);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
  });

  test('T44 — viewport meta tag is present', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toContain('width=device-width');
  });

  test('T45 — nav logo has an alt attribute', async ({ page }) => {
    const alt = await page.locator('nav img').getAttribute('alt');
    expect(alt).not.toBeNull();
  });

  test('T46 — service icon images have an alt attribute', async ({ page }) => {
    const icons = page.locator('.service-icon');
    for (let i = 0; i < await icons.count(); i++) {
      expect(await icons.nth(i).getAttribute('alt')).not.toBeNull();
    }
  });
});

// ── Responsive layout ─────────────────────────────────────────────────────────

test.describe('Responsive layout', () => {
  test('T47 — page is usable at 375px wide (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('.status-banner')).toBeVisible();
  });

  test('T48 — no horizontal scroll on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
