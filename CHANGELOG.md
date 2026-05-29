# DabbuX — Changelog

Format: `[version] YYYY-MM-DD — summary`
Files listed are the ones modified. Always update this on any meaningful change.

---

## [v2.2] 2026-05-29 — Clean onboarding and empty state handling for new users

**What changed:** Removed all dummy/mock transactions, mock saving goals, mock quick logs, and specific credit card defaults to ensure a clean slate onboarding experience for new users. Added robust empty state views, budget placeholder guidance, and safety checks for default payment references.

**Files modified:**
- [core.js](file:///c:/VS_Code/dabbux/js/core.js) — cleared active/historical mock transactions, mock goals; reset budget defaults to 0 and cycle type/day to calendar-first defaults; simplified category and payment seeding.
- [dashboard.js](file:///c:/VS_Code/dabbux/js/dashboard.js) — added prompt to set monthly budget if 0; hid forecast card if no budget/spend exists; cleared default quick logs array.
- [reports.js](file:///c:/VS_Code/dabbux/js/reports.js) — added empty state verification and fallbacks for report charts and month-over-month view when transactions are empty.
- [settings.js](file:///c:/VS_Code/dabbux/js/settings.js) — added budget field placeholder.
- [transactions.js](file:///c:/VS_Code/dabbux/js/transactions.js) — added check to ensure referenced default payment method exists and is not archived before applying to category transaction forms.
- [README.md](file:///c:/VS_Code/dabbux/README.md) — updated data persistence section to remove mock transactions reference.
- [ARCHITECTURE.md](file:///c:/VS_Code/dabbux/ARCHITECTURE.md) — updated state object template with new default onboarding values.

---

## [v2.1.1] 2026-05-29 — Fixed PWA manifest and optimized icon rendering

**What changed:** Replaced embedded PWA manifest data URI with external `manifest.json` file. Removed stale base64-encoded images from HTML. Added CSS optimizations for crisp icon rendering and white background removal.

**Files modified:**
- `index.html` — removed two embedded base64 image data URIs (header logo line 39, lock screen logo line 68); updated `<link rel="manifest">` to point to external `manifest.json` instead of data URI
- `manifest.json` — created new external PWA manifest file (replaces embedded data URI in HTML)
- `styles.css` — added high-quality icon rendering rules: `image-rendering: crisp-edges`, `image-rendering: pixelated`, `mix-blend-mode: multiply` for white background removal
- `assets/favicon.png` — replaced with new transparent icon (3D golden coin with green checkmark, no white background)

**What this fixes:**
- ✅ PWA icon no longer cached incorrectly (manifest now externally versioned)
- ✅ Favicon renders crisp/pixel-perfect (no more blur/interpolation artifacts)
- ✅ White background removed from icon display
- ✅ Reduced HTML file size (removed large base64 strings)
- ✅ Better cross-browser icon compatibility

**Migration notes:**
- Ensure `manifest.json` exists at project root alongside `index.html`
- Ensure `assets/favicon.png` is the transparent version (1.7MB+)
- Clear browser cache and hard refresh (Ctrl+Shift+R) to see changes

---

## [v2.1] 2026-05-29 — Project renamed to DabbuX; deployed to GitHub Pages

**What changed:** Renamed the project from "Trex" to "DabbuX — Personal Finance Made Personal". Replaced canvas-generated favicon with a static `assets/icon.png`. Deployed to GitHub Pages.

**Live URL:** https://ravitejbondada.github.io/dabbux/
**Repository:** https://github.com/ravitejbondada/dabbux

**Files modified:**
- `index.html` — updated `<title>`, `apple-mobile-web-app-title` meta, PWA manifest name/short_name/icon, header app name + tagline, lock screen title. Replaced dynamic `<link id="dynamicFavicon">` and `<link id="dynamicAppleIcon">` with static `<link rel="icon">` and `<link rel="apple-touch-icon">` pointing to `assets/icon.png`
- `js/core.js` — updated file header; removed `generateDynamicIcons()` function and its call from `window.onload`; favicon is now static
- `README.md` — updated title, added live URL and repo link, project folder name, added `assets/` to project structure
- `ARCHITECTURE.md` — updated title
- `FUNCTIONS.md` — updated title; marked `generateDynamicIcons()` as deprecated
- `CHANGELOG.md` — updated title and added this entry

**Migration notes:**
- The `assets/` directory must exist at the project root with `icon.png` inside it
- `generateDynamicIcons()` in `core.js` has been removed; no other code depends on it

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

**What changed:** Renamed the project from "Trex" to "DabbuX — Personal Finance Made Personal". Replaced canvas-generated favicon with a static `assets/icon.png`. Deployed to GitHub Pages.

**Live URL:** https://ravitejbondada.github.io/dabbux/
**Repository:** https://github.com/ravitejbondada/dabbux

**Files modified:**
- `index.html` — updated `<title>`, `apple-mobile-web-app-title` meta, PWA manifest name/short_name/icon, header app name + tagline, lock screen title. Replaced dynamic `<link id="dynamicFavicon">` and `<link id="dynamicAppleIcon">` with static `<link rel="icon">` and `<link rel="apple-touch-icon">` pointing to `assets/icon.png`
- `js/core.js` — updated file header; removed `generateDynamicIcons()` function and its call from `window.onload`; favicon is now static
- `README.md` — updated title, added live URL and repo link, project folder name, added `assets/` to project structure
- `ARCHITECTURE.md` — updated title
- `FUNCTIONS.md` — updated title; marked `generateDynamicIcons()` as deprecated
- `CHANGELOG.md` — updated title and added this entry

**Migration notes:**
- The `assets/` directory must exist at the project root with `icon.png` inside it
- `generateDynamicIcons()` in `core.js` has been removed; no other code depends on it

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
