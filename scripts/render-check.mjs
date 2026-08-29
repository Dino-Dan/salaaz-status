// Browser render checks for the three production sites.
//
//   node scripts/render-check.mjs <site>     # marketplace | vendor | ethics
//
// Replaces the inline Playwright heredocs that used to live in vendor-smoke.yml
// and ethics-smoke.yml (byte-identical clones, each asserting only that SOME
// <form> was visible — a page could be entirely broken and still pass).
//
// Selectors below were verified against live production, not assumed. Note that
// none of the three apps carry data-testid on critical elements (one occurrence
// across all of webstore/src, and it is a Jest mock), so BEM classes are the
// only stable hooks available.
//
// Exit 0 = healthy, 1 = degraded, 2 = the check itself broke.

import { chromium } from 'playwright';
import { runWithRetry, summarize } from './render-lib.mjs';

const NAV_TIMEOUT = 45000;
const SELECTOR_TIMEOUT = 30000; // measured load is 7-9s; leave generous headroom

const SITES = {
  marketplace: {
    name: 'Salaaz Marketplace',
    pages: [
      {
        url: 'https://salaaz.com/en/',
        // Counting cards is the assertion, NOT "no error element". Home.tsx
        // renders empty section shells when the catalog is empty — no error,
        // no message. During the 2026-08-26 incident an error-only check
        // would have passed.
        expect: { minCards: 1, absent: '.home-error' },
      },
      {
        url: 'https://salaaz.com/en/products/all',
        // AllProductsPage.tsx renders .all-products__empty ONLY when a search
        // query is present. results:[] with no ?q= yields a silently empty
        // grid, indistinguishable from healthy except by counting.
        expect: { minCards: 1, absent: '.all-products__error' },
      },
    ],
  },
  vendor: {
    name: 'Vendor Portal',
    pages: [
      {
        url: 'https://vendor.salaaz.com/',
        // Tighter than the old "first <form> is visible" — asserts the actual
        // login inputs the app ships.
        expect: { present: 'input[name="email"], #signin-email' },
      },
    ],
  },
  ethics: {
    name: 'Ethics Dashboard',
    pages: [
      {
        url: 'https://ethics.salaaz.com/',
        expect: { present: 'input[name="identifier"], input[name="password"], form' },
      },
    ],
  },
};

const CARD_SELECTOR = '.salaaz-card, .salaaz-card-responsive';

async function checkPage(browser, page_) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 120)));

  try {
    await page.goto(page_.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    if (page_.expect.minCards) {
      try {
        await page.waitForSelector(CARD_SELECTOR, { timeout: SELECTOR_TIMEOUT });
      } catch {
        // Fall through — count below produces the actionable message.
      }
      const cards = await page.locator(CARD_SELECTOR).count();
      if (cards < page_.expect.minCards) {
        const hasErr = page_.expect.absent
          ? await page.locator(page_.expect.absent).count() > 0
          : false;
        return {
          ok: false,
          detail: hasErr
            ? `${page_.url} rendered its error state (${page_.expect.absent})`
            : `${page_.url} rendered ${cards} product cards (expected >= ${page_.expect.minCards}) — catalog empty or failing to load`,
        };
      }
      if (page_.expect.absent && (await page.locator(page_.expect.absent).count()) > 0) {
        return { ok: false, detail: `${page_.url} shows ${page_.expect.absent}` };
      }
      return { ok: true, detail: `${page_.url}: ${cards} cards` };
    }

    if (page_.expect.present) {
      try {
        await page.waitForSelector(page_.expect.present, { timeout: SELECTOR_TIMEOUT, state: 'visible' });
      } catch {
        return { ok: false, detail: `${page_.url}: expected element not visible (${page_.expect.present})` };
      }
      return { ok: true, detail: `${page_.url}: rendered` };
    }

    return { ok: true, detail: `${page_.url}: loaded` };
  } catch (err) {
    return { ok: false, detail: `${page_.url}: ${String(err.message || err).split('\n')[0].slice(0, 140)}` };
  } finally {
    if (pageErrors.length) console.log(`  (page errors: ${pageErrors.slice(0, 2).join(' | ')})`);
    await page.close();
  }
}

const key = process.argv[2];
const site = SITES[key];
if (!site) {
  console.error(`Unknown site "${key}". Expected one of: ${Object.keys(SITES).join(', ')}`);
  process.exit(2);
}

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(`Could not launch a browser: ${err.message}`);
  process.exit(2);
}

// Check every page of the site, then collapse to one verdict. Wrapped in the
// retry so a deploy asset-swap window doesn't page anyone.
async function checkSiteOnce() {
  const results = [];
  for (const p of site.pages) results.push(await checkPage(browser, p));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.detail}`);
  return summarize(results);
}

const retryDelayMs = Number(process.env.RENDER_RETRY_DELAY_MS ?? 30000);

const verdict = await runWithRetry(checkSiteOnce, {
  retryDelayMs,
  onRetry: (first, ms) =>
    console.log(`\nFailed: ${first.detail}\nRe-checking in ${ms}ms before concluding (deploy windows and blips are real).`),
});

await browser.close();

if (verdict.transient) {
  console.log('\nSecond attempt passed — treating the first as a transient blip. No alert.');
}

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('fs');
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `healthy=${verdict.ok}\ndetail=${verdict.detail.replace(/\n/g, ' ')}\nattempts=${verdict.attempts}\n`,
  );
}

console.log(verdict.ok ? `\n${site.name} renders correctly.` : `\nDEGRADED: ${verdict.detail}`);
process.exit(verdict.ok ? 0 : 1);
