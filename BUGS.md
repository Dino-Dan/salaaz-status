# Bug Fixes — Salaaz Status Page

---

## 2. Status Banner

- **"We are investigating the issue" is hardcoded and never updates.** When a service is down, the sub-text is a static string. It should link to the active incident on the incidents page, or at minimum state when the incident started.
- **Mixed down + degraded state is ignored.** If 1 service is down and another is degraded, the banner shows "1 Service Down" with no mention of the degraded service. The degraded condition is silently dropped.
- **Status dot is static.** Live incident state (down/degraded) should use a pulsing animated dot. A static dot looks like old/stale data rather than an active live problem.

---

## 3. Last Checked Timestamp

~~**"Last checked" shows page load time, not actual check time.** The code uses `new Date()` (right now) but Upptime checks every 5 minutes. A user loading the page 4 minutes after the last check sees an incorrect timestamp. The YAML files contain a `lastUpdated` field — that should be used instead. Label should also read "Last updated" not "Last checked" since the page is not doing the checking.~~

**Fixed 2026-05-19** — `index.html` now picks the most recent `lastUpdated` from `yamlData` and falls back to `new Date()` only when no YAML timestamp is available. Label already reads "Last updated". T43 updated to match; T44 added to assert the YAML timestamp is used.

---

## 4. Service Cards

- **Response time shown when service is down.** `service.time` from `summary.json` is a historical average. When a service is currently down, showing "193 ms avg" is misleading. Should show `—` or be hidden entirely during an active incident.
- **`setUTCDate` called on a local date object.** In `renderCard`, the 90-day loop does:
  ```js
  const d = new Date(today); // local midnight
  d.setUTCDate(d.getUTCDate() - i); // UTC methods on a local date
  ```
  In timezones ahead of UTC (e.g. UTC+5, Pakistan), `localToday()` returns local midnight which is UTC-yesterday. `getUTCDate()` returns the previous day's date, shifting the entire bar chart one day. Fix: use `d.setDate(d.getDate() - i)`.
- **Favicon broken layout on failure.** `onerror="this.style.display='none'"` hides the icon but leaves a gap in the flex layout. Should use a fallback SVG placeholder or the layout should gracefully collapse.

---

## 5. Bar Chart

- **Tooltip for live incidents shows no start time.** "Incident in progress" is all it says. Should include when the incident started, e.g. "Incident in progress since 2:14 PM".
- **Live downtime not included in uptime calculation.** When `todayBar.live = true`, `todayBar.mins` stays at 0. The uptime percentage does not account for the ongoing incident's elapsed time, making the number optimistically wrong during live outages.
- **Gray "no data" bars have no tooltip explanation.** The bar chart renders gray bars for days before monitoring started, but the tooltip only says "No data" with no explanation. New visitors do not know if gray means "never monitored", "data missing", or "no incidents".

---

## 6. Uptime Percentage

- **No rounding guard.** If `downMins` is ever negative due to data corruption, the uptime percentage would exceed 100%. Should clamp: `Math.min(100, Math.max(0, ...))`.

---

## 7. Past Incidents Section (main page)

- **Fetches all closed issues, not just incident ones.** The API call has no label filter — any closed GitHub issue (e.g. a manually filed feature request) would appear as a past incident. Should add `&labels=status` to match what `incidents.html` uses.
- **Sorted by `updated`, not `created`.** A re-opened and re-closed old incident bubbles to the top regardless of when it originally happened. Should sort by `created` descending.
- **Incident dot is always green regardless of incident type.** An outage (hard down) and a degradation look identical. Should be red for outages and amber for degradations.
- **No time window limit.** Shows any of the last 10 closed issues — could surface a year-old incident if few have occurred. Industry standard is "incidents in the last 14 days" with a clean empty state if none exist.
- **GitHub API called unauthenticated.** Rate limit is 60 requests/hour per IP. Not a problem today with low traffic, but will silently break under load.

---

## 8. Color Legend

- **Legend is positioned below Past Incidents.** It describes the bar charts (which are much higher up the page) but sits at the very bottom after the incidents list. A user scrolling down sees the incidents section before they understand what the bar colours mean. Should be moved to immediately below the service cards.

---

## 9. Incidents Page (`incidents.html`)

- **`dayKey()` uses 0-indexed month.** `d.getMonth()` returns 0–11, not 1–12. May incidents get key `2026-04-DD` instead of `2026-05-DD`. Grouping still works coincidentally, but the keys are wrong and would break any date-based logic or sorting added later. Fix: `String(d.getMonth() + 1).padStart(2,'0')`.
- **Active incident cards show only a time, no date.** The "Active Incidents" section is not grouped by day, so the card only shows "10:30 AM EDT" with no date context. An incident that started 3 days ago has no date visible without expanding the card.
- **No nav links.** The nav on `incidents.html` only has the brand. Should be consistent with `index.html` — at minimum a link back to Status and an active "Incidents" indicator.
- **Fetches up to 100 issues with no pagination.** If there are ever more than 100 incidents, older ones are silently dropped with no indication to the user.
- **`&labels=status` filter may return nothing.** Upptime creates issues with the label `status: down` (with colon and space). Whether the plain `status` label filter matches depends on whether Upptime also applies a plain `status` label. This should be verified — if it does not match, the incidents page always shows empty.

---

## 10. SEO & Meta

- **No `<meta name="description">` on either page.** Search engines show a blank snippet.
- **No Open Graph tags.** Sharing `status.salaaz.com` on Slack or social media shows no preview title, description, or image — appears as a broken link.

---

## 11. Accessibility

- **Bar chart is inaccessible to screen readers.** Each `<div class="bar">` has no `aria-label`, `role`, or text content. A screen reader user encounters 90 anonymous unlabelled divs.
- **Tooltip is mouse-only.** There is no keyboard focus equivalent — tabbing to a bar does nothing. WCAG requires keyboard accessibility for all interactive elements.
- **Clickable incident cards are `<div>` elements, not `<button>`.** Screen readers do not announce them as interactive. Should have `role="button"` and `tabindex="0"` with `keydown` (Enter/Space) handlers.
- **Status conveyed by colour alone.** Red/amber/green bars with no secondary indicator (icon, pattern, text) fail WCAG 1.4.1 for colourblind users.

---

*Total bugs: 30 across 11 sections*
