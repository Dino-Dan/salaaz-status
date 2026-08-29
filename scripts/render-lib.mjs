// Retry orchestration for the browser render checks.
//
// Deliberately in its own module with NO playwright import: the Tests workflow
// installs only @playwright/test, so a unit test importing render-check.mjs
// (which imports the `playwright` driver at top level) would fail in CI.
//
// Keeping this pure also means the retry policy — the part that decides whether
// anyone gets paged — is testable against a fake checker instead of a real site.

/** Wait for the deploy asset-swap window to pass before believing a failure. */
export const DEFAULT_RETRY_DELAY_MS = 30000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `checkFn` once; on failure wait and run it a second time, and only report
 * a failure if BOTH attempts fail.
 *
 * Why: webstore deploys ship per-commit image tags with no blue/green, and nginx
 * serves index.html as no-cache while hashed assets are immutable — so a browser
 * landing mid-deploy can genuinely see a broken page for a few seconds. The API
 * tier uses the same pattern (scripts/run-synthetic.mjs), and a live dry run
 * there hit a spurious `fetch failed` against a perfectly healthy site.
 *
 * A healthy site never pays the delay: `checkFn` runs exactly once.
 *
 * @param checkFn async () => ({ ok: boolean, detail: string })
 * @returns { ok, detail, attempts, transient } — `transient` marks a first
 *          failure that the retry cleared, which is worth logging but not paging.
 */
export async function runWithRetry(checkFn, { retryDelayMs = DEFAULT_RETRY_DELAY_MS, onRetry = () => {}, sleepFn = sleep } = {}) {
  const first = await checkFn();
  if (first.ok) return { ...first, attempts: 1, transient: false };

  onRetry(first, retryDelayMs);
  await sleepFn(retryDelayMs);
  const second = await checkFn();

  if (second.ok) {
    // Recovered on its own — a deploy window or a blip, not an outage.
    return { ...second, attempts: 2, transient: true };
  }
  return { ...second, attempts: 2, transient: false };
}

/** Collapse per-page results into the single verdict the workflow consumes. */
export function summarize(results) {
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    detail: (failed.length ? failed : results).map((r) => r.detail).join('; '),
  };
}
