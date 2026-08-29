import { describe, it, expect, vi } from 'vitest';
import { runWithRetry, summarize, DEFAULT_RETRY_DELAY_MS } from '../../scripts/render-lib.mjs';

// This is the policy that decides whether anyone gets paged for a blank
// storefront, so it is tested against a fake checker rather than a real browser.
// sleepFn is injected so the suite never actually waits 30 seconds.

const nap = () => Promise.resolve();

/** Fake checker returning the given sequence of ok/fail verdicts. */
function checker(...sequence) {
  let i = 0;
  const fn = vi.fn(async () => {
    const ok = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    return ok ? { ok: true, detail: 'rendered' } : { ok: false, detail: '0 product cards' };
  });
  return fn;
}

describe('runWithRetry', () => {
  it('R01 — a healthy site passes and is checked exactly once (never pays the delay)', async () => {
    const fn = checker(true);
    const r = await runWithRetry(fn, { sleepFn: nap });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('R02 — two consecutive failures report degraded', async () => {
    const fn = checker(false, false);
    const r = await runWithRetry(fn, { sleepFn: nap });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
    expect(r.transient).toBe(false);
    expect(r.detail).toContain('0 product cards');
  });

  it('R03 — fail then pass is treated as a transient blip, not an outage', async () => {
    const fn = checker(false, true);
    const r = await runWithRetry(fn, { sleepFn: nap });
    expect(r.ok).toBe(true);
    expect(r.transient).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('R04 — never retries more than once (a real outage is not retried forever)', async () => {
    const fn = checker(false, false, false);
    await runWithRetry(fn, { sleepFn: nap });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('R05 — waits the configured delay between attempts', async () => {
    const sleepFn = vi.fn(async () => {});
    await runWithRetry(checker(false, false), { retryDelayMs: 1234, sleepFn });
    expect(sleepFn).toHaveBeenCalledWith(1234);
  });

  it('R06 — announces the retry so a run log explains itself', async () => {
    const onRetry = vi.fn();
    await runWithRetry(checker(false, true), { retryDelayMs: 42, sleepFn: nap, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][1]).toBe(42);
  });

  it('R07 — does not announce a retry when the first attempt passes', async () => {
    const onRetry = vi.fn();
    await runWithRetry(checker(true), { sleepFn: nap, onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('R08 — reports the SECOND attempt detail, which is the current truth', async () => {
    let i = 0;
    const fn = async () => (i++ === 0
      ? { ok: false, detail: 'first failure' }
      : { ok: false, detail: 'second failure' });
    const r = await runWithRetry(fn, { sleepFn: nap });
    expect(r.detail).toBe('second failure');
  });

  it('R09 — a checker that throws propagates rather than being read as healthy', async () => {
    // Fail-loud: swallowing this would report a green site while the check is broken.
    const boom = async () => { throw new Error('browser crashed'); };
    await expect(runWithRetry(boom, { sleepFn: nap })).rejects.toThrow('browser crashed');
  });

  it('R10 — default delay is 30s (changing it is a deliberate policy change)', () => {
    expect(DEFAULT_RETRY_DELAY_MS).toBe(30000);
  });
});

describe('summarize', () => {
  it('R11 — all pages healthy is ok, and lists what was seen', () => {
    const s = summarize([{ ok: true, detail: 'home: 14 cards' }, { ok: true, detail: 'all: 20 cards' }]);
    expect(s.ok).toBe(true);
    expect(s.detail).toBe('home: 14 cards; all: 20 cards');
  });

  it('R12 — one failing page fails the site', () => {
    const s = summarize([{ ok: true, detail: 'home: 14 cards' }, { ok: false, detail: 'all: 0 cards' }]);
    expect(s.ok).toBe(false);
  });

  it('R13 — when anything fails, only the failures are reported (signal, not noise)', () => {
    const s = summarize([{ ok: true, detail: 'home: 14 cards' }, { ok: false, detail: 'all: 0 cards' }]);
    expect(s.detail).toBe('all: 0 cards');
    expect(s.detail).not.toContain('home');
  });

  it('R14 — an empty result set is ok rather than a crash', () => {
    expect(summarize([]).ok).toBe(true);
  });
});
