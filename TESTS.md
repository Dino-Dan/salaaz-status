# Salaaz Status Page — Test Suite

## Running the tests

```bash
# Install dependencies (first time only)
npm install
npx playwright install chromium

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# Both
npm test

# E2E with interactive UI
npm run test:e2e:ui
```

All network requests are mocked — no live GitHub calls are made.

---

## File structure

```
tests/
  fixtures/               Mock data used by all tests
  unit/                   Pure-function unit tests (Vitest, no browser)
  e2e/                    Full-page E2E tests (Playwright, Chromium)
TESTS.md                  This file
playwright.config.js
vitest.config.js
package.json
```

---

## Unit tests — `tests/unit/index-helpers.test.js`

Tests the pure utility functions from `status-page/index.html`.

| ID  | Function | What it checks |
|-----|----------|----------------|
| T01 | `localDateStr` | Formats a date object as `YYYY-MM-DD` |
| T02 | `localDateStr` | Zero-pads a single-digit month |
| T03 | `localDateStr` | Zero-pads a single-digit day |
| T04 | `localDateStr` | Uses local date components, not UTC |
| T05 | `localDateStr` | Handles December (month 11 → `"12"`) correctly |
| T06 | `localToday` | Returns a date with hours/minutes/seconds all zeroed |
| T07 | `localToday` | Matches the current local year, month, and day |
| T08 | `dayStatus` | Returns `"nodata"` for a date strictly before `startDate` |
| T09 | `dayStatus` | Returns `"nodata"` when `startDate` is `null` |
| T10 | `dayStatus` | Returns `"nodata"` when `startDate` is `undefined` |
| T11 | `dayStatus` | Returns `"up"` on the exact `startDate` with 0 minutes down |
| T12 | `dayStatus` | Returns `"up"` when the `dailyMinutesDown` entry is explicitly `0` |
| T13 | `dayStatus` | Returns `"degraded"` when exactly 1 minute is down |
| T14 | `dayStatus` | Returns `"degraded"` at 719 minutes (just below the outage threshold) |
| T15 | `dayStatus` | Returns `"down"` at exactly 720 minutes (the half-day threshold) |
| T16 | `dayStatus` | Returns `"down"` at 1440 minutes (full day) |
| T17 | `dayStatus` | Returns `"up"` when the date is not present in `dailyMinutesDown` |
| T18 | `barColor` | `"up"` → `#76AD2A` (green) |
| T19 | `barColor` | `"degraded"` → `#FAA72A` (amber) |
| T20 | `barColor` | `"down"` → `#E04343` (red) |
| T21 | `barColor` | `"nodata"` → `#D1D0C9` (grey) |
| T22 | `barLabel` | `"nodata"` tooltip contains `"No data"` |
| T23 | `barLabel` | `"up"` tooltip contains `"Operational"` |
| T24 | `barLabel` | `"degraded"` tooltip contains `"Degraded"` and the minute count |
| T25 | `barLabel` | `"down"` tooltip contains `"Outage"` and the minute count |
| T26 | `barLabel` | Tooltip includes the human-formatted date (e.g. `"May 10, 2026"`) |
| T27 | `formatDisplay` | `"2026-05-10"` → `"May 10, 2026"` |
| T28 | `formatDisplay` | `"2026-01-01"` → `"Jan 1, 2026"` |
| T29 | `formatDisplay` | `"2026-12-25"` → `"Dec 25, 2026"` |

---

## Unit tests — `tests/unit/incidents-helpers.test.js`

Tests the pure utility functions from `status-page/incidents.html`.

| ID  | Function | What it checks |
|-----|----------|----------------|
| T01 | `duration` | 0 seconds → `"0s"` |
| T02 | `duration` | 45 seconds → `"45s"` |
| T03 | `duration` | 59 seconds → `"59s"` |
| T04 | `duration` | Exactly 60 seconds → `"1m"` |
| T05 | `duration` | 90 seconds → `"1m 30s"` |
| T06 | `duration` | Exactly 60 minutes → `"1h"` |
| T07 | `duration` | 61 minutes → `"1h 1m"` |
| T08 | `duration` | 90 minutes → `"1h 30m"` |
| T09 | `duration` | 2 hours → `"2h"` |
| T10 | `serviceName` | Strips `" is down (status in ...)"` from title |
| T11 | `serviceName` | Strips `" is degraded"` from title |
| T12 | `serviceName` | Strips `" has degraded performance"` from title |
| T13 | `serviceName` | Strips leading `🟥` emoji |
| T14 | `serviceName` | Strips leading `🟨` emoji |
| T15 | `serviceName` | Suffix matching is case-insensitive (`IS DOWN` works) |
| T16 | `serviceName` | Returns untouched name when no known suffix is present |
| T17 | `serviceName` | Handles multi-word service names correctly |
| T18 | `statusCode` | Extracts `"200"` from `"(200 in 0ms)"` |
| T19 | `statusCode` | Extracts `"503"` from `"(503 in 12ms)"` |
| T20 | `statusCode` | Returns `null` when no status code pattern is present |
| T21 | `statusCode` | Returns `null` for an empty string |
| T22 | `statusCode` | Returns `null` when a number exists but isn't followed by `" in"` |

---

## E2E tests — `tests/e2e/index.spec.js`

Full-page tests for `status-page/index.html`. All GitHub raw requests are mocked.

### Page structure

| ID  | What it checks |
|-----|----------------|
| T01 | Page `<title>` is `"Salaaz Status"` |
| T02 | `<html lang="en">` is set |
| T03 | Nav brand shows `"Salaaz Status"` |
| T04 | Footer shows `"© 2026 Salaaz"` |
| T05 | `"Services"` section label is present |
| T06 | Color legend contains all four entries: Operational, Degraded, Outage, No data |

### Loading states

| ID  | What it checks |
|-----|----------------|
| T07 | Skeleton cards are visible immediately before data arrives (network held back) |
| T08 | Skeletons are replaced by real service cards after a successful load |

### Status banner

| ID  | What it checks |
|-----|----------------|
| T09 | All services up → `"All Systems Operational"` with green dot |
| T10 | One service down → `"1 Service Down"` (singular) with red dot |
| T11 | Two services down → `"2 Services Down"` (plural) |
| T12 | One service degraded → `"Some Systems Degraded"` with amber dot |

### Service cards

| ID  | What it checks |
|-----|----------------|
| T13 | Exactly 3 service cards are rendered |
| T14 | All three expected services are present by name |
| T15 | An `"up"` service displays a green `"Operational"` tag |
| T16 | A `"down"` service displays a red `"Down"` tag |
| T17 | A `"degraded"` service displays an amber `"Degraded"` tag |
| T18 | Each card shows the service hostname (not the full URL) |
| T19 | Each card shows response time in `ms` and a `%` uptime figure |
| T20 | No Components panel is rendered (the feature is commented out) |

### Bar chart

| ID  | What it checks |
|-----|----------------|
| T21 | Each bar strip contains exactly 90 bars |
| T22 | Bar legend shows `"90 days ago"` on the left and `"Today"` on the right |
| T23 | Bars before `startDate` are grey (`#D1D0C9` / `rgb(209, 208, 201)`) |
| T24 | An operational day bar is green (`#76AD2A`) |
| T25 | A degraded day bar (1–719 min down) is amber (`#FAA72A`) |
| T26 | An outage day bar (≥720 min down) is red (`#E04343`) |
| T27 | Hovering a bar makes the tooltip visible |
| T28 | Tooltip for an operational bar contains `"Operational"` |
| T29 | Tooltip for today's bar contains the current month name |
| T30 | Moving the mouse off a bar hides the tooltip |

### Uptime calculation

| ID  | What it checks |
|-----|----------------|
| T31 | Service with no downtime shows `"100.00%"` |
| T32 | 1 full day (1440 min) outage in 90 monitored days → `"98.89%"` |
| T33 | Days before `startDate` are excluded from the denominator (recent start → still 100%) |
| T34 | Future `startDate` (no monitored days at all) → `"N/A"` |

### YAML status override (false-positive prevention)

| ID  | What it checks |
|-----|----------------|
| T35 | YAML says `"down"` but `summary.json` says `"up"` → card shows `"Down"` |
| T36 | YAML says `"up"` but `summary.json` says `"down"` → card shows `"Operational"` |
| T37 | Banner reflects YAML status, not the stale `summary.json` status |
| T38 | Only the overridden service changes; the other two cards are unaffected |

### Error handling

| ID  | What it checks |
|-----|----------------|
| T39 | `summary.json` fetch failure → error banner with `"Could not load status data"` and `"Please refresh the page."` |
| T40 | On fetch error the `#services` container is empty (no cards rendered) |
| T41 | All YAML fetches fail → page still renders 3 cards using `summary.json` status |
| T42 | No uncaught JS errors during a normal successful load |

### Last-checked timestamp

| ID  | What it checks |
|-----|----------------|
| T43 | `#last-checked` is populated after load and starts with `"Last checked:"` |

### Accessibility

| ID  | What it checks |
|-----|----------------|
| T44 | `<meta name="viewport">` contains `width=device-width` |
| T45 | Nav logo has an `alt` attribute |
| T46 | All `.service-icon` images have an `alt` attribute |

### Responsive layout

| ID  | What it checks |
|-----|----------------|
| T47 | Page is usable at 375 px wide (cards and banner are visible) |
| T48 | No horizontal scroll at 375 px wide |

---

## E2E tests — `tests/e2e/incidents.spec.js`

Full-page tests for `status-page/incidents.html`. All GitHub API requests are mocked.

### Page structure

| ID  | What it checks |
|-----|----------------|
| T01 | Page `<title>` is `"Incidents — Salaaz Status"` |
| T02 | `<html lang="en">` is set |
| T03 | Page heading says `"All Incidents"` |
| T04 | Back link is present, labelled `"← Back to Status"`, and href is `"/"` |
| T05 | Nav brand shows `"Salaaz Status"` |

### Empty states

| ID  | What it checks |
|-----|----------------|
| T06 | No issues at all → `"No incidents recorded yet."` |
| T07 | Only open issues, no closed ones → `"No resolved incidents yet."` |

### Active incidents section

| ID  | What it checks |
|-----|----------------|
| T08 | Section is hidden (`display: none`) when there are no open issues |
| T09 | Section becomes visible when at least one open issue exists |
| T10 | Section label reads `"Active Incidents"` |
| T11 | Active incident card has a red left border (`#E04343`) |
| T12 | Active badge text is `"Active"` — never `"Ongoing"` |
| T13 | Expanded active card shows `"Impact duration"` row — not `"Duration of impact"` |

### Resolved incidents

| ID  | What it checks |
|-----|----------------|
| T14 | Resolved incidents appear inside `#incidents` |
| T15 | Each group has a day heading (e.g. `"Saturday, May 9, 2026"`) |
| T16 | Two issues from the same calendar day are placed under one heading, not two |
| T17 | Resolved card has a green left border (`#76AD2A`) |
| T18 | Resolved badge text is `"Resolved"` |

### Incident card expand/collapse

| ID  | What it checks |
|-----|----------------|
| T19 | Clicking a card expands its detail rows |
| T20 | Clicking an already-expanded card collapses it |
| T21 | Chevron receives the `"open"` CSS class when expanded |
| T22 | Chevron loses the `"open"` class when collapsed |
| T23 | Expanded resolved card has a `"Degradation detected"` detail label |
| T24 | Expanded resolved card has a `"Service restored"` detail label |
| T25 | Expanded resolved card has a `"Duration of impact"` detail label |
| T26 | Detail text never contains `"went down"` or `"came back up"` |

### Service name extraction

| ID  | What it checks |
|-----|----------------|
| T27 | `"🟥 Salaaz Marketplace is down (200 in 0ms)"` → displayed name is `"Salaaz Marketplace"` |
| T28 | `"🟨 Vendor Portal is degraded"` → displayed name is `"Vendor Portal"` |
| T29 | `"Ethics Dashboard has degraded performance"` → displayed name is `"Ethics Dashboard"` |
| T30 | Leading emoji is stripped from the displayed service name |

### Error handling

| ID  | What it checks |
|-----|----------------|
| T31 | GitHub API failure → `"Could not load incident history."` shown in `#incidents` |
| T32 | No uncaught JS errors during a normal successful load |
