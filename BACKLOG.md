# Backlog Upgrades — Salaaz Status Page

---

## 1. Navigation

- **Subscribe / Get notified button in nav.** Every major status page (Statuspage, Instatus, Betteruptime) has a subscribe CTA as a primary nav action — email or webhook subscription to incident alerts.
- **GitHub link in nav.** Remove dependency on Upptime's navbar config and make the link explicit in the custom page.

---

## 2. Status Banner

- **Pulsing/animated dot for non-operational states.** A pulsing red or amber dot visually communicates "live, active problem" vs. a static dot which looks like a snapshot.
- **"Partial outage" as a distinct fourth state.** Currently collapses into "down". Some endpoints up, some down should have its own banner state and label.
- **Scheduled maintenance banner.** A separate yellow/blue state: "Scheduled maintenance on May 15 from 02:00–04:00 UTC" shown ahead of planned downtime windows.
- **Link from banner to the relevant active incident.** The "We are investigating the issue" sub-text should be a clickable link to the active incident on the incidents page.

---

## 3. Last Checked Timestamp

- **Auto-refresh every 5 minutes** matching the Upptime check interval, with a subtle "Refreshing…" indicator so users know the page is live.
- **"Next check in X:XX" countdown** to set expectations on when the status will next update.

---

## 4. Service Cards

- **Service name as a clickable link** to the actual service URL, opening in a new tab.
- **Live response time from YAML** instead of (or alongside) the historical average from `summary.json`. The YAML `responseTime` field is always current.
- **"Monitored since [date]" on each card** so users understand how long the uptime data covers.
- **Component-level status expand panel.** Already built and commented out — re-enable once per-component monitoring is wired up in Upptime. Sub-components (Auth, Checkout, Search, etc.) are defined in the code.

---

## 5. Bar Chart

- **Click a bar to navigate to `incidents.html`** filtered to that date, so users can drill into what happened on a specific day.
- **Response time overlay as a secondary layer.** A thin line on top of the bars showing average response time per day. Statuspage and Betteruptime both surface this, giving a richer view of degradation even when below the down threshold.
- **Tooltip improvement for gray bars.** Currently says "No data". Should say "Monitoring started [date] — no data before this" to explain the gap to new visitors.

---

## 6. Uptime Percentage

- **Multiple time window display: 7d · 30d · 90d.** Statuspage shows all three inline on each service card, giving a more complete picture of reliability trends.
- **SLA target indicator.** A subtle "Target: 99.9%" with a green checkmark or amber warning depending on whether the current 90-day figure meets the target.
- **Historical uptime calendar view.** A GitHub-style heatmap by month showing uptime over the past year — gives investors, partners, and power users a long-term reliability view.

---

## 7. Past Incidents Section (main page)

- **Limit to last 14 days** with a "No incidents in the past 14 days" empty state. This is the Statuspage convention and sets a clear, reassuring window.
- **Colour-coded dot by incident type.** Red dot for hard outages, amber for degradations — matching the bar chart colour language.
- **Show incident body/description.** If Upptime or a team member adds update comments to the GitHub issue, surface a summary line under the service name.

---

## 8. Footer

- **Link to main `salaaz.com`** website.
- **Link to support / contact** for users affected by an incident.
- **Subscribe to updates link** as a secondary entry point alongside the nav button.

---

## 9. Incidents Page (`incidents.html`)

- **Filter bar: filter by service, date range, and status** (active / resolved). Essential once there are many incidents.
- **Search bar** to find incidents by service name or keyword.
- **Pagination / "Load more"** for history beyond the current 100-issue cap.
- **Incident detail / permalink page.** Currently there is no way to deep-link to a specific incident. Each incident should have a shareable URL.
- **RSS / Atom feed link** (`/feed.xml`). Power users and ops teams subscribe to incident feeds as a standard integration.
- **Subscribe button on the page** itself as a secondary CTA.
- **Incident update timeline inside expanded cards.** If Upptime or a team member posts update comments to the GitHub issue, surface them as a chronological timeline (Investigating → Identified → Monitoring → Resolved) rather than just the open/close timestamps.

---

## 10. SEO & Meta

- **`<meta name="description">`** on both pages. Suggested: "Live uptime and incident history for all Salaaz services."
- **Open Graph tags** (`og:title`, `og:description`, `og:image`) so the page previews correctly when shared on Slack, Teams, or social media.
- **`<link rel="canonical">`** pointing to `https://status.salaaz.com/` to prevent duplicate content if GitHub Pages serves the page under multiple URLs.

---

## 11. Accessibility

- **`aria-label` on each bar** describing its status: `"May 10: Operational"`, `"May 9: Degraded — 5 minutes down"`. Makes the bar chart usable for screen reader users.
- **Keyboard navigation for incident cards.** `tabindex="0"` and `keydown` (Enter/Space) handlers so the expand/collapse works without a mouse.
- **Non-colour status indicators on service cards.** A small icon alongside the coloured tag (e.g. ✓ for Operational, ⚠ for Degraded, ✕ for Down) so status is not conveyed by colour alone.
- **`prefers-reduced-motion` media query** to disable the shimmer skeleton animation for users who have motion sensitivity settings enabled.

---

*Total backlog items: 37 across 11 sections*
