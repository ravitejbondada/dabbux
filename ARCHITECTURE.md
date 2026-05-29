# DabbuX — Architecture Reference

> Primary reference for AI-assisted sessions. Read this before touching any file.

---

## Module Map

```
index.html
│
├── styles.css                     ← All visual styling
│
└── JS load order (sequential, globals shared via window scope)
    │
    ├── 1. core.js           ← MUST LOAD FIRST — defines `state`, all modules depend on it
    ├── 2. auth.js           ← reads/writes state.pinEnabled, state.pinCode
    ├── 3. dashboard.js      ← reads state extensively, calls saveStateToLocalStorage()
    ├── 4. transactions.js   ← reads/writes state.transactions, state.categories, state.payments
    ├── 5. reports.js        ← reads state.transactions, state.categories, state.payments (read-only)
    ├── 6. settings.js       ← reads/writes all state fields; owns CC billing logic
    ├── 7. credit-cards.js   ← reads state via settings.js helpers; renders card views
    ├── 8. recurring.js      ← reads/writes state.recurringExpenses, state.emis, state.transactions
    ├── 9. goals-trips.js    ← reads/writes state.savingGoals, state.trips, state.transactions
    └── 10. backup.js        ← reads full state for export; writes full state on import
```

---

## Global State Object

Defined in `core.js`. Persisted to `localStorage` key `androidWalletState_v4`.

```js
let state = {
  // ── Settings ──────────────────────────────────────────────
  currency: "INR",               // ISO currency code
  currencySymbol: "₹",           // Display symbol
  monthlyBudget: 50000,          // Budget cap for the cycle
  cycleType: "salary" | "monthly",
  cycleDay: 5,                   // Day of month salary cycle starts (salary mode only)
  creditCardsEnabled: false,     // Master toggle for CC billing day features
  pinEnabled: false,
  pinCode: "1234",
  theme: "dark" | "light",
  dailyReminderEnabled: false,   // Push notification reminder toggle
  dailyReminderTime: "09:00",    // HH:MM
  budgetAlertEnabled: false,
  budgetAlertThreshold: 80,      // Percent of budget

  // ── Core data ─────────────────────────────────────────────
  categories: [
    { id, name, color, defaultPaymentId }
  ],
  payments: [
    { id, name, type, limit, color, billingDay, archived? }
    // type: "Credit Card" | "UPI" | "Cash" | "Debit Card" | "Net Banking"
    // billingDay: 1–28, only relevant when type === "Credit Card"
    // archived: true if payment deleted but has existing transactions
  ],
  transactions: [
    { id, amount, categoryId, paymentId, date, note,
      isRecurring, recurringId, tripId, tripType, tripRef }
    // date: "YYYY-MM-DD" ISO string
    // tripRef: true if this tx was synced from a trip expense (read-only in ledger)
    // tripType: "pre" | "on" | null
  ],
  savingGoals: [
    { id, name, target, current,
      contributions?: [{ id, amount, note, date }] }
  ],
  recurringExpenses: [
    { id, name, amount, freq, startDate, categoryId, paymentId,
      note, lastProcessed, createdAt, updatedAt }
    // freq: "daily" | "weekly" | "monthly" | "yearly"
  ],
  emis: [
    { id, name, principal, rateYear, tenure, startDate,
      categoryId, paymentId, note, lastProcessed, createdAt }
  ],
  trips: [
    { id, name, emoji, startDate, endDate, budget,
      expenses: [
        { id, description, amount, date, type, categoryId, paymentId, ledgerTxId }
        // type: "pre" | "on"
        // ledgerTxId: linked transaction id after syncTripToLedger()
      ]
    }
  ]
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

## Cloud Sync — Design Pattern (not yet implemented)

Recommended approach: **local-first, Drive as secondary store**.

```
App boot:
  1. Load localStorage immediately (instant, works offline)
  2. Background fetch from Drive
  3. Compare timestamps → if Drive is newer, merge into state → saveStateToLocalStorage()

On state change:
  1. saveStateToLocalStorage()  ← already called everywhere
  2. debounced pushToDrive()    ← add this call here

Files to create/modify:
  - js/sync.js          (new) Google OAuth + Drive read/write + conflict resolution
  - core.js             (modify) add syncToDrive() call in saveStateToLocalStorage()
  - window.onload       (modify) add syncFromDrive() after localStorage load
  - index.html          (modify) add <script src="js/sync.js"> after core.js
```

Conflict resolution strategy: **last-write-wins** using an `updatedAt` ISO timestamp
added to the state root. Single-user app — no CRDT needed.

---

## CSS Themes

The app supports dark (default) and light themes via a `data-theme` attribute on `<html>`.

- `applyTheme("dark")` — removes `data-theme` attribute
- `applyTheme("light")` — sets `data-theme="light"`

Light theme overrides are defined in `styles.css` via `html[data-theme="light"] ...` selectors.
