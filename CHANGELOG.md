# Changelog

All incidents and maintenance events for Salaaz services are recorded here.

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
