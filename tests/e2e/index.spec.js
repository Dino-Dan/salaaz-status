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

async function mockAll(page, summary, mkt = 'up', vnd = 'up', eth = 'up', shipping = 'up', payments = 'up', api = 'up') {
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('/history/summary.json'))             return route.fulfill({ body: summary, contentType: 'application/json' });
    if (url.includes('/history/salaaz-marketplace.yml'))   return route.fulfill({ body: yml(mkt), contentType: 'text/plain' });
    if (url.includes('/history/vendor-portal.yml'))        return route.fulfill({ body: yml(vnd), contentType: 'text/plain' });
    if (url.includes('/history/ethics-dashboard.yml'))     return route.fulfill({ body: yml(eth), contentType: 'text/plain' });
    if (url.includes('/history/stallion-status.json'))     return route.fulfill({ body: JSON.stringify({ status: shipping }), contentType: 'application/json' });
    if (url.includes('/history/square-status.json'))       return route.fulfill({ body: JSON.stringify({ status: payments }), contentType: 'application/json' });
    if (url.includes('/history/alibaba-ecs-status.json'))  return route.fulfill({ body: JSON.stringify({ status: api }),      contentType: 'application/json' });
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
    // Trailing * — see note in the error-handling tests: fetches are cache-busted.
    await page.route('**/history/summary.json*', async route => {
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

  test('T13 — renders exactly 2 service cards', async ({ page }) => {
    expect(await page.locator('.card').count()).toBe(2);
  });

  test('T14 — each expected service is present', async ({ page }) => {
    for (const name of ['Salaaz Marketplace', 'Vendor Portal']) {
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
    await expect(card.locator('.uptime-pct')).toContainText('ms');
    await expect(card.locator('.uptime-pct')).toContainText('%');
  });

  test('T57 — down service shows "—" instead of response time', async ({ page, context }) => {
    const p = await context.newPage();
    await mockAll(p, FIXTURE('summary-one-down.json'), 'down');
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const card = p.locator('.card').filter({ hasText: 'Salaaz Marketplace' });
    await expect(card.locator('.uptime-pct')).toContainText('—');
    await expect(card.locator('.uptime-pct')).not.toContainText('ms');
    await p.close();
  });

  test('T20 — only the Marketplace card has a dependency toggle; other cards do not', async ({ page }) => {
    expect(await page.locator('.card-toggle').count()).toBe(1);
    const mktCard = page.locator('.card').filter({ hasText: 'Salaaz Marketplace' });
    await expect(mktCard.locator('.card-toggle')).toBeVisible();
    expect(await page.locator('.card').filter({ hasText: 'Vendor Portal' }).locator('.card-toggle').count()).toBe(0);
  });
});

// ── Internal-only services ────────────────────────────────────────────────────
// Ethics Dashboard is still monitored by Upptime (and still present in
// summary.json), but must never surface on the public page.

test.describe('Internal-only services are hidden', () => {
  test('T58 — hidden service is not rendered even though summary.json contains it', async ({ page }) => {
    // Guard the premise: the fixture must still list it, or this proves nothing.
    expect(JSON.parse(FIXTURE('summary-all-up.json')).some(s => s.slug === 'ethics-dashboard')).toBe(true);

    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    expect(await page.locator('.card').filter({ hasText: 'Ethics Dashboard' }).count()).toBe(0);
    await expect(page.locator('#services')).not.toContainText('Ethics');
  });

  test('T59 — no network request is made for the hidden service', async ({ page }) => {
    const requested = [];
    page.on('request', r => requested.push(r.url()));
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    expect(requested.filter(u => u.includes('ethics'))).toEqual([]);
  });

  test('T60 — banner stays green when only the hidden service is down', async ({ page }) => {
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary.find(s => s.slug === 'ethics-dashboard').status = 'down';
    await mockAll(page, JSON.stringify(summary));
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner');
    await expect(page.locator('.status-banner')).toHaveClass(/all-up/);
    await expect(page.locator('.banner-title')).toContainText('All Systems Operational');
  });

  test('T61 — hidden-service incidents are filtered out of Past Incidents', async ({ page }) => {
    const closed  = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const created = new Date(closed.getTime() - 30 * 60 * 1000);
    await mockAll(page, FIXTURE('summary-all-up.json'));
    // Registered after mockAll's catch-all, so it takes priority.
    await page.route(/history\/incidents\.json/, route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { title: '🟥 Ethics Dashboard is down (500 in 1234ms)', state: 'closed',
          created_at: created.toISOString(), closed_at: closed.toISOString() },
        { title: '🟥 Vendor Portal is down (500 in 1234ms)', state: 'closed',
          created_at: created.toISOString(), closed_at: closed.toISOString() },
      ]),
    }));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-row');
    expect(await page.locator('.incident-row').count()).toBe(1);
    await expect(page.locator('#past-incidents')).toContainText('Vendor Portal');
    await expect(page.locator('#past-incidents')).not.toContainText('Ethics');
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

  test('T24 — operational day bar is leaf green (#4F7A1B)', async ({ page }) => {
    const lastBar = page.locator('.bar-strip').first().locator('.bar').last();
    const color = await lastBar.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(color).toBe('rgb(79, 122, 27)');
  });

  test('T25 — degraded day bar is amber (#C68B3C)', async ({ page, context }) => {
    const p = await context.newPage();
    const n = new Date();
    const today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary[0].dailyMinutesDown = { [today]: 60 };
    // Bar chart now gates on a real, qualifying (>=5min, resolved) incident matching this
    // date — anchor at local noon so it round-trips to the same calendar day regardless
    // of the test machine's timezone.
    const localNoon = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0);
    const incidents = [{
      title: '🛑 Salaaz Marketplace is down',
      state: 'closed',
      created_at: localNoon.toISOString(),
      closed_at: new Date(localNoon.getTime() + 60 * 60000).toISOString(),
    }];
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: JSON.stringify(summary), contentType: 'application/json' });
      if (url.includes('/history/incidents.json'))   return route.fulfill({ body: JSON.stringify(incidents), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const lastBar = p.locator('.bar-strip').first().locator('.bar').last();
    expect(await lastBar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(198, 139, 60)');
    await p.close();
  });

  test('T26 — outage day bar is rose (#8E3A47) when >= 720 min down', async ({ page, context }) => {
    const p = await context.newPage();
    const n = new Date();
    const today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary[0].dailyMinutesDown = { [today]: 720 };
    const localNoon = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0);
    const incidents = [{
      title: '🛑 Salaaz Marketplace is down',
      state: 'closed',
      created_at: localNoon.toISOString(),
      closed_at: new Date(localNoon.getTime() + 720 * 60000).toISOString(),
    }];
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))     return route.fulfill({ body: JSON.stringify(summary), contentType: 'application/json' });
      if (url.includes('/history/incidents.json'))   return route.fulfill({ body: JSON.stringify(incidents), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const lastBar = p.locator('.bar-strip').first().locator('.bar').last();
    expect(await lastBar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(142, 58, 71)');
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
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('Error handling', () => {
  test('T39 — shows error banner when summary.json fetch fails', async ({ page }) => {
    // Trailing * — the page cache-busts every fetch with a ?_=<ts> query string,
    // which a bare '**/history/summary.json' glob would not match.
    await page.route('**/history/summary.json*', route => route.abort('failed'));
    await page.goto(PAGE);
    await page.waitForSelector('.status-banner.some-down');
    await expect(page.locator('.banner-title')).toContainText('Could not load status data');
    await expect(page.locator('.banner-sub')).toContainText('Please refresh the page.');
  });

  test('T40 — services container is empty on fetch error', async ({ page }) => {
    // Trailing * — the page cache-busts every fetch with a ?_=<ts> query string,
    // which a bare '**/history/summary.json' glob would not match.
    await page.route('**/history/summary.json*', route => route.abort('failed'));
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
    expect(await page.locator('.card').count()).toBe(2);
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
  test('T43 — populated after load with "Last updated:" prefix', async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    const text = await page.locator('#last-checked').textContent();
    expect(text).toMatch(/^Last updated:/);
    expect((text ?? '').length).toBeGreaterThan('Last updated: '.length);
  });

  test('T44 — uses YAML lastUpdated when present, not page-load time', async ({ page, context }) => {
    const p = await context.newPage();
    const knownTime = '2026-01-15T10:30:00.000Z';
    const ymlWithTs = (status) => `status: ${status}\nstartTime: 2020-01-01T00:00:00.000Z\nlastUpdated: ${knownTime}\n`;
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))             return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/salaaz-marketplace.yml'))   return route.fulfill({ body: ymlWithTs('up'), contentType: 'text/plain' });
      if (url.includes('/history/vendor-portal.yml'))        return route.fulfill({ body: ymlWithTs('up'), contentType: 'text/plain' });
      if (url.includes('/history/ethics-dashboard.yml'))     return route.fulfill({ body: ymlWithTs('up'), contentType: 'text/plain' });
      if (url.includes('/history/stallion-status.json'))     return route.fulfill({ body: JSON.stringify({ status: 'up' }), contentType: 'application/json' });
      if (url.includes('/history/square-status.json'))       return route.fulfill({ body: JSON.stringify({ status: 'up' }), contentType: 'application/json' });
      if (url.includes('/history/alibaba-ecs-status.json'))  return route.fulfill({ body: JSON.stringify({ status: 'up' }), contentType: 'application/json' });
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const text = await p.locator('#last-checked').textContent();
    // Jan 15 is in the YAML timestamp — page load time would not contain "Jan 15"
    expect(text).toContain('Jan 15');
    await p.close();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
  });

  test('T45 — viewport meta tag is present', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toContain('width=device-width');
  });

  test('T46 — nav logo has an alt attribute', async ({ page }) => {
    const alt = await page.locator('nav img').getAttribute('alt');
    expect(alt).not.toBeNull();
  });

  test('T47 — service icons have an accessible name (alt, or role=img + aria-label for inline SVG)', async ({ page }) => {
    const icons = page.locator('.service-icon');
    for (let i = 0; i < await icons.count(); i++) {
      const icon = icons.nth(i);
      const tag = await icon.evaluate(el => el.tagName.toLowerCase());
      if (tag === 'img') {
        expect(await icon.getAttribute('alt')).not.toBeNull();
      } else {
        expect(await icon.getAttribute('role')).toBe('img');
        expect(await icon.getAttribute('aria-label')).not.toBeNull();
      }
    }
  });
});

// ── Responsive layout ─────────────────────────────────────────────────────────

test.describe('Responsive layout', () => {
  test('T48 — page is usable at 375px wide (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('.status-banner')).toBeVisible();
  });

  test('T49 — no horizontal scroll on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

// ── Dependency badges (Marketplace card) ──────────────────────────────────────

test.describe('Dependency badges', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page, FIXTURE('summary-all-up.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.card');
  });

  test('T50 — Marketplace card has a "Dependencies" toggle', async ({ page }) => {
    const mktCard = page.locator('.card').filter({ hasText: 'Salaaz Marketplace' });
    await expect(mktCard.locator('.card-toggle')).toContainText('Dependencies');
  });

  test('T51 — dependencies panel is collapsed by default', async ({ page }) => {
    await expect(page.locator('.card-components').first()).not.toHaveClass(/visible/);
  });

  test('T52 — clicking toggle expands the panel', async ({ page }) => {
    await page.locator('.card-toggle').first().click();
    await expect(page.locator('.card-components').first()).toHaveClass(/visible/);
  });

  test('T53 — panel shows all three dependency labels', async ({ page }) => {
    await page.locator('.card-toggle').first().click();
    const panel = page.locator('.card-components').first();
    for (const label of ['Shipping', 'Payments', 'API']) {
      await expect(panel).toContainText(label);
    }
  });

  test('T54 — "up" dep shows "Operational" badge', async ({ page }) => {
    await page.locator('.card-toggle').first().click();
    const row = page.locator('.component-row').filter({ hasText: 'API' });
    await expect(row.locator('.comp-badge')).toContainText('Operational');
  });

  test('T55 — "degraded" dep shows "Degraded" badge', async ({ page, context }) => {
    const p = await context.newPage();
    await mockAll(p, FIXTURE('summary-all-up.json'), 'up', 'up', 'up', 'up', 'up', 'degraded');
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await p.locator('.card-toggle').first().click();
    const row = p.locator('.component-row').filter({ hasText: 'API' });
    await expect(row.locator('.comp-badge')).toContainText('Degraded');
    await p.close();
  });

  test('T56 — failed dep fetch shows "Unknown" badge', async ({ page, context }) => {
    const p = await context.newPage();
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))             return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      if (url.includes('stallion-status.json'))              return route.fulfill({ body: JSON.stringify({ status: 'up' }), contentType: 'application/json' });
      if (url.includes('square-status.json'))                return route.fulfill({ body: JSON.stringify({ status: 'up' }), contentType: 'application/json' });
      if (url.includes('alibaba-ecs-status.json'))           return route.abort('failed');
      return route.continue();
    });
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await p.locator('.card-toggle').first().click();
    const row = p.locator('.component-row').filter({ hasText: 'API' });
    await expect(row.locator('.comp-badge')).toContainText('Unknown');
    await p.close();
  });
});

// ── Internal alert issues ─────────────────────────────────────────────────────
//
// The smoke checks and dependency pings open `internal`-labelled issues purely so
// the GitHub→Discord webhook fires. A third-party outage is not a Salaaz incident
// and must never reach the public page.

test.describe('Internal alert issues are never public', () => {
  const todayStr = () => {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  };

  async function mockWithIncidents(p, incidents, summary) {
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))             return route.fulfill({ body: JSON.stringify(summary), contentType: 'application/json' });
      if (url.includes('/history/incidents.json'))           return route.fulfill({ body: JSON.stringify(incidents), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
  }

  test('T63 — an internal alert does not appear in Past Incidents', async ({ context }) => {
    const p = await context.newPage();
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60000);
    await mockWithIncidents(p, [{
      number: 900,
      title: '⚠️ [internal] Payments dependency (Square) is unhealthy',
      state: 'closed',
      created_at: start.toISOString(),
      closed_at: now.toISOString(),
      labels: [{ name: 'internal' }, { name: 'dep-payments' }],
    }], JSON.parse(FIXTURE('summary-all-up.json')));
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('#past-incidents')).toContainText('No incidents in the past 14 days');
    await expect(p.locator('#past-incidents')).not.toContainText('Square');
    await p.close();
  });

  test('T64 — an internal alert does not colour a bar', async ({ context }) => {
    const p = await context.newPage();
    const today = todayStr();
    const summary = JSON.parse(FIXTURE('summary-all-up.json'));
    summary[0].dailyMinutesDown = { [today]: 60 };
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    await mockWithIncidents(p, [{
      number: 901,
      title: '⚠️ [internal] Payments dependency (Square) is unhealthy',
      state: 'closed',
      created_at: noon.toISOString(),
      closed_at: new Date(noon.getTime() + 60 * 60000).toISOString(),
      labels: [{ name: 'internal' }, { name: 'dep-payments' }],
    }], summary);
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    // Only an incident on record may turn a bar amber. The internal alert is
    // filtered out, so dailyMinutesDown alone must not be believed.
    const lastBar = p.locator('.bar-strip').first().locator('.bar').last();
    expect(await lastBar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(79, 122, 27)');
    await p.close();
  });
});

// ── Scheduled maintenance ─────────────────────────────────────────────────────

test.describe('Scheduled maintenance', () => {
  function maintenanceIssue(startAt, endAt) {
    return {
      number: 800,
      title: '[Scheduled Maintenance] Database upgrade',
      state: 'open',
      created_at: new Date().toISOString(),
      closed_at: null,
      labels: [{ name: 'maintenance' }],
      body: `<!--\nstart: ${startAt.toISOString()}\nend: ${endAt.toISOString()}\nexpectedDown: salaaz-marketplace\n-->\n\nUpgrading the primary database.`,
    };
  }

  async function mockMaintenance(p, issue) {
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))             return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/incidents.json'))           return route.fulfill({ body: JSON.stringify([issue]), contentType: 'application/json' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
  }

  test('T65 — an active window takes over the banner', async ({ context }) => {
    const p = await context.newPage();
    const now = Date.now();
    await mockMaintenance(p, maintenanceIssue(new Date(now - 30 * 60000), new Date(now + 30 * 60000)));
    await p.goto(PAGE);
    await p.waitForSelector('.status-banner');
    await expect(p.locator('.banner-title')).toContainText('Scheduled Maintenance In Progress');
    await expect(p.locator('.status-banner.maintenance')).toBeVisible();
    await p.close();
  });

  test('T66 — an upcoming window shows a notice above the live banner', async ({ context }) => {
    const p = await context.newPage();
    const now = Date.now();
    await mockMaintenance(p, maintenanceIssue(new Date(now + 2 * 86400000), new Date(now + 2 * 86400000 + 3600000)));
    await p.goto(PAGE);
    await p.waitForSelector('.status-banner');
    await expect(p.locator('.maintenance-notice')).toContainText('Scheduled maintenance');
    // The real status is unchanged — the window has not started.
    await expect(p.locator('.banner-title')).toContainText('All Systems Operational');
    await p.close();
  });

  test('T67 — a window more than 7 days out is not announced yet', async ({ context }) => {
    const p = await context.newPage();
    const now = Date.now();
    await mockMaintenance(p, maintenanceIssue(new Date(now + 30 * 86400000), new Date(now + 30 * 86400000 + 3600000)));
    await p.goto(PAGE);
    await p.waitForSelector('.status-banner');
    await expect(p.locator('.maintenance-notice')).toHaveCount(0);
    await p.close();
  });

  test('T68 — maintenance is not counted as a past incident', async ({ context }) => {
    const p = await context.newPage();
    const now = Date.now();
    const issue = maintenanceIssue(new Date(now - 2 * 3600000), new Date(now - 3600000));
    issue.state = 'closed';
    issue.closed_at = new Date(now - 3600000).toISOString();
    await mockMaintenance(p, issue);
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('#past-incidents')).toContainText('No incidents in the past 14 days');
    await p.close();
  });
});

// ── Functional-check overlay ──────────────────────────────────────────────────
//
// synthetic-api.yml asserts the storefront actually returns products. A service
// can answer HTTP 200 while being useless to a customer — that is the
// 2026-08-26 incident. These pin the downgrade-only semantics.

test.describe('Synthetic functional status', () => {
  async function mockWithSynthetic(p, synthetic, mkt = 'up') {
    await p.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/history/summary.json'))             return route.fulfill({ body: FIXTURE('summary-all-up.json'), contentType: 'application/json' });
      if (url.includes('/history/synthetic-status.json'))    return synthetic === null
        ? route.abort('failed')
        : route.fulfill({ body: JSON.stringify(synthetic), contentType: 'application/json' });
      if (url.includes('/history/salaaz-marketplace.yml'))   return route.fulfill({ body: yml(mkt), contentType: 'text/plain' });
      if (url.includes('/history/') && url.endsWith('.yml')) return route.fulfill({ body: yml('up'), contentType: 'text/plain' });
      return route.continue();
    });
  }

  const degraded = (extra = {}) => ({
    'salaaz-marketplace': {
      status: 'degraded', consecutiveFailures: 2, publicDegraded: true,
      failing: ['products'], detail: 'products: catalog is EMPTY', ...extra,
    },
  });

  test('T69 — publicDegraded downgrades an otherwise-green service', async ({ context }) => {
    const p = await context.newPage();
    await mockWithSynthetic(p, degraded());
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    const card = p.locator('.card').filter({ hasText: 'Salaaz Marketplace' });
    await expect(card.locator('.tag-degraded')).toContainText('Degraded');
    await expect(p.locator('.banner-title')).toContainText('Some Systems Degraded');
    await p.close();
  });

  test('T70 — a first failure (publicDegraded false) does NOT affect the page', async ({ context }) => {
    const p = await context.newPage();
    await mockWithSynthetic(p, degraded({ consecutiveFailures: 1, publicDegraded: false }));
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-up')).toContainText('Operational');
    await expect(p.locator('.banner-title')).toContainText('All Systems Operational');
    await p.close();
  });

  test('T71 — never upgrades: a down service stays down', async ({ context }) => {
    const p = await context.newPage();
    await mockWithSynthetic(p, { 'salaaz-marketplace': { status: 'up', publicDegraded: false } }, 'down');
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-down')).toContainText('Down');
    await p.close();
  });

  test('T72 — a down service is not softened to degraded by the overlay', async ({ context }) => {
    const p = await context.newPage();
    await mockWithSynthetic(p, degraded(), 'down');
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.card').filter({ hasText: 'Salaaz Marketplace' }).locator('.tag-down')).toContainText('Down');
    await p.close();
  });

  test('T73 — a missing synthetic file is treated as no opinion, not an outage', async ({ context }) => {
    const p = await context.newPage();
    await mockWithSynthetic(p, null);
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.banner-title')).toContainText('All Systems Operational');
    await p.close();
  });

  test('T74 — only the named service is downgraded', async ({ context }) => {
    const p = await context.newPage();
    await mockWithSynthetic(p, degraded());
    await p.goto(PAGE);
    await p.waitForSelector('.card');
    await expect(p.locator('.card').filter({ hasText: 'Vendor Portal' }).locator('.tag-up')).toContainText('Operational');
    await p.close();
  });
});
