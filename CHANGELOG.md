# Changelog

All incidents and maintenance events for Salaaz services are recorded here.

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
