import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PAGE    = pathToFileURL(resolve(__dir, '../../status-page/incidents.html')).href;
const FIXTURE = (name) => readFileSync(resolve(__dir, '../fixtures', name), 'utf8');

async function mockIssues(page, body) {
  await page.route('**/repos/Dino-Dan/salaaz-status/issues**', route =>
    route.fulfill({ body, contentType: 'application/json' }));
}

async function waitForLoad(page) {
  // Skeletons are replaced once init() finishes
  await page.waitForFunction(() => !document.querySelector('.skeleton-card'));
}

// ── Page structure ────────────────────────────────────────────────────────────

test.describe('Page structure', () => {
  test.beforeEach(async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-empty.json'));
    await page.goto(PAGE);
    await waitForLoad(page);
  });

  test('T01 — title is "Incidents — Salaaz Status"', async ({ page }) => {
    await expect(page).toHaveTitle('Incidents — Salaaz Status');
  });

  test('T02 — html[lang] is "en"', async ({ page }) => {
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });

  test('T03 — page heading says "All Incidents"', async ({ page }) => {
    await expect(page.locator('.page-title')).toContainText('All Incidents');
  });

  test('T04 — back link is present and href is "/"', async ({ page }) => {
    const link = page.locator('.back-link');
    await expect(link).toContainText('Back to Status');
    expect(await link.getAttribute('href')).toBe('/');
  });

  test('T05 — nav brand links back to home', async ({ page }) => {
    await expect(page.locator('.nav-brand')).toContainText('Salaaz Status');
  });
});

// ── Empty states ──────────────────────────────────────────────────────────────

test.describe('Empty states', () => {
  test('T06 — no issues at all → "No incidents recorded yet."', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-empty.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.no-incidents');
    await expect(page.locator('.no-incidents')).toContainText('No incidents recorded yet.');
  });

  test('T07 — only active issues, no resolved → "No resolved incidents yet."', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-active.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.no-incidents');
    await expect(page.locator('.no-incidents')).toContainText('No resolved incidents yet.');
  });
});

// ── Active incidents ──────────────────────────────────────────────────────────

test.describe('Active incidents section', () => {
  test('T08 — section is hidden when no open issues', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-empty.json'));
    await page.goto(PAGE);
    await waitForLoad(page);
    await expect(page.locator('#ongoing-section')).toBeHidden();
  });

  test('T09 — section is visible when open issues exist', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-active.json'));
    await page.goto(PAGE);
    await page.waitForSelector('#ongoing-section:not([style*="display: none"])');
    await expect(page.locator('#ongoing-section')).toBeVisible();
  });

  test('T10 — "Active Incidents" section label is shown', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-active.json'));
    await page.goto(PAGE);
    await page.waitForSelector('#ongoing-section:not([style*="display: none"])');
    await expect(page.locator('#ongoing-section .section-label')).toContainText('Active Incidents');
  });

  test('T11 — active card has red left border', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-active.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card.is-open');
    const borderColor = await page.locator('.incident-card.is-open').first()
      .evaluate(el => getComputedStyle(el).borderLeftColor);
    expect(borderColor).toBe('rgb(224, 67, 67)');
  });

  test('T12 — active badge says "Active" (not "Ongoing")', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-active.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card.is-open');
    const badge = page.locator('.incident-card.is-open .badge-ongoing');
    await expect(badge).toContainText('Active');
    await expect(badge).not.toContainText('Ongoing');
  });

  test('T13 — expanded active card shows "Impact duration" (not "Duration of impact")', async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-active.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card.is-open');
    await page.locator('.incident-card.is-open').click();
    const labels = await page.locator('.detail-label').allTextContents();
    expect(labels.some(l => l.includes('Impact duration'))).toBe(true);
    expect(labels.every(l => !l.includes('Duration of impact'))).toBe(true);
  });
});

// ── Resolved incidents ────────────────────────────────────────────────────────

test.describe('Resolved incidents', () => {
  test.beforeEach(async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-resolved.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card.is-closed');
  });

  test('T14 — resolved incidents appear in "History" section', async ({ page }) => {
    await expect(page.locator('#incidents .incident-card.is-closed')).toBeVisible();
  });

  test('T15 — resolved incidents are grouped by day with a heading', async ({ page }) => {
    await expect(page.locator('.incident-day').first()).toBeVisible();
    const text = await page.locator('.incident-day').first().textContent();
    expect(text).toMatch(/[A-Z][a-z]+day/); // e.g. "Saturday"
  });

  test('T16 — two incidents from the same calendar day share one group heading', async ({ page }) => {
    // Both fixtures are from 2026-05-09
    expect(await page.locator('.incident-group').count()).toBe(1);
    expect(await page.locator('.incident-group .incident-card').count()).toBe(2);
  });

  test('T17 — resolved card has green left border', async ({ page }) => {
    const borderColor = await page.locator('.incident-card.is-closed').first()
      .evaluate(el => getComputedStyle(el).borderLeftColor);
    expect(borderColor).toBe('rgb(118, 173, 42)');
  });

  test('T18 — resolved badge says "Resolved"', async ({ page }) => {
    await expect(page.locator('.badge-resolved').first()).toContainText('Resolved');
  });
});

// ── Incident card expand/collapse ─────────────────────────────────────────────

test.describe('Incident card expand/collapse', () => {
  test.beforeEach(async ({ page }) => {
    await mockIssues(page, FIXTURE('github-issues-resolved.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card.is-closed');
  });

  test('T19 — clicking a card expands its details', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    await expect(card.locator('.card-details')).toBeVisible();
  });

  test('T20 — clicking an expanded card collapses it', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    await card.click();
    await expect(card.locator('.card-details')).toBeHidden();
  });

  test('T21 — chevron gets "open" class when card is expanded', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    await expect(card.locator('.chevron')).toHaveClass(/open/);
  });

  test('T22 — chevron loses "open" class when card is collapsed', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    await card.click();
    await expect(card.locator('.chevron')).not.toHaveClass(/open/);
  });

  test('T23 — expanded resolved card shows "Degradation detected" label', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    const labels = await card.locator('.detail-label').allTextContents();
    expect(labels.some(l => l.includes('Degradation detected'))).toBe(true);
  });

  test('T24 — expanded resolved card shows "Service restored" label', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    const labels = await card.locator('.detail-label').allTextContents();
    expect(labels.some(l => l.includes('Service restored'))).toBe(true);
  });

  test('T25 — expanded resolved card shows "Duration of impact" label', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    const labels = await card.locator('.detail-label').allTextContents();
    expect(labels.some(l => l.includes('Duration of impact'))).toBe(true);
  });

  test('T26 — details text never contains "went down" or "came back up"', async ({ page }) => {
    const card = page.locator('.incident-card.is-closed').first();
    await card.click();
    const text = await card.locator('.card-details').textContent();
    expect(text).not.toContain('went down');
    expect(text).not.toContain('came back up');
  });
});

// ── Service name extraction ───────────────────────────────────────────────────

test.describe('Service name extraction from issue title', () => {
  async function loadWithTitle(page, title, state = 'closed') {
    const issue = [{
      id: 9001, number: 99, title, state,
      created_at: '2026-05-09T10:00:00Z',
      closed_at: state === 'closed' ? '2026-05-09T11:00:00Z' : null,
      labels: [],
    }];
    await mockIssues(page, JSON.stringify(issue));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card');
  }

  test('T27 — "X is down (200 in ...)" → card shows only "X"', async ({ page }) => {
    await loadWithTitle(page, '🟥 Salaaz Marketplace is down (200 in 0ms)');
    await expect(page.locator('.card-service').first()).toHaveText('Salaaz Marketplace');
  });

  test('T28 — "X is degraded" → card shows only "X"', async ({ page }) => {
    await loadWithTitle(page, '🟨 Vendor Portal is degraded');
    await expect(page.locator('.card-service').first()).toHaveText('Vendor Portal');
  });

  test('T29 — "X has degraded performance" → card shows only "X"', async ({ page }) => {
    await loadWithTitle(page, 'Ethics Dashboard has degraded performance');
    await expect(page.locator('.card-service').first()).toHaveText('Ethics Dashboard');
  });

  test('T30 — leading emoji is stripped from displayed name', async ({ page }) => {
    await loadWithTitle(page, '🟥 Salaaz Marketplace is down');
    const text = await page.locator('.card-service').first().textContent();
    expect(text).not.toMatch(/🟥/);
    expect((text ?? '').trim()).toBe('Salaaz Marketplace');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('Error handling', () => {
  test('T31 — shows "Could not load incident history." on API failure', async ({ page }) => {
    await page.route('**/repos/Dino-Dan/salaaz-status/issues**', route => route.abort('failed'));
    await page.goto(PAGE);
    await page.waitForSelector('.no-incidents');
    await expect(page.locator('#incidents')).toContainText('Could not load incident history.');
  });

  test('T32 — no uncaught JS errors during a normal load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await mockIssues(page, FIXTURE('github-issues-resolved.json'));
    await page.goto(PAGE);
    await page.waitForSelector('.incident-card.is-closed');
    expect(errors).toHaveLength(0);
  });
});
