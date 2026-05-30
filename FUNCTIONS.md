# TReX - Function Index

Searchable reference of all 252 functions. Format: `functionName` — what it does.

To find where to add/edit something, scan the relevant section header then go to that file.

---

## core.js — App Core (12 functions)

| Function | Description |
|---|---|
| `forceDropdownDarkTheme(sel)` | Applies dark colour scheme inline to a `<select>` and its `<option>` elements |
| `wrapAllSelects(root?)` | Wraps all `.app-dropdown` selects in a `.select-wrap` div for custom chevron styling |
| `generateDynamicIcons()` | **Deprecated — no longer used.** Static app icon is now served from `assets/favicon.png`, with the PWA manifest moved to external `manifest.json`. Previously drew the logo to canvas and set the favicon + Apple touch icon |
| `initLucideIcons(root?)` | Calls `lucide.createIcons()` on the document or a scoped root element |
| `cleanArchivedPayments()` | Removes archived payments that have zero linked transactions |
| `saveStateToLocalStorage()` | Serializes `state` to `localStorage` key `androidWalletState_v4`; sets `state.updatedAt` timestamp; triggers debounced `pushToDrive()` if sync is enabled |
| `showNotification(message)` | Shows the bottom toast banner for 2.8 seconds |
| `customConfirm(message, title?, okLabel?)` | Promise-based confirm dialog replacing `window.confirm`. Returns `true`/`false` |
| `applyTheme(theme)` | Sets `data-theme` attribute on `<html>` for light/dark CSS switching |
| `toggleThemeSetting()` | Reads the theme toggle checkbox and calls `applyTheme()` + saves state |
| `switchScreen(viewName)` | Main router — hides all view panels, shows target, updates nav tabs, calls init render |
| `checkAndShowOnboardingModal()` | Called from `window.onload`; delegates to `sync.js` to show the Drive onboarding prompt if sync is disabled and not yet seen this session |
| `updateHeaderSyncIcon()` | *(defined in sync.js, called from core.js boot)* Updates the `#headerSyncBtn` icon and click binding in the app header based on `state.syncStatus` |

---

## auth.js — PIN & App Lock (12 functions)

| Function | Description |
|---|---|
| `closePinSuccessModal()` | Hides the PIN change success modal |
| `showPinChangeSuccess()` | Shows the PIN change success modal with animation |
| `isAppLocked()` | Returns true if `pinEnabled` and lock screen is visible |
| `updateAppLockButton()` | Syncs the header lock icon button appearance to current lock state |
| `lockApp()` | Shows the lock screen overlay and clears the PIN input buffer |
| `unlockApp()` | Hides the lock screen after successful PIN entry |
| `togglePinSetting()` | Enables/disables PIN lock from the settings checkbox |
| `pressPin(char)` | Handles a numeric keypad press; auto-submits on 4 digits |
| `clearPin()` | Backspace — removes the last digit from the PIN input buffer |
| `simulateBiometrics()` | Simulates biometric unlock (bypasses PIN for demo/dev) |
| `updatePinVisualDots()` | Updates the 4 dot indicators based on current `pinAttemptBuffer` length |
| `changePin()` | Validates old PIN, sets new PIN from settings form, saves state |

---

## dashboard.js — Dashboard & Budget Widgets (30 functions)

| Function | Description |
|---|---|
| `calculateActiveCycleRange()` | Returns `{ startDate, endDate }` for the current budget cycle |
| `calculateCycleMetrics()` | Computes spent, remaining, daily rate, days left for the active cycle |
| `formatDateReadable(dateObj, opts?)` | Formats a Date as "Mon DD" or "Mon DD, YYYY" with optional weekday |
| `formatDateTime(dateObj)` | Formats a Date as "Today", "Yesterday", or "Mon DD" for activity feed |
| `updateAppDashboardView()` | Master dashboard refresh — calls all widget renderers |
| `renderForecastCard(metrics)` | Renders the projected end-of-cycle forecast card |
| `renderSpendHeatmap()` | Renders the monthly spending heatmap calendar grid |
| `getQuickLogs()` | Returns quick log config array from state or default seeds |
| `renderQuickLogButtons()` | Renders the 1-tap quick log button grid on the dashboard |
| `openQuickLogEditor()` | Opens the quick log customization modal |
| `renderQuickLogEditorRow(q, i)` | Renders a single editable row in the quick log editor |
| `addNewQuickLogSlot()` | Appends a new empty quick log slot in the editor |
| `removeQuickLogSlot(id)` | Removes a quick log slot by id in the editor |
| `saveAndCloseQuickLogEditor()` | Validates and saves quick log config to state, closes modal |
| `closeQuickLogEditor()` | Closes the quick log editor modal without saving |
| `saveBudgetAlertSetting()` | Saves budget alert threshold from settings form |
| `checkBudgetAlerts(metrics)` | Triggers a browser notification if spending exceeds alert threshold |
| `toggleDailyReminderSetting()` | Enables/disables daily reminder, requests notification permission |
| `saveDailyReminderTime()` | Saves reminder time from settings form |
| `scheduleDailyReminder()` | Schedules a `setTimeout`-based daily notification |
| `requestNotificationPermission(callback)` | Requests browser notification permission, calls callback on grant |
| `syncNotificationSettings()` | Syncs all notification UI toggles from state on load |
| `triggerQuickLog(amount, categoryId, note, paymentId)` | Instantly adds a transaction from a quick log tap |
| `renderDashboardCategoryHorizontalBars(startDate, endDate)` | Renders horizontal bar chart of spending by category |
| `renderDashboardCategoryStackedBar(startDate, endDate)` | Renders stacked bar of category spend ratios |
| `renderDashboardPaymentStackedBar(startDate, endDate)` | Renders stacked bar of payment method ratios |
| `renderDashboardPaymentHorizontalBars(startDate, endDate)` | Renders horizontal bars of spending per payment method |
| `setTrendPeriod(period)` | Sets `activeTrendPeriod` and re-renders the trend chart |
| `renderWeeklyTrendChartLine()` | Renders the weekly/monthly line trend chart using Chart.js |
| `renderRecentActivityList()` | Renders the recent transactions feed at the bottom of the dashboard |

---

## transactions.js — Expense Form & Ledger (20 functions)

| Function | Description |
|---|---|
| `setupExpenseFormForAdd()` | Resets the expense form for a new transaction |
| `populateExpenseFormDropdowns(currentPaymentId?)` | Populates category and payment `<select>` options |
| `populateEMIFormDropdowns()` | Populates EMI form category and payment dropdowns |
| `applyCategoryDefaultPayment()` | Auto-selects the default payment when a category is chosen |
| `loadExpenseToFormForEdit(txId, returnCardId?)` | Populates the expense form for editing an existing transaction |
| `handleExpenseSubmit(e)` | Form submit handler — validates, creates/updates transaction, saves state |
| `populateInlineCategoryPaymentOptions()` | Populates dropdowns inside the inline add category/payment modals |
| `openInlineCategoryModal(mode?)` | Opens the quick-add category modal from the expense form |
| `closeInlineCategoryModal()` | Closes the inline category modal |
| `saveInlineCategory()` | Creates a new category from the inline modal, updates dropdowns |
| `openInlinePaymentModal(mode?)` | Opens the quick-add payment modal from the expense form |
| `closeInlinePaymentModal()` | Closes the inline payment modal |
| `saveInlinePayment()` | Creates a new payment method from the inline modal, updates dropdowns |
| `renderHistoryList()` | Renders the full ledger/history list for the current date range |
| `initLedgerMonthSelector()` | Populates the ledger month/cycle dropdown |
| `resetLedgerToCycle()` | Resets ledger date range to the current active cycle |
| `getLedgerDateRange()` | Returns `{ startDate, endDate }` based on active ledger selection |
| `openLedgerWithDate(dateISO)` | Switches to history view and filters to the month containing the date |
| `filterHistory()` | Applies search text + category/payment filters to the history list |
| `deleteTransaction(id)` | Async — confirms then removes a transaction from state |

---

## reports.js — Analytics & Reports (20 functions)

| Function | Description |
|---|---|
| `destroyReportChart(instance)` | Destroys a Chart.js instance and returns null |
| `resizeReportCharts()` | Triggers resize on all active report chart instances |
| `hexToRgba(hex, alpha)` | Converts a hex color string to `rgba(r,g,b,alpha)` |
| `premiumChartTooltip()` | Returns a shared Chart.js tooltip config object for consistent styling |
| `renderPremiumDoughnut(canvasId, labels, values, colors)` | Renders a styled doughnut chart on the given canvas |
| `renderPremiumBarChart(labels, values, colors)` | Renders a styled horizontal bar chart for reports |
| `renderReportGauge(spent, budget)` | Renders the budget utilization gauge arc chart |
| `renderPremiumReportCharts(catLabels, catValues, catColors, payLabels, payValues, payColors)` | Orchestrates rendering of all report charts |
| `renderReportTopCategories(labels, values, colors)` | Renders the top-category ranked list below the doughnut |
| `toggleReportMode(mode)` | Switches between "charts", "list", "mom" report tabs |
| `renderHistoricalMonthReport()` | Main report renderer — computes data and calls chart/list renderers |
| `renderAccordionReportList()` | Renders the itemized accordion transaction list |
| `toggleAccordionItem(listId, iconId)` | Toggles open/close state of an accordion section |
| `getMomAvailableCycles()` | Returns array of available cycle keys for MoM comparison selectors |
| `populateMomCycleSelectors()` | Populates the two MoM cycle selector dropdowns |
| `getTxForCycle(cycleKey)` | Returns transactions for a specific cycle key string |
| `sumByCategory(txs)` | Aggregates transaction array into `{ categoryId: totalAmount }` map |
| `cycleLabelFromKey(key)` | Converts a cycle key string to a human-readable label |
| `renderMomReport()` | Renders the full month-over-month comparison section |
| `generatePDFReport()` | Generates and downloads a PDF summary report for the selected statement cycle using html2canvas + jsPDF |

---

## settings.js — Settings, Categories & Payments (37 functions)

| Function | Description |
|---|---|
| `buildCurrencySelectorOptions()` | Populates the currency `<select>` from the CURRENCIES constant |
| `syncSettingsFormFields()` | Syncs all settings form inputs from current state on screen open |
| `toggleCycleDateSelector()` | Shows/hides the cycle day input based on cycle type selection |
| `updateCurrencySetting()` | Reads currency selector and saves to state |
| `toggleCreditCardsSetting()` | Enables/disables credit card mode, backfills billing days |
| `backfillMissingCreditCardBillingDays()` | Sets default `billingDay: 15` on CC payments missing one |
| `isCreditCardBillingDayRequired(paymentType)` | Returns true if CC mode is on and type is Credit Card |
| `syncPaymentBillingDayRequirement(scopeKey)` | Shows/hides billing day field based on payment type in forms |
| `formatBillingDayLabel(day)` | Converts day number to ordinal string e.g. "15th" |
| `getPaymentSummaryLabel(pay)` | Returns display string like "Credit Card • Billing day: 15th" |
| `getMonthKeyFromDate(dateObj)` | Returns "YYYY-MM" string from a Date |
| `getCreditCardAvailableCycles()` | Returns sorted array of `{ key, label }` for all months with transactions |
| `addDaysToISO(dateISO, days)` | Adds N days to an ISO date string, returns new ISO string |
| `getPreviousBillingBoundaryISO(pay, referenceDate?)` | Returns the ISO date of the billing boundary one day before reference |
| `getCreditCardDueRange(pay, cycleKey?, referenceDate?)` | Returns `{ startISO, endISO, label }` for a CC billing cycle |
| `getCreditCardRecentRange(pay, referenceDate?)` | Returns `{ startISO, endISO, label }` for the current (unbilled) cycle |
| `populateCreditCardCycleSelectors()` | Populates the cycle dropdown selectors in the cards view |
| `setCreditCardViewMode(mode, cycleKey?)` | Sets active CC view mode and re-renders the cards view |
| `isCreditCardPayment(pay)` | Returns true if payment type is "Credit Card" or "CC" |
| `getPaymentBillingDay(pay)` | Returns billing day number from payment, defaults to 15 |
| `toLocalISODate(dateObj)` | Converts a Date to local "YYYY-MM-DD" string (avoids UTC offset issues) |
| `getBillingBoundaryISO(pay, referenceDate?)` | Returns the ISO date of the last billing day for a CC payment |
| `getCreditCardBucketSnapshot(pay, dueCycleKey?, referenceDate?)` | Returns `{ dueTxs, recentTxs, dueTotal, recentTotal, dueRange, recentRange }` for one card |
| `getCreditCardPortfolioSnapshot(dueCycleKey?, referenceDate?)` | Aggregates bucket snapshots across all CC payments |
| `updateExpensePaymentLockUI()` | Disables/enables the payment dropdown when locked to a CC |
| `clearExpensePaymentLock()` | Clears payment lock state and updates UI |
| `applyExpensePaymentLock(paymentId)` | Locks the expense form payment to a specific payment id |
| `saveBudgetAndCycleSettings()` | Reads budget/cycle form fields, validates, saves to state |
| `renderSettingsLists()` | Renders categories list, payments list, recurring list, EMI list |
| `openEditCategoryModal(catId)` | Populates and opens the edit category modal |
| `closeEditCategoryModal()` | Closes the edit category modal |
| `saveEditCategory()` | Saves edited category fields to state |
| `deleteCategory(catId)` | Async — confirms then removes a category (blocks if in use) |
| `openEditPaymentModal(payId)` | Populates and opens the edit payment modal |
| `closeEditPaymentModal()` | Closes the edit payment modal |
| `saveEditPayment()` | Saves edited payment fields to state |
| `deletePaymentMethod(payId)` | Async — confirms, cancels linked recurrings, archives or removes payment |

---

## credit-cards.js — Credit Card View & Analytics (10 functions)

| Function | Description |
|---|---|
| `refreshCreditCardViews()` | Re-renders credit card view if currently visible |
| `openCreditCardDetail(payId)` | Sets `activeCreditCardId` and re-renders to show detail panel |
| `closeCreditCardDetail()` | Clears `activeCreditCardId` and re-renders to show card list |
| `openExpenseFromCreditCard()` | Navigates to add expense form with payment locked to active card |
| `loadExpenseToFormForEditFromCreditCard(txId, payId)` | Loads an existing transaction for edit from within the card view |
| `renderCreditCardTransactionRows(container, txs, pay)` | Renders transaction rows into a card detail container |
| `renderCreditCardDetailView(pay, snapshot)` | Renders the full detail panel for a single credit card |
| `renderCreditCardsView()` | Master renderer for the cards screen — list or detail based on `activeCreditCardId` |
| `toggleCardAnalytics()` | Expands/collapses the card analytics chart panel |
| `renderCardAnalyticsChart()` | Renders the monthly spend bar chart for the active card |

---

## recurring.js — Recurring Expenses & EMIs (28 functions)

**Date Utilities**

| Function | Description |
|---|---|
| `getTodayISO()` | Returns today's date as "YYYY-MM-DD" |
| `parseISODate(str)` | Parses "YYYY-MM-DD" string to a local Date object |
| `formatISODate(d)` | Formats a Date to "YYYY-MM-DD" using local timezone |

**Recurring Expenses**

| Function | Description |
|---|---|
| `getRecurringOccurrenceDates(rec, upToDate)` | Returns all occurrence dates for a recurring rule up to a date |
| `hasRecurringTxOnDate(recurringId, dateStr)` | Returns true if a recurring transaction already exists for that date |
| `removeFutureRecurringTransactions(recurringId)` | Removes all future-dated transactions for a recurring rule |
| `openRecurringModal(editId?)` | Opens the recurring expense create/edit modal |
| `closeRecurringModal()` | Closes the recurring modal |
| `saveRecurring()` | Creates or updates a recurring expense rule in state |
| `deleteRecurring(id)` | Async — confirms, removes future transactions, removes rule |
| `renderRecurringExpenses()` | Renders the recurring schedules list in settings |
| `processRecurringExpenses()` | Posts any missing recurring transaction entries up to today |
| `postRecurringEntry(rec, dateStr)` | Creates and saves one transaction entry for a recurring rule |

**EMI (Equated Monthly Installments)**

| Function | Description |
|---|---|
| `openEMIFromCreditCard()` | Opens the EMI modal pre-locked to the active credit card |
| `openEMIModal(emiId?)` | Opens the EMI create/edit modal |
| `closeEMIModal()` | Closes the EMI modal |
| `openEMIScheduleModal(emiId)` | Opens the read-only EMI amortization schedule modal |
| `closeEMIScheduleModal()` | Closes the EMI schedule modal |
| `calculateEMILivePreview()` | Updates the live EMI preview as principal/rate/tenure change |
| `calculateEMIDetails(principal, rateYear, tenure)` | Returns `{ monthlyEMI, totalAmount, totalInterest }` |
| `saveEMI()` | Creates or updates an EMI rule in state |
| `deleteEMI(id)` | Async — confirms, removes future EMI transactions, removes rule |
| `removeFutureEMITransactions(emiId)` | Removes all future-dated EMI transactions |
| `renderEMIsList()` | Renders the EMI list in settings |
| `processEMIs()` | Posts any missing EMI installment entries up to today |
| `getEMIOccurrenceDates(emi, today)` | Returns all installment dates for an EMI up to today |
| `hasEMITxOnDate(emiId, dateStr)` | Returns true if an EMI transaction already exists for that date |
| `postEMIEntry(emi, dateStr, monthNumber)` | Creates and saves one EMI installment transaction |

---

## goals-trips.js — Saving Goals & Trips (44 functions)

**Saving Goals**

| Function | Description |
|---|---|
| `renderSavingGoalsDedicated()` | Renders all saving goals in the goals tab |
| `toggleGoalAccordion(id)` | Expands/collapses a goal's contribution history |
| `editGoalContribution(cid)` | Opens inline edit form for a contribution |
| `cancelEditContribution(cid)` | Cancels the contribution edit, restores display |
| `saveGoalContribution(goalId, cid)` | Saves an edited contribution amount/note |
| `deleteGoalContribution(goalId, cid)` | Async — confirms and removes a contribution |
| `createNewSavingGoalDedicated()` | Creates a new saving goal from the form |
| `fundSavingGoalDedicated(id)` | Adds a new contribution to a goal |
| `removeSavingGoalDedicated(id)` | Async — confirms and removes a saving goal |

**Trips**

| Function | Description |
|---|---|
| `getActiveTrip()` | Returns the trip currently in progress (today within its date range) |
| `renderActiveTripBanner()` | Renders/hides the active trip banner on the dashboard |
| `openTripQuickAdd(tripId)` | Opens the quick-add expense overlay on the trip banner |
| `closeTripQuickAdd()` | Closes the trip quick-add overlay |
| `submitTripQuickAdd()` | Submits a quick expense to the active trip |
| `bannerSyncTrip(tripId)` | Syncs the trip to the ledger from the banner |
| `renderNewTripEmojiPicker()` | Renders the emoji grid picker in the new trip form |
| `pickTripEmoji(btn, emoji)` | Selects an emoji in the picker UI |
| `selectNewTripEmoji(e)` | Handles emoji selection from the grid |
| `updateNewTripEmojiPickerUI()` | Updates selected state in the emoji picker grid |
| `getSelectedNewTripEmoji()` | Returns the currently selected emoji in the new trip form |
| `switchGoalsTab(tab)` | Switches between "goals" and "trips" tabs |
| `getTripStatus(trip)` | Returns "upcoming" \| "active" \| "completed" for a trip |
| `getTripTotalSpent(trip)` | Returns total amount across all trip expenses |
| `getTripPreSpent(trip)` | Returns total of pre-trip expenses |
| `getTripOnSpent(trip)` | Returns total of on-trip expenses |
| `renderTripsList()` | Renders all trips in the trips tab |
| `createNewTrip()` | Creates a new trip from the form |
| `openTripEdit()` | Opens the trip edit form for the current trip detail |
| `saveEditedTrip()` | Saves changes to a trip's name/dates/budget/emoji |
| `openTripDetail(tripId)` | Switches to the trip detail view for a given trip |
| `closeTripDetail()` | Navigates back to the goals/trips screen |
| `renderTripDetailStats()` | Renders the stats header in the trip detail view |
| `getTripDaysCount(trip)` | Returns the number of days in a trip |
| `renderTripExpenses()` | Renders the trip expenses list in the detail view |
| `switchTripTab(tab)` | Switches between "pre-trip" and "on-trip" expense tabs |
| `populateTripExpenseDropdowns()` | Populates category/payment dropdowns in the trip expense form |
| `determineTripExpenseType(trip, dateStr)` | Returns "pre" or "on" based on the date relative to trip dates |
| `setTripExpenseType(type)` | Sets the expense type toggle in the trip form |
| `addTripExpense()` | Creates a new trip expense entry |
| `deleteTripExpense(expenseId)` | Async — confirms and removes a trip expense |
| `openEditTripExpense(expenseId)` | Populates the inline edit form for a trip expense |
| `cancelEditTripExpense()` | Cancels inline trip expense editing |
| `syncTripToLedger()` | Creates/updates main ledger transactions for all synced trip expenses |
| `deleteTripConfirm()` | Async — confirms and removes the current trip and its synced transactions |

---

## backup.js — Data Backup & Restore (15 functions)

| Function | Description |
|---|---|
| `cloneStateSnapshot()` | Returns a deep clone of the current state via JSON parse/stringify |
| `buildBackupPayload()` | Wraps state snapshot with metadata for export |
| `normalizeImportedState(raw)` | Sanitizes and fills defaults on an imported state object |
| `isValidBackupPayload(parsed)` | Returns true if the parsed object has the required backup structure |
| `applyFullStateRestore(importedRaw)` | Validates, normalizes, applies, and saves an imported state |
| `csvEscape(val)` | Escapes a value for CSV output (quotes if contains comma/newline) |
| `csvRow(fields)` | Converts an array of values to a CSV row string |
| `parseCSVLine(line)` | Parses a single CSV line, handles quoted fields |
| `parseBackupCSVSections(text)` | Splits a multi-section CSV backup into a `{ SECTION: lines[] }` map |
| `parseSectionTable(sectionLines)` | Converts section lines (header + rows) into an array of objects |
| `buildStateFromCSVSections(sections)` | Reconstructs a state draft from parsed CSV sections |
| `downloadBackupFile(filename, content, mime)` | Creates a Blob and triggers a browser file download |
| `exportDataToJSON()` | Builds and downloads a full JSON backup file |
| `exportDataToCSV()` | Builds and downloads a full CSV backup file |
| `importBackupFile(e)` | File input handler — reads JSON or CSV and calls `applyFullStateRestore()` |

---

## sync.js — Google Drive Cloud Sync (31 functions)

**Auth & Token Management**

| Function | Description |
|---|---|
| `initGoogleAuth(forceInteractive?)` | Initialises the GIS `TokenClient` with Drive AppData plus `openid email profile` scopes; sets up the OAuth callback |
| `getValidToken(forceInteractive?)` | Returns a valid OAuth token from cache if not expired (1-min grace); otherwise requests one silently or interactively via GIS |

**Drive API Wrappers**

| Function | Description |
|---|---|
| `fetchWithRetry(url, options, retries?)` | `fetch` wrapper with exponential backoff `[2s, 5s, 15s]`; auto-refreshes token on 401 |
| `findSyncFileId(token)` | Queries Drive `appDataFolder` for `dabbux_sync_v4.json`; returns the file ID or `null` |
| `createSyncFile(token, content)` | Creates `dabbux_sync_v4.json` in `appDataFolder` with the given JSON string |
| `updateSyncFile(token, fileId, content)` | Patches the content of an existing Drive sync file |
| `downloadSyncFile(token, fileId)` | Downloads and JSON-parses the remote sync file |

**Sync Engine**

| Function | Description |
|---|---|
| `pushToDrive()` | Serializes `state` and uploads it to Drive; updates `state.lastSyncedAt` on success |
| `syncFromDrive()` | Silent background pull: reconciles categories, payments, transactions, goals, trips, recurring expenses, and EMIs by `id`; applies newer shared settings; pushes converged state back to Drive when needed |
| `buildMergedSyncState(localState, remoteState)` | Builds a converged state object from local + remote collections and shared settings |
| `sameSyncArrays(a, b)` | Compares sync-relevant arrays and scalar settings to detect whether reconciliation changed either side |
| `applyRemoteState(remoteState, silent?)` | Normalizes and applies a remote state object; preserves `googleClientId`, `syncUserEmail`, `syncDriveFileId`; forces `syncEnabled=true`; re-renders UI without page reload |
| `_applyRemoteSilent(remoteState, isInitialLinkage, token, fileId)` | Legacy/internal helper for applying remote state after budget conflict decisions |
| `_showBudgetConflictModal(localBudget, remoteBudget, onResolved)` | Scoped two-button modal for budget-only discrepancy; calls `onResolved(keepRemote: boolean)` |
| `normalizeSyncState(remoteState)` | Normalizes Drive sync state while preserving the full live app shape, including `creditCardsEnabled`, EMIs, alerts, reminders, and sync metadata |

**Account & Metadata**

| Function | Description |
|---|---|
| `fetchGoogleUserEmail(token)` | Hits `/oauth2/v3/userinfo`; stores email in `state.syncUserEmail` and persists to localStorage |
| `renderSyncMetaBadge()` | Shows/hides the `#syncMetaBadge` panel; populates connected email and Drive file ID; resolves file ID live if not cached in `state.syncDriveFileId` |

**Status UI**

| Function | Description |
|---|---|
| `updateSyncStatus(status, message?)` | Updates the sync status indicator in the settings panel (`idle` / `syncing` / `error` / `offline`); calls `updateHeaderSyncIcon()` |
| `updateHeaderSyncIcon()` | Updates the always-visible `#headerSyncBtn`: sync off/error/offline → gray `cloud-off` + Settings; `idle` → indigo `cloud-check` + `triggerManualSync()`; `syncing` → spinning `refresh-cw` |
| `formatTimeAgo(isoString)` | Formats sync timestamps into compact relative text such as `just now`, `5m ago`, or `2h ago` |

**Conflict Resolution (legacy — retained, no longer called by syncFromDrive)**

| Function | Description |
|---|---|
| `showConflictModal(remoteState)` | Legacy full-screen conflict modal; no longer invoked by the sync engine; retained for potential manual use |
| `createConflictModalUI()` | Injects the conflict modal HTML into the DOM |

**Settings Controls**

| Function | Description |
|---|---|
| `connectGoogleSync()` | OAuth entry point: obtains token → fetches user email → checks for existing Drive file → silent upload if no file (no migration modal) → migration modal if file + local data exist; caches `syncDriveFileId`; calls `renderSyncMetaBadge()` |
| `disconnectGoogleSync()` | Confirms then disables sync, clears token, resets sync state fields |
| `triggerManualSync()` | Runs a full `syncFromDrive()` cycle on demand from the Settings panel |
| `saveCustomClientId()` | Applies or clears a custom OAuth Client ID from the settings form |
| `renderSyncControls()` | Renders the Connect / Sync Now / Disconnect / Reset Sync button set based on `state.syncEnabled`; calls `renderSyncMetaBadge()` |

**Onboarding, Migration & Reset**

| Function | Description |
|---|---|
| `showOnboardingModal()` | Injects the bottom-sheet onboarding modal warning about local-only data risk |
| `checkAndShowOnboardingModal()` | Gate function called from `window.onload`; fires `showOnboardingModal()` after 1.2 s if sync is off and `sessionStorage` key is absent |
| `showMigrationModal()` | Promise-based modal shown in `connectGoogleSync()` only when a Drive file already exists and local data is present; resolves to `"merge"`, `"fresh"`, or `null` |
| `resetSyncData()` | Deletes `dabbux_sync_v4.json` from Drive and resets all local sync state; local app data is preserved |
