/**
 * dashboard.js â€” Dashboard & Budget Widgets
 * TReX — Devour Your Expenses
 *
 * Budget cycle calculations, dashboard view renderer, forecast card,
 * spend heatmap, quick log system, budget alerts, daily reminders,
 * notification permissions, dashboard chart renderers (category/payment bars,
 * weekly trend line), recent activity feed.
 *
 * Dependencies: core.js must load before all other modules.
 * Global state: window.state (defined in core.js)
 */

function calculateActiveCycleRange() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    let startDate, endDate;

    if (state.cycleType === "calendar") {
        startDate = new Date(year, month, 1);
        endDate = new Date(year, month + 1, 0);
    } else {
        const customDay = parseInt(state.cycleDay) || 5;
        const activeDay = today.getDate();

        if (activeDay >= customDay) {
            startDate = new Date(year, month, customDay);
            endDate = new Date(year, month + 1, customDay - 1);
        } else {
            startDate = new Date(year, month - 1, customDay);
            endDate = new Date(year, month, customDay - 1);
        }
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
}

function calculateCycleMetrics() {
    const { startDate, endDate } = calculateActiveCycleRange();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cycleExpenses = state.transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= startDate && txDate <= endDate;
    });

    const totalSpent = cycleExpenses.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const remainingBudget = Math.max(0, state.monthlyBudget - totalSpent);

    const timeDiff = endDate.getTime() - today.getTime();
    let daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
    if (daysRemaining <= 0) daysRemaining = 1;

    const safeToSpend = remainingBudget / daysRemaining;

    return {
        startDate,
        endDate,
        totalSpent,
        remainingBudget,
        daysRemaining,
        safeToSpend
    };
}

function formatDateReadable(dateObj, { weekday = false, year = false } = {}) {
    if (!dateObj || isNaN(dateObj.getTime())) return "";
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const d = dateObj.getDate();
    const m = MONTHS[dateObj.getMonth()];
    const yy = String(dateObj.getFullYear()).slice(-2);
    let out = `${d} ${m}`;
    if (year) out += `, ${yy}`;
    if (weekday) out = `${DAYS[dateObj.getDay()]}, ${out}`;
    return out;
}

function formatDateTime(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "";
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = dateObj.getDate();
    const m = MONTHS[dateObj.getMonth()];
    const yy = String(dateObj.getFullYear()).slice(-2);
    const hh = dateObj.getHours();
    const mm = String(dateObj.getMinutes()).padStart(2, "0");
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 || 12;
    return `${d} ${m}, ${yy} Â· ${h12}:${mm} ${ampm}`;
}

/* UPDATE DOM DASHBOARD VIEW */
function updateAppDashboardView() {
    renderActiveTripBanner();
    const metrics = calculateCycleMetrics();
    const symbol = state.currencySymbol;

    document.getElementById("currentCycleLabel").textContent = `${formatDateReadable(metrics.startDate)} - ${formatDateReadable(metrics.endDate)}`;
    document.getElementById("activeBudgetSubTitle").textContent = `${state.cycleType === 'salary' ? 'PAYDAY CYCLE' : 'MONTHLY CYCLE'} Â· BUDGET RESET`;

    const noBudget = !state.monthlyBudget || state.monthlyBudget === 0;

    if (noBudget) {
        document.getElementById("budgetTotalDisplay").textContent = `Set budget`;
        document.getElementById("budgetRemainingDisplay").innerHTML =
            `<span class="text-indigo-400 text-xs font-bold cursor-pointer underline underline-offset-2" onclick="switchScreen('settings')">Tap to set your budget â†’</span>`;
        document.getElementById("budgetProgressBar").style.width = "0%";
        document.getElementById("budgetProgressBar").className = "bg-slate-700 h-full rounded-full transition-all duration-700";
        const emojiEl = document.getElementById("budgetHealthEmoji");
        if (emojiEl) emojiEl.textContent = "ðŸŽ¯";
        const overAlert = document.getElementById("overBudgetAlert");
        if (overAlert) { overAlert.classList.add("hidden"); overAlert.classList.remove("flex"); }
        document.getElementById("safeToSpendDisplay").textContent = `â€” / day`;
    } else {
        document.getElementById("budgetTotalDisplay").textContent = `${symbol}${state.monthlyBudget.toLocaleString()}`;
        document.getElementById("budgetRemainingDisplay").textContent = `${symbol}${metrics.remainingBudget.toLocaleString()}`;

        const rawPercent = (metrics.totalSpent / state.monthlyBudget) * 100;
        let progressPercent = Math.min(rawPercent, 100);

        const progressEl = document.getElementById("budgetProgressBar");
        progressEl.style.width = `${progressPercent}%`;

        if (progressPercent > 100 || rawPercent > 100) {
            progressEl.className = "bg-gradient-to-r from-rose-600 to-red-500 h-full rounded-full transition-all duration-700 shadow-sm shadow-rose-500/20";
        } else if (progressPercent > 85) {
            progressEl.className = "bg-gradient-to-r from-rose-500 to-red-500 h-full rounded-full transition-all duration-700 shadow-sm shadow-rose-500/20";
        } else if (progressPercent > 60) {
            progressEl.className = "bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-700 shadow-sm shadow-amber-500/20";
        } else {
            progressEl.className = "bg-gradient-to-r from-emerald-400 to-teal-400 h-full rounded-full transition-all duration-700 shadow-sm shadow-emerald-500/20";
        }

        // Health emoji
        const emojiEl = document.getElementById("budgetHealthEmoji");
        if (emojiEl) {
            let emoji = "ðŸ˜„";
            if (rawPercent >= 100) emoji = "ðŸ˜±";
            else if (rawPercent >= 85) emoji = "ðŸ˜°";
            else if (rawPercent >= 70) emoji = "ðŸ˜Ÿ";
            else if (rawPercent >= 50) emoji = "ðŸ˜";
            else if (rawPercent >= 25) emoji = "ðŸ™‚";
            emojiEl.textContent = emoji;
        }

        // Over-budget alert
        const overAlert = document.getElementById("overBudgetAlert");
        const overAmount = document.getElementById("overBudgetAmount");
        if (overAlert && overAmount) {
            if (metrics.totalSpent > state.monthlyBudget) {
                const excess = metrics.totalSpent - state.monthlyBudget;
                overAmount.textContent = `${symbol}${Math.round(excess).toLocaleString()}`;
                overAlert.classList.remove("hidden");
                overAlert.classList.add("flex");
            } else {
                overAlert.classList.add("hidden");
                overAlert.classList.remove("flex");
            }
        }

        document.getElementById("safeToSpendDisplay").textContent = `${symbol}${Math.round(metrics.safeToSpend).toLocaleString()} / day`;
    }

    renderForecastCard(metrics);
    checkBudgetAlerts(metrics);

    document.querySelectorAll(".current-currency-symbol").forEach(el => {
        el.textContent = symbol;
    });

    renderDashboardCategoryHorizontalBars(metrics.startDate, metrics.endDate);
    renderDashboardCategoryStackedBar(metrics.startDate, metrics.endDate);
    renderDashboardPaymentStackedBar(metrics.startDate, metrics.endDate);
    renderDashboardPaymentHorizontalBars(metrics.startDate, metrics.endDate);
    renderWeeklyTrendChartLine();
    renderRecentActivityList();
    renderRecurringExpenses();
    renderSpendHeatmap();
}

/* â”€â”€ FORECAST CARD (Feature 5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function renderForecastCard(metrics) {
    const card = document.getElementById("forecastCard");
    const sym = state.currencySymbol;

    if (metrics.totalSpent <= 0 || !state.monthlyBudget || state.monthlyBudget === 0) {
        // Explicitly overwrite all forecast card fields to "No data available"
        const noDataFields = ["forecastProjectedTotal","forecastSpentLabel","forecastBudgetLabel","forecastBurnRate","forecastDaysLeft"];
        noDataFields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "No data available"; });
        const surplusEl = document.getElementById("forecastSurplusGap");
        if (surplusEl) { surplusEl.textContent = "No data available"; surplusEl.className = "text-[11px] font-black mt-0.5 block text-slate-500"; }
        card.classList.add("hidden");
        return;
    }
    card.classList.remove("hidden");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysElapsed = Math.max(1, Math.ceil((today - metrics.startDate) / (1000 * 3600 * 24)));
    const burnRate = metrics.totalSpent / daysElapsed;
    const projected = Math.round(burnRate * (daysElapsed + metrics.daysRemaining));
    const gap = state.monthlyBudget - projected; // positive = surplus, negative = overrun
    const spentPct = Math.min(100, Math.round((metrics.totalSpent / state.monthlyBudget) * 100));

    // Determine tone
    const isOverrun = projected > state.monthlyBudget;
    const isWarning = !isOverrun && projected > state.monthlyBudget * 0.88;
    const isHealthy = !isOverrun && !isWarning;

    const toneMap = {
        overrun: {
            card: "bg-rose-950/40 border-rose-500/30",
            icon: "bg-rose-600/15 border-rose-500/30 text-rose-400",
            lucide: "trending-up",
            title: "text-rose-300",
            titleTxt: "Budget Overrun Projected",
            bar: "bg-gradient-to-r from-rose-600 to-red-500",
        },
        warning: {
            card: "bg-amber-950/35 border-amber-500/25",
            icon: "bg-amber-600/15 border-amber-500/30 text-amber-400",
            lucide: "alert-triangle",
            title: "text-amber-300",
            titleTxt: "Approaching Budget Limit",
            bar: "bg-gradient-to-r from-amber-500 to-amber-300",
        },
        healthy: {
            card: "bg-emerald-950/30 border-emerald-500/20",
            icon: "bg-emerald-600/15 border-emerald-500/25 text-emerald-400",
            lucide: "shield-check",
            title: "text-emerald-300",
            titleTxt: "On Track â€” Cycle Looking Good",
            bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
        },
    };
    const tone = isOverrun ? toneMap.overrun : isWarning ? toneMap.warning : toneMap.healthy;

    card.className = `rounded-2xl border p-4 space-y-3 ${tone.card}`;
    document.getElementById("forecastIconWrap").className = `icon-slot icon-slot-lg p-2 rounded-xl border ${tone.icon}`;
    document.getElementById("forecastIcon").setAttribute("data-lucide", tone.lucide);
    document.getElementById("forecastTitle").className = `text-[10px] font-extrabold uppercase tracking-wider ${tone.title}`;
    document.getElementById("forecastTitle").textContent = tone.titleTxt;
    document.getElementById("forecastSubtitle").textContent =
        `Based on ${sym}${Math.round(burnRate).toLocaleString()}/day avg over ${daysElapsed} day${daysElapsed !== 1 ? 's' : ''}`;

    document.getElementById("forecastProjectedTotal").textContent = `${sym}${projected.toLocaleString()}`;
    document.getElementById("forecastSpentLabel").textContent = `${sym}${metrics.totalSpent.toLocaleString()} (${spentPct}%)`;
    document.getElementById("forecastBudgetLabel").textContent = `${sym}${state.monthlyBudget.toLocaleString()}`;
    document.getElementById("forecastProgressBar").style.width = `${spentPct}%`;
    document.getElementById("forecastProgressBar").className = `h-full rounded-full transition-all duration-700 ${tone.bar}`;
    document.getElementById("forecastBurnRate").textContent = `${sym}${Math.round(burnRate).toLocaleString()}`;
    document.getElementById("forecastDaysLeft").textContent = metrics.daysRemaining;

    const surplusEl = document.getElementById("forecastSurplusGap");
    surplusEl.textContent = `${gap >= 0 ? '+' : ''}${sym}${Math.abs(gap).toLocaleString()}`;
    surplusEl.className = `text-[11px] font-black mt-0.5 block ${gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    const narrativeEl = document.getElementById("forecastNarrative");
    if (isOverrun) {
        narrativeEl.innerHTML = `At current pace, you'll exceed your budget by <strong class="text-rose-400">${sym}${Math.abs(gap).toLocaleString()}</strong> with ${metrics.daysRemaining} days left. Cut daily spend to <strong class="text-white">${sym}${Math.round(metrics.safeToSpend).toLocaleString()}/day</strong> to break even.`;
    } else if (isWarning) {
        narrativeEl.innerHTML = `You're projected to finish at <strong class="text-amber-300">${sym}${projected.toLocaleString()}</strong> â€” close to your limit. Keep daily spend under <strong class="text-white">${sym}${Math.round(metrics.safeToSpend).toLocaleString()}/day</strong> to stay safe.`;
    } else {
        narrativeEl.innerHTML = `Looking great! Projected to finish with a surplus of <strong class="text-emerald-400">${sym}${Math.abs(gap).toLocaleString()}</strong>. Current allowance is <strong class="text-white">${sym}${Math.round(metrics.safeToSpend).toLocaleString()}/day</strong>.`;
    }

    initLucideIcons(card);
}
/* â”€â”€ END FORECAST CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€ SPEND HEATMAP CALENDAR (Feature 4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function renderSpendHeatmap() {
    const grid = document.getElementById("spendHeatmapGrid");
    const tooltip = document.getElementById("heatmapTooltip");
    if (!grid) return;
    grid.innerHTML = "";

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build daily spend map for current month
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const dailySpend = {};
    state.transactions.forEach(t => {
        if (t.date && t.date.startsWith(monthKey)) {
            const day = parseInt(t.date.split('-')[2], 10);
            dailySpend[day] = (dailySpend[day] || 0) + parseFloat(t.amount || 0);
        }
    });

    const spendValues = Object.values(dailySpend).filter(v => v > 0);
    const maxSpend = spendValues.length > 0 ? Math.max(...spendValues) : 1;
    const sym = state.currencySymbol;
    const todayDate = today.getDate();

    // Color intensity based on spend relative to max this month
    function heatColor(amount) {
        if (!amount || amount === 0) return { bg: "bg-slate-800/60", border: "border-slate-800" };
        const ratio = amount / maxSpend;
        if (ratio < 0.25) return { bg: "bg-emerald-900/70", border: "border-emerald-800/50" };
        if (ratio < 0.55) return { bg: "bg-amber-700/70", border: "border-amber-600/50" };
        if (ratio < 0.80) return { bg: "bg-orange-600/80", border: "border-orange-500/50" };
        return { bg: "bg-rose-600/85", border: "border-rose-500/60" };
    }

    // Leading blank cells
    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement("div");
        blank.className = "aspect-square rounded-md";
        grid.appendChild(blank);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const spend = dailySpend[d] || 0;
        const colors = heatColor(spend);
        const isToday = d === todayDate;
        const isFuture = d > todayDate;

        const cell = document.createElement("div");
        cell.className = [
            "aspect-square rounded-md border flex items-center justify-center transition-all",
            isFuture ? "opacity-30 cursor-default" : "cursor-pointer hover:scale-110 hover:z-10 hover:ring-1 hover:ring-indigo-400/60 hover:ring-offset-1 hover:ring-offset-slate-950",
            isFuture ? "bg-slate-800/60 border-slate-800" : colors.bg,
            isFuture ? "border-slate-800" : colors.border,
            isToday ? "ring-1 ring-indigo-400 ring-offset-1 ring-offset-slate-950" : "",
            "relative"
        ].join(" ");

        cell.innerHTML = `<span class="text-[8px] font-bold ${isToday ? 'text-indigo-300' : isFuture ? 'text-slate-700' : spend > 0 ? 'text-white' : 'text-slate-600'}">${d}</span>`;

        // Tooltip on hover
        cell.addEventListener("mouseenter", () => {
            if (isFuture) { tooltip.textContent = ""; return; }
            const dateStr = formatDateReadable(new Date(year, month, d), { weekday: true });
            tooltip.textContent = spend > 0
                ? `${dateStr} â€” ${sym}${spend.toLocaleString()} spent`
                : `${dateStr} â€” No spend logged`;
        });
        cell.addEventListener("mouseleave", () => { tooltip.textContent = ""; });

        // Tap â†’ open Ledger filtered to this exact date
        cell.addEventListener("click", () => {
            if (isFuture) return;
            const pad = n => String(n).padStart(2, "0");
            const dateISO = `${year}-${pad(month + 1)}-${pad(d)}`;
            const dateStr = formatDateReadable(new Date(year, month, d), { weekday: true });
            tooltip.textContent = spend > 0
                ? `${dateStr} â€” ${sym}${spend.toLocaleString()} spent`
                : `${dateStr} â€” No spend logged`;
            openLedgerWithDate(dateISO);
        });

        grid.appendChild(cell);
    }
}
/* â”€â”€ END SPEND HEATMAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€ FEATURE 6: CUSTOMIZABLE QUICK-LOG BUTTONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const DEFAULT_QUICK_LOGS = [];

function getQuickLogs() {
    if (!state.quickLogs) state.quickLogs = DEFAULT_QUICK_LOGS.map(q => ({ ...q }));
    return state.quickLogs;
}

function renderQuickLogButtons() {
    const grid = document.getElementById("quickLogButtonsGrid");
    if (!grid) return;
    const logs = getQuickLogs();
    if (logs.length === 0) {
        grid.innerHTML = `<p class="col-span-2 text-[10px] text-slate-600 italic text-center py-2">No quick logs yet. Tap Customize to add some.</p>`;
        return;
    }
    grid.innerHTML = logs.map(q => {
        const cat = state.categories.find(c => c.id === q.categoryId) || { name: "â€”", color: "#6366f1" };
        const pay = state.payments.find(p => p.id === q.paymentId) || { name: "â€”" };
        return `
        <button onclick="triggerQuickLog(${q.amount}, '${q.categoryId}', '${q.label}', '${q.paymentId}')"
            class="bg-slate-950 hover:bg-slate-900 p-3 border border-slate-850 rounded-xl text-left flex justify-between items-center transition-all active:scale-95 gap-2">
            <div class="min-w-0 flex flex-col gap-0.5">
                <span class="text-[11px] text-slate-200 font-bold truncate">${q.label}</span>
                <span class="text-[8px] font-semibold uppercase" style="color:${cat.color}">${cat.name} Â· ${pay.name}</span>
            </div>
            <span class="text-sm font-black text-indigo-400 shrink-0">${state.currencySymbol}${parseFloat(q.amount).toLocaleString()}</span>
        </button>`;
    }).join("");
}

function openQuickLogEditor() {
    const list = document.getElementById("quickLogEditorList");
    list.innerHTML = "";
    getQuickLogs().forEach((q, i) => renderQuickLogEditorRow(q, i));
    document.getElementById("quickLogEditorModal").classList.remove("hidden");
    initLucideIcons(document.getElementById("quickLogEditorModal"));
}

function renderQuickLogEditorRow(q, i) {
    const list = document.getElementById("quickLogEditorList");
    const catOptions = state.categories.map(c => `<option value="${c.id}" ${c.id === q.categoryId ? 'selected' : ''}>${c.name}</option>`).join("");
    const payOptions = state.payments.map(p => `<option value="${p.id}" ${p.id === q.paymentId ? 'selected' : ''}>${p.name}</option>`).join("");
    const row = document.createElement("div");
    row.className = "bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2";
    row.dataset.qlid = q.id;
    row.innerHTML = `
        <div class="flex items-center gap-2">
            <input type="text" value="${q.label}" placeholder="Label" data-field="label"
                class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none font-bold" />
            <button onclick="removeQuickLogSlot('${q.id}')" class="p-1.5 text-slate-600 hover:text-rose-400 rounded transition-all shrink-0">
                <i data-lucide="trash" class="w-3.5 h-3.5"></i>
            </button>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <div class="space-y-1">
                <label class="text-[8px] text-slate-600 uppercase font-bold block">Amount</label>
                <input type="number" value="${q.amount}" data-field="amount"
                    class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none" />
            </div>
            <div class="space-y-1">
                <label class="text-[8px] text-slate-600 uppercase font-bold block">Category</label>
                <select data-field="categoryId" class="w-full app-dropdown app-dropdown-sm rounded-lg text-[9px] focus:outline-none">${catOptions}</select>
            </div>
            <div class="space-y-1">
                <label class="text-[8px] text-slate-600 uppercase font-bold block">Payment</label>
                <select data-field="paymentId" class="w-full app-dropdown app-dropdown-sm rounded-lg text-[9px] focus:outline-none">${payOptions}</select>
            </div>
        </div>`;
    list.appendChild(row);
    initLucideIcons(row);
}

function addNewQuickLogSlot() {
    const newQ = {
        id: "ql_" + Date.now(),
        label: "New Log",
        amount: 0,
        categoryId: state.categories[0]?.id || "",
        paymentId: state.payments[0]?.id || ""
    };
    getQuickLogs().push(newQ);
    renderQuickLogEditorRow(newQ, getQuickLogs().length - 1);
    initLucideIcons(document.getElementById("quickLogEditorList"));
}

function removeQuickLogSlot(id) {
    state.quickLogs = getQuickLogs().filter(q => q.id !== id);
    document.querySelector(`[data-qlid="${id}"]`)?.remove();
}

function saveAndCloseQuickLogEditor() {
    const rows = document.querySelectorAll("#quickLogEditorList [data-qlid]");
    const updated = [];
    rows.forEach(row => {
        const id = row.dataset.qlid;
        const existing = getQuickLogs().find(q => q.id === id) || {};
        updated.push({
            id,
            label: row.querySelector('[data-field="label"]').value.trim() || "Quick Log",
            amount: parseFloat(row.querySelector('[data-field="amount"]').value) || 0,
            categoryId: row.querySelector('[data-field="categoryId"]').value,
            paymentId: row.querySelector('[data-field="paymentId"]').value,
        });
    });
    state.quickLogs = updated;
    saveStateToLocalStorage();
    closeQuickLogEditor();
    renderQuickLogButtons();
    showNotification("Quick log buttons saved.");
}

function closeQuickLogEditor() {
    document.getElementById("quickLogEditorModal").classList.add("hidden");
}

/* â”€â”€ FEATURE 13: BUDGET SPEND ALERTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const ALERT_THRESHOLDS = [50, 75, 90];

function saveBudgetAlertSetting() {
    state.budgetAlertsEnabled = document.getElementById("settingBudgetAlerts").checked;
    saveStateToLocalStorage();
    if (state.budgetAlertsEnabled) {
        requestNotificationPermission(() => showNotification("Budget alerts enabled."));
    } else {
        showNotification("Budget alerts disabled.");
    }
}

function checkBudgetAlerts(metrics) {
    if (!state.budgetAlertsEnabled) return;
    if (Notification.permission !== "granted") return;
    if (!state.monthlyBudget || state.monthlyBudget <= 0) return;

    const pct = Math.round((metrics.totalSpent / state.monthlyBudget) * 100);
    const fired = state.alertsFired || [];

    ALERT_THRESHOLDS.forEach(threshold => {
        const key = `${threshold}_${new Date().getMonth()}_${new Date().getFullYear()}`;
        if (pct >= threshold && !fired.includes(key)) {
            fired.push(key);
            new Notification("TReX â€” Budget Alert ðŸ””", {
                body: `You've used ${threshold}% of your monthly budget (${state.currencySymbol}${metrics.totalSpent.toLocaleString()} of ${state.currencySymbol}${state.monthlyBudget.toLocaleString()}).`,
                icon: document.getElementById("dynamicAppleIcon")?.href || ""
            });
        }
    });

    state.alertsFired = fired;
    saveStateToLocalStorage();
}

/* â”€â”€ FEATURE 14: DAILY EXPENSE REMINDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

let _reminderTimer = null;

function getTodayLocalISO() {
    return new Date().toISOString().split("T")[0];
}

function getReminderFireDate(reference = new Date()) {
    const timeStr = state.dailyReminderTime || "21:00";
    const [hh, mm] = timeStr.split(":").map(Number);
    const fire = new Date(reference);
    fire.setHours(Number.isFinite(hh) ? hh : 21, Number.isFinite(mm) ? mm : 0, 0, 0);
    if (fire <= reference) fire.setDate(fire.getDate() + 1);
    return fire;
}

function getDailyReminderBody() {
    const today = getTodayLocalISO();
    const todayTxCount = (state.transactions || []).filter(t => t.date === today).length;
    return todayTxCount > 0
        ? `You've logged ${todayTxCount} expense${todayTxCount > 1 ? "s" : ""} today. Tap to review and make sure nothing is missing.`
        : "No expenses logged today yet. Open TReX to record and review your spending.";
}

async function showTrexBrowserNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const icon = document.querySelector('link[rel="apple-touch-icon"]')?.href || "assets/favicon.png";
    const options = { body, icon, badge: icon, tag: "trex-daily-reminder", renotify: true };

    try {
        if (navigator.serviceWorker) {
            const registration = await navigator.serviceWorker.ready;
            if (registration && registration.showNotification) {
                await registration.showNotification(title, options);
                return true;
            }
        }
    } catch (e) {
        console.warn("Service worker notification fallback:", e);
    }

    new Notification(title, options);
    return true;
}

function markDailyReminderShown() {
    state.dailyReminderLastShownDate = getTodayLocalISO();
    saveStateToLocalStorage();
}

function toggleDailyReminderSetting() {
    state.dailyReminderEnabled = document.getElementById("settingDailyReminder").checked;
    saveStateToLocalStorage();
    const timeRow = document.getElementById("dailyReminderTimeRow");
    const statusEl = document.getElementById("reminderStatusText");
    if (state.dailyReminderEnabled) {
        timeRow.style.display = "flex";
        statusEl.style.display = "block";
        requestNotificationPermission(() => {
            checkMissedDailyReminder();
            scheduleDailyReminder();
            showNotification("Daily reminder enabled.");
        });
    } else {
        timeRow.style.display = "none";
        statusEl.style.display = "none";
        clearTimeout(_reminderTimer);
        showNotification("Daily reminder disabled.");
    }
    syncNotificationSettings();
}

function saveDailyReminderTime() {
    state.dailyReminderTime = document.getElementById("settingReminderTime").value || "21:00";
    saveStateToLocalStorage();
    checkMissedDailyReminder();
    scheduleDailyReminder();
    syncNotificationSettings();
}

function scheduleDailyReminder() {
    clearTimeout(_reminderTimer);
    if (!state.dailyReminderEnabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const fire = getReminderFireDate();
    const msUntil = Math.max(1000, fire - new Date());

    const statusEl = document.getElementById("reminderStatusText");
    if (statusEl) {
        const swNote = navigator.serviceWorker ? " PWA notifications active while browser allows them." : " Browser must stay open for scheduled reminders.";
        statusEl.textContent = `Next reminder: ${formatDateReadable(fire, { weekday: true })} at ${fire.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.${swNote}`;
        statusEl.classList.remove("hidden");
    }

    _reminderTimer = setTimeout(async () => {
        const shown = await showTrexBrowserNotification("TReX - Daily Review", getDailyReminderBody());
        if (shown) markDailyReminderShown();
        scheduleDailyReminder();
    }, msUntil);
}

function checkMissedDailyReminder() {
    if (!state.dailyReminderEnabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const today = getTodayLocalISO();
    if (state.dailyReminderLastShownDate === today) return;

    const timeStr = state.dailyReminderTime || "21:00";
    const [hh, mm] = timeStr.split(":").map(Number);
    const due = new Date();
    due.setHours(Number.isFinite(hh) ? hh : 21, Number.isFinite(mm) ? mm : 0, 0, 0);
    if (new Date() < due) return;

    showTrexBrowserNotification("TReX - Missed Daily Review", getDailyReminderBody())
        .then(shown => { if (shown) markDailyReminderShown(); });
}

function sendTestReminderNotification() {
    requestNotificationPermission(async () => {
        const shown = await showTrexBrowserNotification("TReX - Test Reminder", "Notifications are working for this browser and device.");
        showNotification(shown ? "Test notification sent." : "Unable to send test notification.");
    });
}

function requestNotificationPermission(callback) {
    if (!("Notification" in window)) {
        showNotification("Notifications not supported in this browser.");
        return;
    }
    if (Notification.permission === "granted") {
        const btn = document.getElementById("notifPermissionBtn");
        if (btn) btn.style.display = "none";
        if (callback) callback();
        syncNotificationSettings();
        return;
    }
    if (Notification.permission === "denied") {
        showNotification("Notifications blocked. Enable them in browser settings.");
        syncNotificationSettings();
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm === "granted") {
            const btn = document.getElementById("notifPermissionBtn");
            if (btn) btn.style.display = "none";
            if (callback) callback();
        } else {
            showNotification("Notification permission denied.");
            const budget = document.getElementById("settingBudgetAlerts");
            const reminder = document.getElementById("settingDailyReminder");
            if (budget) budget.checked = false;
            if (reminder) reminder.checked = false;
            state.budgetAlertsEnabled = false;
            state.dailyReminderEnabled = false;
            saveStateToLocalStorage();
        }
        syncNotificationSettings();
    });
}

function syncNotificationSettings() {
    const budgetEl = document.getElementById("settingBudgetAlerts");
    const reminderEl = document.getElementById("settingDailyReminder");
    const timeRow = document.getElementById("dailyReminderTimeRow");
    const timeInput = document.getElementById("settingReminderTime");
    const statusEl = document.getElementById("reminderStatusText");
    const permBtn = document.getElementById("notifPermissionBtn");
    const testBtn = document.getElementById("testReminderBtn");

    if (budgetEl) budgetEl.checked = !!state.budgetAlertsEnabled;
    if (reminderEl) reminderEl.checked = !!state.dailyReminderEnabled;
    if (timeInput) timeInput.value = state.dailyReminderTime || "21:00";

    if (timeRow) timeRow.style.display = state.dailyReminderEnabled ? "flex" : "none";
    if (statusEl) {
        statusEl.style.display = state.dailyReminderEnabled ? "block" : "none";
        if (state.dailyReminderEnabled && (!("Notification" in window) || Notification.permission !== "granted")) {
            statusEl.textContent = "Grant notification permission to activate reminders on this device.";
        }
    }

    const needsPerm = (state.budgetAlertsEnabled || state.dailyReminderEnabled)
        && typeof Notification !== "undefined"
        && Notification.permission !== "granted";
    if (permBtn) permBtn.style.display = needsPerm ? "flex" : "none";
    if (testBtn) testBtn.style.display = (typeof Notification !== "undefined" && Notification.permission === "granted") ? "flex" : "none";
}
/* â”€â”€ END NOTIFICATION FEATURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* 1-TAP INSTANT ADD TRANSACTIONS */
function triggerQuickLog(amount, categoryId, note, paymentId) {
    const today = new Date().toISOString().split('T')[0];
    const category = state.categories.find(c => c.id === categoryId);
    const resolvedPaymentId = paymentId || (category ? (category.defaultPaymentId || state.payments[0].id) : state.payments[0].id);

    const newTx = {
        id: "tx_" + Date.now(),
        amount: parseFloat(amount),
        categoryId,
        paymentId: resolvedPaymentId,
        date: today,
        note
    };

    state.transactions.push(newTx);
    saveStateToLocalStorage();
    updateAppDashboardView();
    showNotification(`Quick Logged: ${state.currencySymbol}${amount} for "${note}"`);
}

/* STATS RENDERERS */
function renderDashboardCategoryHorizontalBars(startDate, endDate) {
    const container = document.getElementById("categoryBarsContainer");
    container.innerHTML = "";

    const catSums = {};
    state.categories.forEach(c => { catSums[c.id] = 0; });

    const cycleExpenses = state.transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= startDate && txDate <= endDate;
    });

    cycleExpenses.forEach(t => {
        if (catSums[t.categoryId] !== undefined) {
            catSums[t.categoryId] += parseFloat(t.amount || 0);
        }
    });

    const sorted = state.categories.map(c => ({
        ...c,
        total: catSums[c.id] || 0
    })).sort((a, b) => b.total - a.total);

    const maxTotal = Math.max(...sorted.map(s => s.total), 1);
    const grandTotal = sorted.reduce((s, c) => s + c.total, 0) || 1;

    sorted.forEach(cat => {
        if (cat.total === 0) return;
        const widthPercent = (cat.total / maxTotal) * 100;
        const sharePct = Math.round((cat.total / grandTotal) * 100);

        const row = document.createElement("div");
        row.className = "space-y-1.5";
        row.innerHTML = `
            <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-300 font-semibold flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full animate-pulse" style="background-color: ${cat.color}"></span>
                    ${cat.name}
                </span>
                <span class="flex items-center gap-1.5">
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style="color:${cat.color};background-color:${cat.color}18">${sharePct}%</span>
                    <span class="text-slate-100 font-extrabold">${state.currencySymbol}${cat.total.toLocaleString()}</span>
                </span>
            </div>
            <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900/80">
                <div class="h-full rounded-full transition-all duration-700" style="width: ${widthPercent}%; background-color: ${cat.color}"></div>
            </div>
        `;
        container.appendChild(row);
    });

    if (container.children.length === 0) {
        container.innerHTML = `<p class="text-[10px] text-slate-500 text-center py-2 italic">No category expenditures noted this cycle.</p>`;
    }
}

function renderDashboardCategoryStackedBar(startDate, endDate) {
    const bar = document.getElementById("stackedCategoryBar");
    const legend = document.getElementById("stackedCategoryLegend");
    if (!bar) return;
    bar.innerHTML = "";
    if (legend) legend.innerHTML = "";

    const catSums = {};
    state.categories.forEach(c => { catSums[c.id] = 0; });

    const cycleExpenses = state.transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= startDate && txDate <= endDate;
    });
    cycleExpenses.forEach(t => {
        if (catSums[t.categoryId] !== undefined) {
            catSums[t.categoryId] += parseFloat(t.amount || 0);
        }
    });

    const cycleTotalSpent = Object.values(catSums).reduce((a, b) => a + b, 0);

    if (cycleTotalSpent === 0) {
        bar.innerHTML = `<div class="w-full h-full bg-slate-800 rounded-full"></div>`;
        return;
    }

    const sorted = state.categories
        .map(c => ({ ...c, total: catSums[c.id] || 0 }))
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total);

    sorted.forEach((cat, i) => {
        const percent = (cat.total / cycleTotalSpent) * 100;
        const section = document.createElement("div");
        section.style.width = `${percent}%`;
        section.style.backgroundColor = cat.color;
        section.className = "h-full transition-all duration-300" +
            (i === 0 ? " rounded-l-full" : "") +
            (i === sorted.length - 1 ? " rounded-r-full" : "");
        section.title = `${cat.name}: ${Math.round(percent)}%`;
        bar.appendChild(section);
    });
}

function renderDashboardPaymentStackedBar(startDate, endDate) {
    const bar = document.getElementById("stackedPaymentBar");
    if (!bar) return;
    bar.innerHTML = "";

    const paySums = {};
    state.payments.forEach(p => { paySums[p.id] = 0; });

    const cycleExpenses = state.transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= startDate && txDate <= endDate;
    });

    cycleExpenses.forEach(t => {
        if (paySums[t.paymentId] !== undefined) {
            paySums[t.paymentId] += parseFloat(t.amount || 0);
        }
    });

    const cycleTotalSpent = Object.values(paySums).reduce((a, b) => a + b, 0);

    if (cycleTotalSpent === 0) {
        bar.innerHTML = `<div class="w-full h-full bg-slate-800 rounded-full"></div>`;
        return;
    }

    state.payments.forEach(pay => {
        const total = paySums[pay.id] || 0;
        if (total === 0) return;

        const percent = (total / cycleTotalSpent) * 100;
        const section = document.createElement("div");
        section.style.width = `${percent}%`;
        section.style.backgroundColor = pay.color;
        section.className = "h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full";
        section.title = `${pay.name}: ${Math.round(percent)}%`;
        bar.appendChild(section);
    });
}

function renderDashboardPaymentHorizontalBars(startDate, endDate) {
    const container = document.getElementById("paymentBarsContainer");
    if (!container) return;
    container.innerHTML = "";

    const paySums = {};
    state.payments.forEach(p => { paySums[p.id] = 0; });

    const cycleExpenses = state.transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= startDate && txDate <= endDate;
    });

    cycleExpenses.forEach(t => {
        if (paySums[t.paymentId] !== undefined) {
            paySums[t.paymentId] += parseFloat(t.amount || 0);
        }
    });

    const sorted = state.payments.map(p => ({
        ...p,
        total: paySums[p.id] || 0
    })).sort((a, b) => b.total - a.total);

    const maxTotal = Math.max(...sorted.map(s => s.total), 1);
    const grandTotal = sorted.reduce((s, p) => s + p.total, 0) || 1;

    sorted.forEach(pay => {
        if (pay.total === 0) return;
        const widthPercent = (pay.total / maxTotal) * 100;
        const sharePct = Math.round((pay.total / grandTotal) * 100);

        const row = document.createElement("div");
        row.className = "space-y-1.5";
        row.innerHTML = `
            <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-300 font-semibold flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${pay.color}"></span>
                    <span class="truncate">${pay.name}</span>
                    <span class="text-[9px] text-slate-500 font-bold uppercase shrink-0">${pay.type}</span>
                </span>
                <span class="flex items-center gap-1.5 shrink-0 ml-2">
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style="color:${pay.color};background-color:${pay.color}18">${sharePct}%</span>
                    <span class="text-slate-100 font-extrabold">${state.currencySymbol}${pay.total.toLocaleString()}</span>
                </span>
            </div>
            <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900/80">
                <div class="h-full rounded-full transition-all duration-700" style="width: ${widthPercent}%; background-color: ${pay.color}"></div>
            </div>
        `;
        container.appendChild(row);
    });

    if (container.children.length === 0) {
        container.innerHTML = `<p class="text-[10px] text-slate-500 text-center py-2 italic">No payment channel activity logged.</p>`;
    }
}

/* TREND ANALYSIS CHARTING */
function setTrendPeriod(period) {
    activeTrendPeriod = period;

    const weeklyBtn = document.getElementById("trendWeeklyBtn");
    const monthlyBtn = document.getElementById("trendMonthlyBtn");

    if (period === 'weekly') {
        weeklyBtn.className = "px-2.5 py-1 rounded-md text-[9px] font-black transition-all bg-indigo-600 text-white";
        monthlyBtn.className = "px-2.5 py-1 rounded-md text-[9px] font-black transition-all text-slate-400 hover:text-white";
    } else {
        weeklyBtn.className = "px-2.5 py-1 rounded-md text-[9px] font-black transition-all text-slate-400 hover:text-white";
        monthlyBtn.className = "px-2.5 py-1 rounded-md text-[9px] font-black transition-all bg-indigo-600 text-white";
    }

    renderWeeklyTrendChartLine();
}

function renderWeeklyTrendChartLine() {
    const canvasEl = document.getElementById("weeklyTrendChart");
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");

    const labels = [];
    const rawDates = [];
    const daysToTrack = activeTrendPeriod === "weekly" ? 7 : 30;

    for (let i = daysToTrack - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);

        if (activeTrendPeriod === "weekly") {
            labels.push(formatDateReadable(d, { weekday: true }));
        } else {
            labels.push(formatDateReadable(d));
        }

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        rawDates.push(`${year}-${month}-${date}`);
    }

    const points = rawDates.map(isoStr => {
        return state.transactions
            .filter(t => t.date === isoStr)
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    });

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: points,
                borderColor: '#6366f1',
                borderWidth: 2,
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#818cf8',
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 8, weight: 'bold' },
                        callback: function (value) { return state.currencySymbol + value; }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#64748b',
                        font: { size: 8, weight: 'bold' },
                        autoSkip: true,
                        maxTicksLimit: activeTrendPeriod === "weekly" ? 7 : 8
                    }
                }
            }
        }
    });
}

function renderRecentActivityList() {
    const container = document.getElementById("recentTransactionsList");
    if (!container) return;
    container.innerHTML = "";

    const sorted = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const limit = sorted.slice(0, 4);

    if (limit.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-4 bg-slate-900/20 rounded-xl border border-slate-850">Tap "+ Add Expense" to begin tracking.</p>`;
        return;
    }

    limit.forEach(tx => {
        const cat = state.categories.find(c => c.id === tx.categoryId) || { name: "Other", color: "#64748b" };
        const pay = state.payments.find(p => p.id === tx.paymentId) || { name: "Cash" };
        const dateText = formatDateReadable(new Date(tx.date), { year: '2-digit' });

        const card = document.createElement("div");
        card.className = "bg-slate-900/60 hover:bg-slate-850 border border-slate-900 rounded-2xl px-3 py-3 flex justify-between items-stretch gap-2 transition-all cursor-pointer active:scale-[0.99]";
        card.onclick = () => loadExpenseToFormForEdit(tx.id);

        card.innerHTML = `
            <div class="flex items-stretch gap-2.5 min-w-0 flex-1">
                <span class="w-1 self-stretch rounded-full shrink-0" style="background-color: ${cat.color}"></span>
                <div class="min-w-0 flex-1 space-y-1 py-0.5">
                    <span class="text-[11px] font-bold text-slate-100 block truncate">${tx.note || cat.name}</span>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0" style="background-color:${cat.color}22; color:${cat.color}">
                            <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color:${cat.color}"></span>
                            <span class="truncate max-w-[68px]">${cat.name}</span>
                        </span>
                        <span class="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 shrink-0">
                            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="14" height="10" rx="2"/><path d="M1 7h14"/><path d="M5 1v3M11 1v3"/></svg>
                            <span class="truncate max-w-[68px]">${pay.name}</span>
                        </span>
                        <span class="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-950 text-slate-500 shrink-0">
                            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="2" width="14" height="13" rx="2"/><path d="M1 6h14"/><path d="M5 1v2M11 1v2"/></svg>
                            ${dateText}
                        </span>
                    </div>
                </div>
            </div>
            <span class="text-xs font-black text-indigo-300 shrink-0 ml-1 self-center">${state.currencySymbol}${tx.amount.toLocaleString()}</span>
        `;
        container.appendChild(card);
    });
}