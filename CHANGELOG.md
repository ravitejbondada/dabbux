# DabbuX — Changelog

Format: `[version] YYYY-MM-DD — summary`
Files listed are the ones modified. Always update this on any meaningful change.

---

## [v2.1] 2026-05-29 — Project renamed to DabbuX

**What changed:** Renamed the project from "Trex" to "DabbuX — Personal Finance Made Personal". Replaced canvas-generated favicon with a static `assets/icon.png`.

**Files modified:**
- `index.html` — updated `<title>`, `apple-mobile-web-app-title` meta, PWA manifest name/short_name/icon, header app name + tagline, lock screen title. Replaced dynamic `<link id="dynamicFavicon">` and `<link id="dynamicAppleIcon">` with static `<link rel="icon">` and `<link rel="apple-touch-icon">` pointing to `assets/icon.png`
- `js/core.js` — `generateDynamicIcons()` should be removed or left as a no-op; favicon is now static
- `README.md` — updated title, project folder name, added `assets/` to project structure
- `ARCHITECTURE.md` — updated title
- `FUNCTIONS.md` — updated title; marked `generateDynamicIcons()` as deprecated
- `CHANGELOG.md` — updated title and added this entry

**Migration notes:**
- The `assets/` directory must exist at the project root with `icon.png` inside it
- `generateDynamicIcons()` in `core.js` can be safely removed; no other code depends on it

---

## [v2.0] 2026-05-29 — Option B module split

**What changed:** Broke the monolithic `Trex_v2_0.html` (8,191 lines) into 12 focused files.

**Files created:**
- `index.html` — HTML shell only, loads CSS and JS modules
- `styles.css` — all CSS extracted from inline `<style>` block
- `js/core.js` — state, boot, routing, persistence, utilities
- `js/auth.js` — PIN lock/unlock, biometrics, PIN change
- `js/dashboard.js` — budget widgets, heatmap, quick logs, alerts, charts
- `js/transactions.js` — expense form, ledger, history filter
- `js/reports.js` — Chart.js renderers, report modes, MoM comparison
- `js/settings.js` — settings form, categories/payments CRUD, CC billing logic
- `js/credit-cards.js` — card view renderer, card analytics chart
- `js/recurring.js` — recurring expenses, EMI engine, date utilities
- `js/goals-trips.js` — saving goals, trip budgets, trip expenses, ledger sync
- `js/backup.js` — JSON/CSV export & import, state restore
- `README.md`, `ARCHITECTURE.md`, `FUNCTIONS.md`, `CHANGELOG.md`

**No logic changed** — pure structural refactor. All 226 functions preserved verbatim.

---

## [v2.0] 2026-05-28 — DabbuX v2.0 single-file release

Original feature-complete single-file app (`Trex_v2_0.html`).

**Features in this version:**
- Budget cycle engine (salary-day or calendar-month cycles)
- Add / edit / delete transactions with category + payment tagging
- Ledger view with date range filter, search, and category/payment filter
- Analytics reports: doughnut charts, bar charts, budget gauge
- Month-over-month comparison report
- Accordion itemized report list
- Credit card mode with billing cycle tracking and due/recent views
- Card-level spend analytics chart
- Recurring expenses with daily/weekly/monthly/yearly frequencies
- EMI engine with amortization schedule preview
- Saving goals with contribution history
- Trip budgets with pre-trip and on-trip expense tracking
- Trip → ledger sync
- Quick log 1-tap buttons (customizable)
- Spending heatmap calendar
- End-of-cycle forecast card
- Budget alerts (browser notifications)
- Daily reminder notifications
- PIN lock screen with biometric simulation
- Light / dark theme toggle
- JSON and CSV backup / restore
- PWA installable (manifest + meta tags)
- Multi-currency support (INR, USD, EUR, GBP)

---

## How to Write a Changelog Entry

```
## [v2.1] YYYY-MM-DD — short description of change

**What changed:** One sentence.

**Files modified:**
- `js/goals-trips.js` — added X function, changed Y behaviour
- `js/core.js` — added Z field to state

**Migration notes (if any):**
- State key `androidWalletState_v4` is still compatible / bumped to v5
```
