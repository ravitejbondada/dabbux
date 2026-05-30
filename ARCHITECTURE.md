# TReX - Architecture Reference

> Primary reference for AI-assisted sessions. Read this before touching any file.

---

## Module Map

```
index.html
│
├── manifest.json                  ← PWA Web App Manifest (external file)
├── sw.js                          ← Service worker for notification click handling
├── styles.css                     ← All visual styling
├── assets/
│   └── favicon.png               ← App icon (transparent, 512x512+)
│
└── JS load order (sequential, globals shared via window scope)
    │
    ├── 1. core.js           ← MUST LOAD FIRST — defines `state`, all modules depend on it
    ├── 2. auth.js           ← lock/PIN, WebAuthn biometric unlock, locked expense sheet (slide-up)
    ├── 3. dashboard.js      ← dashboard, quick logs, alerts, PWA reminders
    ├── 4. transactions.js   ← reads/writes state.transactions, state.categories, state.payments
    ├── 5. reports.js        ← reads state.transactions, state.categories, state.payments (read-only)
    ├── 6. settings.js       ← reads/writes all state fields; owns CC billing logic
    ├── 7. credit-cards.js   ← reads state via settings.js helpers; renders card views
    ├── 8. recurring.js      ← reads/writes state.recurringExpenses, state.emis, state.transactions
    ├── 9. goals-trips.js    ← reads/writes state.savingGoals, state.trips, state.transactions
    ├── 10. backup.js        ← reads full state for export; writes full state on import
    └── 11. sync.js          ← Google Drive OAuth, push/pull, conflict resolution, onboarding/migration/reset
```

---

## PWA Manifest Setup

**File:** `manifest.json` (external file at root, replaces embedded data URI)

```json
{
  "name": "TReX Expense Tracker",
  "short_name": "TReX",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#020617",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "assets/favicon.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Why external manifest?**
- ✅ Better browser caching (versioned separately from HTML)
- ✅ Standard PWA best practice
- ✅ Avoids data URI encoding issues
- ✅ Icon path properly resolved

**Icon requirements:**
- **Format:** PNG with transparent background (no white box)
- **Size:** 512x512 or larger
- **Location:** `assets/favicon.png`

**CSS optimizations (in `styles.css`):**
```css
img[src*="favicon"], img[src*="icon"] {
  image-rendering: crisp-edges;        /* Prevent blur on scaling */
  image-rendering: pixelated;          /* Pixel-perfect rendering */
  -ms-interpolation-mode: nearest-neighbor;
  mix-blend-mode: multiply;             /* Remove white background */
}
```

---

## Global State Object

Defined in `core.js`. Persisted to `localStorage` key `androidWalletState_v4`.

```js
let state = {
  // ── Settings ──────────────────────────────────────────────
  currency: "INR",               // ISO currency code
  currencySymbol: "₹",           // Display symbol
  monthlyBudget: 0,              // Budget cap for the cycle (0 / unset by default)
  cycleType: "calendar" | "salary", // cycleType ("calendar" by default)
  cycleDay: 1,                   // Day of month cycle starts (1 by default)
  creditCardsEnabled: false,     // Master toggle for CC billing day features
  pinEnabled: false,
  pinCode: "1234",
  theme: "dark" | "light",
  dailyReminderEnabled: false,   // Push notification reminder toggle
  dailyReminderTime: "21:00",    // HH:MM
  dailyReminderLastShownDate: "",// YYYY-MM-DD, missed-reminder guard
  budgetAlertsEnabled: false,
  biometricEnabled: false,       // WebAuthn local credential toggle
  biometricCredentialId: "",     // local credential id, device-local
  biometricUserId: "",           // local WebAuthn user id, device-local
  biometricLabel: "",
  biometricRegisteredAt: "",
  budgetAlertThreshold: 80,      // Percent of budget

  // ── Core data ─────────────────────────────────────────────
  categories: [
    { id, name, color, defaultPaymentId } // initialized with DEFAULT_CATEGORIES (null defaultPaymentIds)
  ],
  payments: [
    { id, name, type, limit, color, billingDay, archived? }
    // type: "Credit Card" | "UPI" | "Cash" | "Debit Card" | "Net Banking"
    // billingDay: 1–28, only relevant when type === "Credit Card"
    // archived: true if payment deleted but has existing transactions
    // Initialized with DEFAULT_PAYMENTS (Cash, UPI, Card)
  ],
  transactions: [
    // Starts empty [] (no mock/dummy transactions)
    { id, amount, categoryId, paymentId, date, note,
      isRecurring, recurringId, tripId, tripType, tripRef }
    // date: "YYYY-MM-DD" ISO string
    // tripRef: true if this tx was synced from a trip expense (read-only in ledger)
    // tripType: "pre" | "on" | null
  ],
  savingGoals: [
    // Starts empty [] (no mock/dummy goals)
    { id, name, target, current,
      contributions?: [{ id, amount, note, date }] }
  ],
  recurringExpenses: [],
  emis: [],
  trips: [],

  // ── Cloud Sync (sync.js) ──────────────────────────────────────
  syncEnabled: false,          // true once Google Drive is authorized
  updatedAt: "",               // ISO timestamp set on every saveStateToLocalStorage()
  lastSyncedAt: "",            // ISO timestamp of the most recent successful Drive push
  syncStatus: "idle",          // "idle" | "syncing" | "error" | "offline"
  googleClientId: "",          // custom OAuth Client ID (falls back to DEFAULT_CLIENT_ID)
  syncUserEmail: "",           // email of the authenticated Google account (fetched post-OAuth)
  syncDriveFileId: "",         // cached Drive file ID of trex_sync_v4.json
  deviceId: "",                // local device id
  syncEpoch: "",               // reset-generation id
  syncResetLineage: null,
  syncResetHistory: [],
  pendingCloudResetEpoch: ""
}
```

---

## Global Runtime Variables (core.js)

These are module-level `let` variables shared across all modules via the global scope:

```js
// Chart instances — always destroy before re-creating
let trendChartInstance            // dashboard.js weekly trend line
let reportsCategoryChartInstance  // reports.js doughnut
let reportsPaymentChartInstance   // reports.js doughnut
let reportsBarChartInstance       // reports.js bar
let reportGaugeChartInstance      // reports.js gauge
let cardAnalyticsChartInstance    // credit-cards.js bar

// UI state
let pinAttemptBuffer              // string, current PIN digits being entered
let activeTrendPeriod             // "weekly" | "monthly"
let activeReportViewMode          // "charts" | "list" | "mom"
let activeCreditCardMode          // "due" | "recent"
let activeCreditCardDueCycleKey   // "current" | "YYYY-MM"
let activeCreditCardId            // paymentId of currently open card detail
let expensePaymentLockId          // paymentId locked on expense form (from card context)
let pendingExpensePaymentLockId   // set before switching to addExpense screen
let expenseFormReturnCardId       // card to return to after expense save
let activeCardAnalyticsVisible    // bool, card analytics chart open/closed
let emiFormPaymentLockId          // paymentId locked on EMI form
```

---

## Screen Routing

All navigation goes through `switchScreen(viewName)` in `core.js`.

| viewName | HTML element id | Activated by |
|---|---|---|
| `dashboard` | `dashboardView` | Home nav tab, back buttons |
| `addExpense` | `addExpenseView` | "Add Expense" button, quick logs |
| `history` | `historyView` | Ledger nav tab |
| `reports` | `reportsView` | Reports nav tab |
| `cards` | `cardsView` | Cards nav tab |
| `settings` | `settingsView` | Settings button in header |
| `goals` | `goalsView` | Goals nav tab |
| `tripDetail` | `tripDetailView` | openTripDetail() |

`switchScreen` hides all `.view-panel` divs, shows the target, sets nav tab highlights,
and calls the screen's init render function.

---

## Key Patterns

### State Mutation
Always mutate `state` directly, then call `saveStateToLocalStorage()`. Never write to
localStorage directly anywhere else.

```js
state.categories.push(newCat);
saveStateToLocalStorage();
renderSettingsLists();        // re-render affected UI
showNotification("Saved.");
```

### ID Generation
IDs use `Date.now()` as a string: `id: "cat_" + Date.now()` or `"tx_" + Date.now()`.

### Dynamic HTML + Icons
After injecting innerHTML, always call `initLucideIcons(containerElement)` to render
Lucide icon `<i data-lucide="...">` tags inside the injected content.
Also call `wrapAllSelects(containerElement)` if any `<select class="app-dropdown">` was injected.

### Custom Confirm Dialog
Use `await customConfirm(message, title, okLabel)` instead of `window.confirm`.
Returns a Promise resolving to `true` (confirmed) or `false` (cancelled).

### Notifications
`showNotification(message)` — shows a toast for 2.8 seconds. Auto-dismisses.

---

## Credit Card Billing Logic (settings.js)

When `state.creditCardsEnabled` is true:
- Each Credit Card payment has a `billingDay` (1–28)
- `getBillingBoundaryISO(pay)` → last billing date
- `getCreditCardDueRange(pay, cycleKey)` → `{ startISO, endISO, label }`
- `getCreditCardBucketSnapshot(pay)` → `{ dueTxs, recentTxs, dueTotal, recentTotal }`
- All CC cycle date math lives in `settings.js`

---

## Recurring & EMI Processing (recurring.js)

Called on every `window.onload`:
1. `processRecurringExpenses()` — checks each recurring rule, posts missing entries up to today
2. `processEMIs()` — checks each EMI, posts missing monthly installments up to today

Both use `postRecurringEntry()` / `postEMIEntry()` which push directly to `state.transactions`
and call `saveStateToLocalStorage()`.

---

## Trip ↔ Ledger Sync (goals-trips.js)

`syncTripToLedger(tripId)` creates/updates real `state.transactions` entries for each
trip expense that has `categoryId` and `paymentId` set. Sets `tx.tripRef = true` so
the ledger view treats them as read-only. Marked expenses get `ledgerTxId` back-filled.

---

## Backup Format

**JSON:** Full `state` object wrapped with metadata (`backupVersion`, `app`, `exportedAt`).

**CSV:** Multi-section format with `[SECTION_NAME]` headers, one table per section.
Sections: `SETTINGS`, `CATEGORIES`, `PAYMENTS`, `TRANSACTIONS`, `RECURRING_EXPENSES`, `SAVING_GOALS`.

Both formats are versioned via `BACKUP_FORMAT_VERSION` constant in `backup.js`.

---

## Cloud Sync — Implementation (js/sync.js)

Architecture: **local-first, Google Drive `appDataFolder` as secondary store**.
No backend — all auth happens via Google Identity Services (GIS) in-browser.

### Drive File
`trex_sync_v4.json` stored in `appDataFolder` (private, not visible in user's Drive UI).

### Hardcoded Default Client ID
`DEFAULT_CLIENT_ID` is owned by `core.js`. `sync.js` uses its own local
`SYNC_DEFAULT_CLIENT_ID` fallback with the same value to avoid redeclaring a
top-level `const` in the shared browser script scope:
```
219866394954-pg9187uvcq3gu0c4l51728m1u1hojt0c.apps.googleusercontent.com
```
Used as fallback whenever `state.googleClientId` is empty or uninitialized.

### Boot Sequence
```
window.onload (core.js):
  1. Load state from localStorage            ← instant, works offline
  2. syncFromDrive()  (if syncEnabled)       ← pull remote, silent background apply
  3. checkAndShowOnboardingModal()           ← prompt if sync still disabled
  4. updateHeaderSyncIcon()                  ← render header cloud icon on cold start
```

### On State Change
```
saveStateToLocalStorage() → sets state.updatedAt = now → debounced pushToDrive() (3 s)
```

### Tab Visibility Auto-Sync
A `visibilitychange` event listener fires `syncFromDrive()` whenever
`document.visibilityState === 'visible'` and sync is enabled — ensures the device
syncs the moment the user switches back to the app tab.

### Silent Conflict Resolution (no intrusive modals)
Last-write-wins using `state.updatedAt` ISO timestamp:
- Before timestamp decisions, `syncFromDrive()` reconciles missing device-owned
  records by stable `id` across `categories`, `payments`, `transactions`,
  `savingGoals`, `trips`, `recurringExpenses`, and `emis`; if either side was
  missing records, the merged state is applied locally and pushed back to Drive
  so devices converge.
- Shared settings such as currency, budget cycle, theme, reminder settings, and
  budget alert settings follow the newer state. `creditCardsEnabled=true` is
  preserved across devices so a stale `false` cannot hide card mode.
- `remoteTime === localTime` → already in sync, no-op
- `remoteTime > localTime` after reconciliation → remote state applies locally
- `local.monthlyBudget !== remote.monthlyBudget` → scoped **Budget Conflict Modal** (two-button: "This device" / "Cloud"); no full-page modal
- `localTime > remoteTime` → push local to Drive

> ⚠️ The old `showConflictModal()` full-screen modal is retained in the codebase but is no longer called by `syncFromDrive()`.

### `applyRemoteState(remoteState, silent?)`
Before overwriting local state with remote data, the following local-device fields
are **always preserved** (never overwritten from remote):
- `state.googleClientId`
- `state.syncUserEmail`
- `state.syncDriveFileId`
- `state.syncEnabled` (forced to `true`)

Drive sync uses `normalizeSyncState()`, not the backup import normalizer, so the
full live app shape is preserved during remote apply. This is important for
settings such as `creditCardsEnabled`, `emis`, alert/reminder config, and sync
metadata that are not part of the older backup import shape.

UI is re-rendered immediately via `updateAppDashboardView()` + `renderSyncControls()`.
No `window.location.reload()`.

### Connect Flow (`connectGoogleSync`)
1. Call `getValidToken(true)` — triggers OAuth popup
2. Call `fetchGoogleUserEmail(token)` — hits `/oauth2/v3/userinfo`, stores `state.syncUserEmail`
3. Call `findSyncFileId(token)`:
   - **No cloud file** → silent upload via `pushToDrive()`; cache new file ID in `state.syncDriveFileId`; no migration modal
   - **Cloud file exists + local data** → show **Migration Modal** (Merge / Fresh Start / Cancel)
4. Cache `state.syncDriveFileId` from the looked-up file ID
5. Call `renderSyncMetaBadge()` to display account + file info

### Auth Flow
- GIS `initTokenClient` with `drive.appdata`, `openid`, `email`, and `profile` scopes
- `getValidToken(forceInteractive?)` — returns cached token if valid (1-min grace), else requests silently or interactively
- Token refreshed on 401 inside `fetchWithRetry()`
- `fetchWithRetry()` implements exponential backoff: `[2s, 5s, 15s]` retries

### Header Sync Icon (`#headerSyncBtn`)
Rendered in the main app header bar. Always visible: when sync is off it shows a gray `cloud-off` icon that opens Settings.

| `syncStatus` | Icon | Color | Click action |
|---|---|---|---|
| `idle` | `cloud-check` | indigo | `triggerManualSync()` |
| `syncing` | `refresh-cw` + `animate-spin` | indigo | none |
| `error` / `offline` | `cloud-off` | slate | `switchScreen('settings')` |

Updated by `updateHeaderSyncIcon()` — called at the end of every `updateSyncStatus()` invocation and on `window.onload`.

### Account & File Metadata Badge (`#syncMetaBadge`)
Rendered inside the Cloud Sync settings panel when `syncEnabled=true`.
Displays: Connected Account email (`state.syncUserEmail`) and Drive File ID (`state.syncDriveFileId`).
Populated by `renderSyncMetaBadge()`, called from `renderSyncControls()` and `connectGoogleSync()`.

### Onboarding Modal
- `checkAndShowOnboardingModal()` called from `window.onload` after sync attempt
- Shown if `!state.syncEnabled` and `sessionStorage` key `trex_onboarding_seen` is absent
- `sessionStorage` ensures it re-triggers every incognito session
- "Enable Sync" CTA navigates to Settings and calls `connectGoogleSync()`

### Migration Modal (Merge / Fresh Start)
- Shown inside `connectGoogleSync()` **only when** a cloud file already exists AND local data is present
- **Merge:** runs `syncFromDrive()` reconciliation and pushes the converged state back to Drive
- **Fresh Start:** downloads the cloud file and applies it locally
- Cancel aborts; no state changes committed
- If **no cloud file exists**, migration modal is bypassed entirely (silent upload)

### Reset Sync
- `resetSyncData()` — replaces `trex_sync_v4.json` with a reset marker in Drive
- Resets `state.syncEnabled`, `lastSyncedAt`, `syncStatus`; clears in-memory token
- Local data is **never** touched — other devices must explicitly choose how to handle the reset marker before syncing
- Surfaced as "Reset Cloud Sync Only" in the Settings Danger Zone and disabled unless Google Drive sync is connected

### Full Reset: Cloud + Local
- `resetAllData()` confirms destructive reset, replaces `trex_sync_v4.json` with a reset marker when a token is available, removes `androidWalletState_v4` from localStorage, clears `trex_onboarding_seen` from sessionStorage, and reloads the app.
- Surfaced as "Full Reset: Cloud + Local" in the Settings Danger Zone whether sync is connected or disconnected.
- Reset markers advance `syncEpoch` and preserve reset lineage so stale devices cannot silently merge pre-reset data into newer post-reset cloud data.
- When a stale device chooses "Reset This Device Too", the marker is replaced with a fresh empty post-reset cloud state before local data is cleared, preventing repeated reset prompts.

---

## CSS Themes

The app supports dark (default) and light themes via a `data-theme` attribute on `<html>`.

- `applyTheme("dark")` — removes `data-theme` attribute
- `applyTheme("light")` — sets `data-theme="light"`

Light theme overrides are defined in `styles.css` via `html[data-theme="light"] ...` selectors.
