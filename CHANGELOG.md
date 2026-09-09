# Changelog

All incidents and maintenance events for Salaaz services are recorded here.

---

## September 8, 2026 (policy)

### Public noise floor raised from 5 to 10 minutes
**Services:** All (display policy only)  
**Status:** Resolved

- Owner decision, prompted by the Sept 1 8-minute Salaaz Marketplace incident: outages under
  10 minutes should not appear on the public status page at all — not in Past Incidents, not on
  the 90-day uptime bar, not in the feed/API. Previously the floor was 5 minutes.
- `isQualifyingIncident()`'s duration check moved from `>= 5 * 60 * 1000` to `>= 10 * 60 * 1000` in
  all three places it's defined (`scripts/incidents-lib.mjs`, `status-page/index.html`,
  `status-page/incidents.html`), plus the matching numeric fallback in `dayStatus()` (used only
  when `incidents.json` fails to load).
- The GitHub issue for a sub-10-minute incident still gets created, closed, and alerted internally
  (Discord) exactly as before — this only changes what `status.salaaz.com` displays.
- The Sept 1 8-minute incident (and any other already-recorded sub-10-minute incident) now simply
  disappears from the public page, rather than needing to be recolored — this is expected, not a
  data-loss bug.
- Pinned in `tests/unit/feed.test.js` (3 new boundary cases) and `tests/unit/index-helpers.test.js`
  (T13/T14 moved to the new 9/10-minute boundary).

---

## September 8, 2026

### 90-day bar chart could show a day "Operational" despite a real incident on record for it
**Services:** Salaaz Marketplace (display only — the underlying incident history was always correct)  
**Status:** Resolved

- Reported: the incidents list showed a Salaaz Marketplace outage on September 1
  (8 minutes), but that day's bar on the uptime chart rendered green
  ("Operational").
- Cause: Upptime writes `dailyMinutesDown` keyed by UTC date, while
  `status-page/index.html` deliberately buckets the bar chart and the Past
  Incidents list by the viewer's LOCAL date (see the September 1/2 backfill
  fix below, which patched one occurrence of this by hand). The incident ran
  03:12–03:20 UTC on Sep 2 — 23:12–23:20 EDT on Sep 1 for a North American
  viewer — so it qualified as a Sep 1 incident everywhere except the one place
  that mattered: `dailyMinutesDown["2026-09-01"]` didn't exist, and `dayStatus`
  returned "up" the instant it saw no minutes for that key, before ever
  consulting the precise incident data.
- This was a recurring bug class, not a one-off: the September 1/2 fix
  (`3131f904`) only re-keyed that single incident's JSON entry by hand.
  `dayStatus` now checks the exact per-incident minute data FIRST whenever it's
  available (built from real `created_at`/`closed_at` deltas, bucketed by the
  same local date as everything else on the page) — a qualifying day is never
  "up" just because Upptime's UTC-keyed dict missed it, and a day with no
  qualifying incident is never "degraded" off Upptime's own rounding. No more
  manual re-keying needed for future incidents that straddle the UTC/local
  boundary.
- Pinned in `tests/unit/index-helpers.test.js` (2 new regression cases).

---

## September 6, 2026

### False "Salaaz Marketplace is down" — authed-route probe misread a 429 as an outage
**Services:** Salaaz Marketplace (public status only — the site itself was healthy throughout)  
**Status:** Resolved

- `authed-route-responsive` (`GET /api/customers/me`, part of the synthetic API
  checks) started getting `429` instead of the expected `401`. The probe rides a
  shared egress IP (GitHub Actions / cron-job.org), which occasionally trips the
  backend's per-IP rate limit on traffic that isn't the monitor's own — a fast
  `429` still proves the route is alive and answering, which is all this check
  exists to verify.
- Every other synthetic check (products, categories, certifications, discovery,
  search) stayed healthy the whole time — this matched what manual checks of
  salaaz.com showed.
- `scripts/synthetic-checks.mjs` now accepts `401` or `429` on this probe; only a
  hang or 5xx still fails it (the actual authed-route-wedge failure mode, SLZ-473,
  this check exists to catch).
- Closed the false public incident and its internal counterpart automatically on
  the next healthy run — no manual issue action needed.

---

## July 29, 2026

### Status Page Deployment — Removed the Stock Template Clobber
**Services:** None (status page infrastructure)  
**Status:** Resolved a recurring status-page display issue

- Changes to the custom status page now deploy automatically. A new
  `deploy-status-page.yml` workflow publishes `status-page/` to `gh-pages` on
  every push, and is the only workflow that writes to that branch.
- Removed `site.yml`, which built Upptime's stock Sapper site and published it
  over the custom design. It was triggered externally, so the daily clobber
  could not be stopped by changing schedules in the repo.
- This was causing status.salaaz.com to serve the generic Upptime template for
  18 minutes to 3 hours 39 minutes each day, until `design-guard.yml` noticed
  and restored the custom pages. Those windows are now gone.
- `design-guard.yml` is unchanged and stays as a watchdog. It should no longer
  fire in normal operation — if its Discord alert appears, something unexpected
  overwrote `gh-pages`.
- No monitoring, check, or alert configuration was touched.

---

## July 28, 2026

### Public Status Page Now Lists Customer-Facing Services Only
**Services:** Salaaz Marketplace, Vendor Portal  
**Status:** No service impact

- The status page and incidents page now list only customer-facing services. Internal tooling is no longer shown.
- Monitoring itself is unchanged — internal services are still checked every 5 minutes and still raise internal alerts. This is a display change only; no check, schedule, or alert route was modified.
- Services hidden from the page are also excluded from the overall status banner, so a purely internal issue no longer changes what customers see.
- Driven by `HIDDEN_SLUGS` / `HIDDEN_SERVICE_NAMES` in `status-page/index.html` and `status-page/incidents.html`; filtering happens before any per-service data is fetched.

---

## May 19, 2026

### API Dependency Check — Replaced ECI ping with django-health-check
**Services:** Salaaz Marketplace  
**Status:** No service impact

- The "API" dependency badge under the Salaaz Marketplace card now reflects the health of the Django backend's main components rather than a single ECI infrastructure ping.
- `eci-status.yml` was updated to poll `https://salaaz.com/health/` (django-health-check) instead of `https://salaaz.com/api/shared/status/eci/`. The endpoint returns `200` only when PostgreSQL, pending migrations, MongoDB, and Redis/RQ are all healthy.
- A degraded badge now means at least one backend component is unhealthy, not just that the ECI container is unreachable.

---

## May 14, 2026

### Dependency Status Panel
**Services:** Salaaz Marketplace  
**Status:** No service impact

- Added third-party dependency badges under the Salaaz Marketplace card: Shipping (Stallion Express), Payments (Square), API (Alibaba ECI)
- Provider outages show amber — red is reserved for Salaaz's own services being unreachable
- ECI status is polled every 5 minutes by a GitHub Actions workflow and written to `history/alibaba-ecs-status.json`

---

## May 8, 2026

### Infrastructure Updates
**Status:** No service impact

- Removed GitHub's built-in schedule triggers from all workflows — cron-job.org now handles all scheduling reliably
- Fixed a brief UI reversion during status page deploys; custom pages are now baked into the deployment atomically
- Disabled Upptime's auto-update workflows (`updates.yml`, `update-template.yml`) to prevent workflow customisations from being overwritten
- Incidents page now expands inline on click to show when a service went down, when it recovered, and total downtime — no redirect to GitHub

---

## May 7, 2026

### Monitoring Launched
**Services:** Salaaz Marketplace, Vendor Portal, Ethics Dashboard  
**Status:** Operational

Upptime monitoring went live for all three Salaaz services. Baseline response
times: Webstore ~154 ms, Vendor Portal ~136 ms, Ethics Dashboard ~144 ms.

---

*To report an issue, [open a GitHub Issue](https://github.com/Dino-Dan/salaaz-status/issues/new).*
