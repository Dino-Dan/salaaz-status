// Functional (not just HTTP) checks against production.
//
// Why this exists: on 2026-08-26 the storefront served HTTP 200 for ~30 minutes
// while showing no products, and nothing noticed. Every monitor we had was
// satisfied — nginx's `try_files ... /index.html` returns 200 for any path, so a
// status-code check on the frontend proves almost nothing, and the /health/ ping
// was hitting that same SPA shell rather than Django.
//
// The assertions below look at the DATA, which is the only thing that actually
// distinguishes a working catalog from an empty one.
//
// Every endpoint here is anonymous and side-effect-free. Endpoints that write an
// AnalyticsEvent/ProductView row per request are deliberately excluded — see
// CHECKS below — because at a 1-minute cadence they would add ~1,440 synthetic
// rows/day and skew the `demand` signal in discovery ranking.

const DEFAULT_ORIGIN = 'https://salaaz.com';
const DEFAULT_TIMEOUT_MS = 15000;

/** Thrown for a non-2xx, a timeout, or a body that isn't the JSON we expect. */
export class CheckError extends Error {}

/**
 * Every check is `{ id, path, assert }` where `assert(body)` throws CheckError
 * with a human-readable reason, or returns a short detail string on success.
 * Keeping them pure makes each one testable offline against a fixture — inline
 * shell in a workflow is not.
 */
export const CHECKS = [
  {
    id: 'products',
    path: '/api/shared/get_products/',
    critical: true,
    // THE incident check. Every public product read funnels through
    // Product.objects.approved_listing() — seven AND-ed conditions across three
    // tables — so a migration that backfills any one column wrongly empties the
    // catalog while every status code stays 200. Note the endpoint uses
    // CursorPagination: there is no `count` field, so the array is the only signal.
    assert(body) {
      if (!body || !Array.isArray(body.results)) {
        throw new CheckError('response has no results[] array');
      }
      if (body.results.length === 0) {
        throw new CheckError('catalog is EMPTY — get_products returned 0 products');
      }
      const p = body.results[0];
      if (p.price === null || p.price === undefined) {
        throw new CheckError(`first product "${p.name ?? p.id}" has no price`);
      }
      if (!Array.isArray(p.variants) || p.variants.length === 0) {
        throw new CheckError(`first product "${p.name ?? p.id}" has no variants`);
      }
      return `${body.results.length} products`;
    },
  },
  {
    id: 'categories',
    // No trailing slash — /api/shared/categories/ is not the route.
    path: '/api/shared/categories',
    critical: true,
    assert(body) {
      if (!Array.isArray(body)) throw new CheckError('response is not an array');
      if (body.length === 0) throw new CheckError('category taxonomy is EMPTY');
      const subs = body[0] && body[0].subcategories;
      if (!Array.isArray(subs) || subs.length === 0) {
        throw new CheckError(`first category "${body[0]?.name}" has no subcategories`);
      }
      return `${body.length} categories`;
    },
  },
  {
    id: 'certifications',
    path: '/api/shared/certifications/',
    critical: false,
    // Derived from the same approved_listing() gate as `products`, but by a
    // different query. If products fails and this passes, the fault is narrower
    // than the whole gate — the disagreement localises it.
    assert(body) {
      const c = body && body.certifications;
      if (!Array.isArray(c)) throw new CheckError('no certifications[] array');
      if (c.length === 0) throw new CheckError('certifications list is EMPTY');
      return `${c.length} certifications`;
    },
  },
  {
    id: 'discovery',
    path: '/api/shared/discovery/',
    critical: false,
    assert(body) {
      const selects = (body && body.selects) || [];
      const trending = (body && body.trending) || [];
      if (!Array.isArray(selects) || !Array.isArray(trending)) {
        throw new CheckError('discovery payload missing selects/trending arrays');
      }
      if (selects.length + trending.length === 0) {
        throw new CheckError('both discovery rails are EMPTY');
      }
      return `${selects.length} selects, ${trending.length} trending`;
    },
  },
  {
    id: 'search',
    path: '/api/products/search?q=a',
    critical: false,
    assert(body) {
      if (!body || !Array.isArray(body.products)) {
        throw new CheckError('search response has no products[] array');
      }
      return `${body.products.length} results`;
    },
  },
  {
    id: 'authed-route-responsive',
    path: '/api/customers/me',
    critical: false,
    expectStatus: 401,
    // Named for what it actually proves. An earlier draft called this a Clerk
    // liveness probe, which it is NOT: /api/customers/me returns an identical
    // 401 in ~0.09s with or without a Bearer token, because the Clerk auth class
    // returns None rather than raising — Clerk is never consulted. What this DOES
    // catch is the authed-route-wedge class (SLZ-473), where authenticated routes
    // hang or 5xx while public routes keep returning 200.
    headers: { Authorization: 'Bearer synthetic-monitor-probe' },
    assert() {
      return '401 as expected';
    },
  },
];

/** Fetch + parse, converting every failure mode into a CheckError. */
export async function probe(check, { origin = DEFAULT_ORIGIN, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const url = `${origin}${check.path}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'SalaazStatusBot/1.0', ...(check.headers || {}) },
    });
  } catch (err) {
    throw new CheckError(err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : `request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const ms = Date.now() - started;

  if (check.expectStatus) {
    if (res.status !== check.expectStatus) {
      throw new CheckError(`expected HTTP ${check.expectStatus}, got ${res.status}`);
    }
    return { detail: check.assert(), ms };
  }

  if (!res.ok) throw new CheckError(`HTTP ${res.status}`);

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // The single most likely production failure: nginx serving the SPA shell
    // because the API route stopped resolving. Say so explicitly rather than
    // reporting an opaque parse error.
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(text);
    throw new CheckError(
      looksLikeHtml
        ? 'got HTML instead of JSON (API route not resolving — nginx served the SPA shell?)'
        : `response was not JSON: ${text.slice(0, 80)}`,
    );
  }

  return { detail: check.assert(body), ms };
}

/**
 * Run every check. Never throws — a thrown check becomes `{ok:false, error}` so
 * one broken endpoint still lets the others report.
 */
export async function runChecks(opts = {}) {
  const checks = opts.checks || CHECKS;
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        const { detail, ms } = await probe(check, opts);
        return { id: check.id, ok: true, critical: !!check.critical, detail, ms };
      } catch (err) {
        return { id: check.id, ok: false, critical: !!check.critical, error: err.message, ms: null };
      }
    }),
  );
  return summarize(results);
}

/** Consecutive failed runs before the PUBLIC status page is allowed to say "degraded". */
export const PUBLIC_DEGRADE_THRESHOLD = 2;

/**
 * Fold a run's report into the persisted per-service state.
 *
 * The asymmetry is deliberate. The internal alert fires on the first confirmed
 * failure, but `publicDegraded` needs two consecutive runs, because on
 * 2026-08-24 a broken Stallion check published a false "degraded" for 36h — it
 * could not tell "the thing is unhealthy" from "we could not tell". You get told
 * fast; customers only see a claim we have corroborated.
 *
 * Recovery is immediate in both directions: one good run clears everything.
 */
export function updateState(prev, report, nowIso, slug = 'salaaz-marketplace') {
  const previous = (prev && prev[slug]) || {};
  const consecutiveFailures = report.healthy ? 0 : (previous.consecutiveFailures || 0) + 1;

  return {
    ...prev,
    [slug]: {
      status: report.healthy ? 'up' : 'degraded',
      consecutiveFailures,
      publicDegraded: consecutiveFailures >= PUBLIC_DEGRADE_THRESHOLD,
      failing: report.failing,
      detail: report.summary,
      lastUpdated: nowIso,
    },
  };
}

/**
 * A failure of ANY check means degraded — `critical` only shapes the message, so
 * a non-critical regression can't be silently tolerated.
 */
export function summarize(results) {
  const failed = results.filter((r) => !r.ok);
  return {
    healthy: failed.length === 0,
    failing: failed.map((r) => r.id),
    critical: failed.some((r) => r.critical),
    summary: failed.length
      ? failed.map((r) => `${r.id}: ${r.error}`).join('; ')
      : results.map((r) => `${r.id} ok (${r.detail})`).join('; '),
    results,
  };
}
