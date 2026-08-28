import { describe, it, expect } from 'vitest';
import { CHECKS, CheckError, probe, runChecks, summarize, updateState, hasMeaningfulChange, PUBLIC_DEGRADE_THRESHOLD } from '../../scripts/synthetic-checks.mjs';

// These import the real module the workflow runs, so a regression here fails the
// build rather than passing against a stale copy.

const byId = (id) => CHECKS.find((c) => c.id === id);

/** Minimal stand-in for fetch. `body` may be an object (serialised) or a raw string. */
function stubFetch({ status = 200, body = {}, delayMs = 0, throws = null } = {}) {
  return async (_url, opts = {}) => {
    if (throws) {
      const err = new Error(throws === 'abort' ? 'aborted' : throws);
      if (throws === 'abort') err.name = 'AbortError';
      throw err;
    }
    if (delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
}

const run = (check, stub, opts = {}) => probe(check, { fetchImpl: stub, ...opts });

// ── The incident ─────────────────────────────────────────────────────────────

describe('products check — the 2026-08-26 regression', () => {
  const product = { id: 1, name: 'Test', price: 19.99, variants: [{ id: 9 }] };

  it('S01 — passes on a healthy catalog', async () => {
    const r = await run(byId('products'), stubFetch({ body: { next: null, previous: null, results: [product] } }));
    expect(r.detail).toBe('1 products');
  });

  it('S02 — FAILS on an empty catalog (HTTP 200, results: []) — this is the incident', async () => {
    await expect(run(byId('products'), stubFetch({ body: { next: null, previous: null, results: [] } })))
      .rejects.toThrow(/catalog is EMPTY/);
  });

  it('S03 — fails when the first product has no price', async () => {
    const broken = { ...product, price: null };
    await expect(run(byId('products'), stubFetch({ body: { results: [broken] } })))
      .rejects.toThrow(/has no price/);
  });

  it('S04 — fails when the first product has no variants', async () => {
    const broken = { ...product, variants: [] };
    await expect(run(byId('products'), stubFetch({ body: { results: [broken] } })))
      .rejects.toThrow(/has no variants/);
  });

  it('S05 — fails when results[] is missing entirely', async () => {
    await expect(run(byId('products'), stubFetch({ body: { detail: 'nope' } })))
      .rejects.toThrow(/no results\[\] array/);
  });

  it('S06 — does not rely on a `count` field (endpoint is cursor-paginated)', async () => {
    // A count-based assertion would wrongly pass here; the array is the signal.
    const r = await run(byId('products'), stubFetch({ body: { count: 500, results: [product] } }));
    expect(r.detail).toBe('1 products');
  });
});

// ── Transport-level failures ─────────────────────────────────────────────────

describe('transport failures', () => {
  it('S07 — HTML instead of JSON is reported as the SPA-shell case', async () => {
    await expect(run(byId('products'), stubFetch({ body: '<!DOCTYPE html><html><body>' })))
      .rejects.toThrow(/HTML instead of JSON/);
  });

  it('S08 — non-2xx is a failure', async () => {
    await expect(run(byId('products'), stubFetch({ status: 502, body: 'bad gateway' })))
      .rejects.toThrow(/HTTP 502/);
  });

  it('S09 — a timeout is a failure, not a hang', async () => {
    await expect(run(byId('products'), stubFetch({ delayMs: 500 }), { timeoutMs: 50 }))
      .rejects.toThrow(/timed out after 50ms/);
  });

  it('S10 — a network error is a failure', async () => {
    await expect(run(byId('products'), stubFetch({ throws: 'ECONNREFUSED' })))
      .rejects.toThrow(/request failed/);
  });

  it('S11 — non-JSON, non-HTML garbage is reported with a snippet', async () => {
    await expect(run(byId('products'), stubFetch({ body: 'upstream connect error' })))
      .rejects.toThrow(/was not JSON: upstream connect error/);
  });
});

// ── Remaining checks ─────────────────────────────────────────────────────────

describe('categories', () => {
  it('S12 — passes with subcategories present', async () => {
    const r = await run(byId('categories'), stubFetch({ body: [{ name: 'Home', subcategories: [{ id: 1 }] }] }));
    expect(r.detail).toBe('1 categories');
  });

  it('S13 — fails on an empty taxonomy', async () => {
    await expect(run(byId('categories'), stubFetch({ body: [] }))).rejects.toThrow(/taxonomy is EMPTY/);
  });

  it('S14 — fails when a category has no subcategories', async () => {
    await expect(run(byId('categories'), stubFetch({ body: [{ name: 'Home', subcategories: [] }] })))
      .rejects.toThrow(/has no subcategories/);
  });
});

describe('certifications / discovery / search', () => {
  it('S15 — certifications passes when non-empty', async () => {
    const r = await run(byId('certifications'), stubFetch({ body: { certifications: ['Fair Trade'] } }));
    expect(r.detail).toBe('1 certifications');
  });

  it('S16 — certifications fails when empty (same approved_listing gate as products)', async () => {
    await expect(run(byId('certifications'), stubFetch({ body: { certifications: [] } })))
      .rejects.toThrow(/certifications list is EMPTY/);
  });

  it('S17 — discovery passes when either rail has content', async () => {
    const r = await run(byId('discovery'), stubFetch({ body: { selects: [], trending: [{ id: 1 }] } }));
    expect(r.detail).toBe('0 selects, 1 trending');
  });

  it('S18 — discovery fails when both rails are empty', async () => {
    await expect(run(byId('discovery'), stubFetch({ body: { selects: [], trending: [] } })))
      .rejects.toThrow(/both discovery rails are EMPTY/);
  });

  it('S19 — search passes on an empty result set (0 hits is valid)', async () => {
    const r = await run(byId('search'), stubFetch({ body: { products: [] } }));
    expect(r.detail).toBe('0 results');
  });

  it('S20 — search fails when the array is missing', async () => {
    await expect(run(byId('search'), stubFetch({ body: {} }))).rejects.toThrow(/no products\[\] array/);
  });
});

describe('authed-route-responsive', () => {
  it('S21 — passes on the expected 401', async () => {
    const r = await run(byId('authed-route-responsive'), stubFetch({ status: 401, body: { detail: 'no creds' } }));
    expect(r.detail).toBe('401 as expected');
  });

  it('S22 — fails on 5xx (the authed-route-wedge case this exists to catch)', async () => {
    await expect(run(byId('authed-route-responsive'), stubFetch({ status: 502, body: 'bad gateway' })))
      .rejects.toThrow(/expected HTTP 401, got 502/);
  });

  it('S23 — fails if the route starts returning 200 (auth silently bypassed)', async () => {
    await expect(run(byId('authed-route-responsive'), stubFetch({ status: 200, body: { id: 1 } })))
      .rejects.toThrow(/expected HTTP 401, got 200/);
  });

  it('S24 — fails on a hang', async () => {
    await expect(run(byId('authed-route-responsive'), stubFetch({ status: 401, delayMs: 500 }), { timeoutMs: 50 }))
      .rejects.toThrow(/timed out/);
  });
});

// ── Aggregation ──────────────────────────────────────────────────────────────

describe('summarize / runChecks', () => {
  it('S25 — healthy when everything passes', () => {
    const s = summarize([{ id: 'a', ok: true, detail: '1 products' }, { id: 'b', ok: true, detail: 'ok' }]);
    expect(s.healthy).toBe(true);
    expect(s.failing).toEqual([]);
  });

  it('S26 — a single non-critical failure still marks the run degraded', () => {
    const s = summarize([{ id: 'a', ok: true, detail: 'ok' }, { id: 'b', ok: false, critical: false, error: 'boom' }]);
    expect(s.healthy).toBe(false);
    expect(s.failing).toEqual(['b']);
    expect(s.critical).toBe(false);
  });

  it('S27 — flags criticality when a critical check fails', () => {
    const s = summarize([{ id: 'products', ok: false, critical: true, error: 'catalog is EMPTY' }]);
    expect(s.critical).toBe(true);
    expect(s.summary).toContain('catalog is EMPTY');
  });

  it('S28 — one failing endpoint does not prevent the others reporting', async () => {
    let n = 0;
    const flaky = async (_url, opts) => {
      // First call (products) blows up; the rest return something parseable.
      if (n++ === 0) throw new Error('ECONNREFUSED');
      return { ok: true, status: 200, text: async () => JSON.stringify({ results: [], certifications: [], selects: [], trending: [], products: [] }) };
    };
    const report = await runChecks({ fetchImpl: flaky, checks: CHECKS.slice(0, 3) });
    expect(report.healthy).toBe(false);
    expect(report.results).toHaveLength(3);
    expect(report.results.every((r) => 'ok' in r)).toBe(true);
  });

  it('S29 — runChecks never throws, even when every check fails', async () => {
    const dead = async () => { throw new Error('network is down'); };
    const report = await runChecks({ fetchImpl: dead });
    expect(report.healthy).toBe(false);
    expect(report.failing).toEqual(CHECKS.map((c) => c.id));
  });
});

// ── Public-degrade counter ───────────────────────────────────────────────────
//
// This governs what customers are told, so it gets the most careful coverage.
// The Stallion bug on 2026-08-24 published a false "degraded" for 36h; the
// two-run threshold exists to make that harder to repeat.

describe('updateState', () => {
  const NOW = '2026-08-27T12:00:00.000Z';
  const healthy = { healthy: true, failing: [], summary: 'all ok' };
  const broken = { healthy: false, failing: ['products'], summary: 'products: catalog is EMPTY' };
  const of = (state) => state['salaaz-marketplace'];

  it('S33 — first failure alerts but does NOT go public', () => {
    const s = of(updateState({}, broken, NOW));
    expect(s.status).toBe('degraded');
    expect(s.consecutiveFailures).toBe(1);
    expect(s.publicDegraded).toBe(false);
  });

  it('S34 — second consecutive failure goes public', () => {
    const first = updateState({}, broken, NOW);
    const s = of(updateState(first, broken, NOW));
    expect(s.consecutiveFailures).toBe(2);
    expect(s.publicDegraded).toBe(true);
  });

  it('S35 — a single good run clears everything immediately', () => {
    let st = updateState({}, broken, NOW);
    st = updateState(st, broken, NOW);
    expect(of(st).publicDegraded).toBe(true);
    const s = of(updateState(st, healthy, NOW));
    expect(s.status).toBe('up');
    expect(s.consecutiveFailures).toBe(0);
    expect(s.publicDegraded).toBe(false);
  });

  it('S36 — alternating fail/pass never reaches the public threshold', () => {
    let st = {};
    for (const r of [broken, healthy, broken, healthy, broken]) st = updateState(st, r, NOW);
    expect(of(st).consecutiveFailures).toBe(1);
    expect(of(st).publicDegraded).toBe(false);
  });

  it('S37 — the counter keeps climbing during a sustained outage', () => {
    let st = {};
    for (let i = 0; i < 5; i++) st = updateState(st, broken, NOW);
    expect(of(st).consecutiveFailures).toBe(5);
    expect(of(st).publicDegraded).toBe(true);
  });

  it('S38 — records which checks failed and why', () => {
    const s = of(updateState({}, broken, NOW));
    expect(s.failing).toEqual(['products']);
    expect(s.detail).toContain('catalog is EMPTY');
    expect(s.lastUpdated).toBe(NOW);
  });

  it('S39 — leaves other services in the state file untouched', () => {
    const prev = { 'vendor-portal': { status: 'up', consecutiveFailures: 0 } };
    const next = updateState(prev, broken, NOW);
    expect(next['vendor-portal']).toEqual({ status: 'up', consecutiveFailures: 0 });
    expect(next['salaaz-marketplace'].status).toBe('degraded');
  });

  it('S40 — supports a per-slug counter for other services', () => {
    const next = updateState({}, broken, NOW, 'vendor-portal');
    expect(next['vendor-portal'].status).toBe('degraded');
    expect(next['salaaz-marketplace']).toBeUndefined();
  });

  it('S41 — threshold is 2 (changing it is a deliberate policy change)', () => {
    expect(PUBLIC_DEGRADE_THRESHOLD).toBe(2);
  });
});

describe('check catalogue', () => {
  it('S30 — excludes every endpoint that writes an analytics row per request', () => {
    // PDP views feed the `demand` signal in discovery ranking; a monitor pinning
    // one would push it up Trending. Category/vendor listings write AnalyticsEvent.
    const forbidden = ['/api/shared/product/', '/products/category/', '/products/subcategory/',
      '/get_vendors_list', '/get_vendor_store', '/get_vendor_details'];
    for (const check of CHECKS) {
      for (const bad of forbidden) {
        expect(check.path.includes(bad), `${check.id} must not hit ${bad}`).toBe(false);
      }
    }
  });

  it('S31 — does not use /health/, which returns the SPA shell for any path', () => {
    expect(CHECKS.some((c) => c.path.includes('/health'))).toBe(false);
  });

  it('S32 — categories has no trailing slash (the route is defined without one)', () => {
    expect(byId('categories').path).toBe('/api/shared/categories');
  });
});

// ── Commit suppression ───────────────────────────────────────────────────────
//
// The first deployment committed on every run. At a 1-2 minute cadence that is
// ~720 commits/day and it kept the repo write-locked, which made the workflow
// cancel its own queued runs. Only meaningful transitions may write.

describe('hasMeaningfulChange', () => {
  const NOW = '2026-08-28T00:00:00.000Z';
  const LATER = '2026-08-28T00:02:00.000Z';
  const healthy = { healthy: true, failing: [], summary: 'all ok' };
  const broken = { healthy: false, failing: ['products'], summary: 'products: catalog is EMPTY' };

  it('S42 — a steady-healthy heartbeat is NOT a change (no commit)', () => {
    const a = updateState({}, healthy, NOW);
    const b = updateState(a, healthy, LATER);
    expect(hasMeaningfulChange(a, b)).toBe(false);
  });

  it('S43 — up -> degraded IS a change', () => {
    const a = updateState({}, healthy, NOW);
    const b = updateState(a, broken, LATER);
    expect(hasMeaningfulChange(a, b)).toBe(true);
  });

  it('S44 — degraded -> up IS a change', () => {
    const a = updateState({}, broken, NOW);
    const b = updateState(a, healthy, LATER);
    expect(hasMeaningfulChange(a, b)).toBe(true);
  });

  it('S45 — the counter advancing IS a change (it drives publicDegraded)', () => {
    const a = updateState({}, broken, NOW);
    const b = updateState(a, broken, LATER);
    expect(hasMeaningfulChange(a, b)).toBe(true);
  });

  it('S46 — a different set of failing checks IS a change', () => {
    const a = updateState({}, broken, NOW);
    const other = { healthy: false, failing: ['categories'], summary: 'categories: EMPTY' };
    // Same consecutiveFailures would tie; the failing list must still register.
    const b = updateState({}, other, LATER);
    expect(hasMeaningfulChange(a, b)).toBe(true);
  });

  it('S47 — an empty previous state counts as a change (first ever run)', () => {
    expect(hasMeaningfulChange({}, updateState({}, healthy, NOW))).toBe(true);
  });
});
