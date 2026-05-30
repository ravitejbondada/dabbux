/**
 * reports.js — Analytics & Reports
 * TReX - Devour Your Expenses
 *
 * Chart helpers (doughnut, bar, gauge, tooltip), premium report charts,
 * report mode toggle (charts / accordion / MoM), historical month report,
 * accordion list view, month-over-month comparison renderer.
 *
 * Dependencies: core.js must load before all other modules.
 * Global state: window.state (defined in core.js)
 */


/* GRAPHICAL ANALYTICAL COMPILERS */
const REPORT_CHART_FONT = "'Plus Jakarta Sans', sans-serif";

function destroyReportChart(instance) {
    if (instance) instance.destroy();
    return null;
}

function resizeReportCharts() {
    [reportsCategoryChartInstance, reportsPaymentChartInstance, reportsBarChartInstance, reportGaugeChartInstance]
        .forEach(ch => { if (ch) ch.resize(); });
}

function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function premiumChartTooltip() {
    return {
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        titleColor: "#e2e8f0",
        bodyColor: "#cbd5e1",
        borderColor: "rgba(99, 102, 241, 0.35)",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        titleFont: { family: REPORT_CHART_FONT, size: 11, weight: "700" },
        bodyFont: { family: REPORT_CHART_FONT, size: 11, weight: "600" },
        displayColors: true,
        boxPadding: 4
    };
}

function renderPremiumDoughnut(canvasId, labels, values, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    const bgColors = colors.map(c => hexToRgba(c, 0.88));
    const hoverColors = colors.map(c => hexToRgba(c, 1));

    return new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: bgColors,
                hoverBackgroundColor: hoverColors,
                borderColor: "#020617",
                borderWidth: 2,
                hoverBorderColor: "#1e293b",
                hoverOffset: 10,
                spacing: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            layout: { padding: 4 },
            animation: { animateRotate: true, animateScale: true, duration: 700, easing: "easeOutQuart" },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "#94a3b8",
                        font: { family: REPORT_CHART_FONT, size: 9, weight: "600" },
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: "circle",
                        boxWidth: 6
                    }
                },
                tooltip: {
                    ...premiumChartTooltip(),
                    callbacks: {
                        label(ctx) {
                            const v = ctx.parsed || 0;
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                            return ` ${state.currencySymbol}${v.toLocaleString()} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderPremiumBarChart(labels, values, colors) {
    const canvas = document.getElementById("reportBarChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const sorted = labels.map((name, i) => ({ name, value: values[i], color: colors[i] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

    const gradColors = sorted.map(item => {
        const g = ctx.createLinearGradient(0, 0, 320, 0);
        g.addColorStop(0, hexToRgba(item.color, 0.95));
        g.addColorStop(1, hexToRgba(item.color, 0.35));
        return g;
    });

    return new Chart(ctx, {
        type: "bar",
        data: {
            labels: sorted.map(s => s.name),
            datasets: [{
                data: sorted.map(s => s.value),
                backgroundColor: gradColors.length ? gradColors : sorted.map(s => s.color),
                borderRadius: 8,
                borderSkipped: false,
                maxBarThickness: 22
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 650, easing: "easeOutQuart" },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...premiumChartTooltip(),
                    callbacks: {
                        label(ctx) {
                            return ` ${state.currencySymbol}${(ctx.parsed.x || 0).toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
                    ticks: {
                        color: "#64748b",
                        font: { family: REPORT_CHART_FONT, size: 8, weight: "600" },
                        callback: v => state.currencySymbol + (v >= 1000 ? Math.round(v / 1000) + "k" : v)
                    }
                },
                y: {
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        color: "#94a3b8",
                        font: { family: REPORT_CHART_FONT, size: 9, weight: "600" }
                    }
                }
            }
        }
    });
}

function renderReportGauge(spent, budget) {
    const canvas = document.getElementById("reportGaugeChart");
    if (!canvas) return;

    reportGaugeChartInstance = destroyReportChart(reportGaugeChartInstance);
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const remain = Math.max(0, 100 - pct);
    const color = pct > 85 ? "#f43f5e" : pct > 60 ? "#f59e0b" : "#34d399";

    reportGaugeChartInstance = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
            datasets: [{
                data: [pct, remain],
                backgroundColor: [color, "rgba(100, 116, 139, 0.2)"],
                borderWidth: 0,
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: "72%",
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            animation: { animateRotate: true, duration: 600 }
        },
        plugins: [{
            id: "gaugeCenterText",
            afterDraw(chart) {
                const { ctx, chartArea } = chart;
                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2 + 6;
                ctx.save();
                ctx.font = "bold 11px " + REPORT_CHART_FONT;
                ctx.fillStyle = "#e2e8f0";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(pct + "%", centerX, centerY);
                ctx.restore();
            }
        }]
    });
}

function renderPremiumReportCharts(catLabels, catValues, catColors, payLabels, payValues, payColors) {
    reportsCategoryChartInstance = destroyReportChart(reportsCategoryChartInstance);
    reportsPaymentChartInstance = destroyReportChart(reportsPaymentChartInstance);
    reportsBarChartInstance = destroyReportChart(reportsBarChartInstance);

    const chartsEmptyEl = document.getElementById("reportChartsEmptyState");
    const chartsBodyEl = document.getElementById("reportChartsBody");
    const hasData = catLabels.length > 0 || payLabels.length > 0;

    if (!hasData) {
        if (chartsEmptyEl) chartsEmptyEl.classList.remove("hidden");
        if (chartsBodyEl) chartsBodyEl.classList.add("hidden");
        renderReportTopCategories([], [], []);
        return;
    }
    if (chartsEmptyEl) chartsEmptyEl.classList.add("hidden");
    if (chartsBodyEl) chartsBodyEl.classList.remove("hidden");

    if (catLabels.length > 0) {
        reportsCategoryChartInstance = renderPremiumDoughnut("reportCategoryChart", catLabels, catValues, catColors);
    }
    if (payLabels.length > 0) {
        reportsPaymentChartInstance = renderPremiumDoughnut("reportPaymentChart", payLabels, payValues, payColors);
    }
    if (catLabels.length > 0) {
        reportsBarChartInstance = renderPremiumBarChart(catLabels, catValues, catColors);
    }
    renderReportTopCategories(catLabels, catValues, catColors);
}

function renderReportTopCategories(labels, values, colors) {
    const list = document.getElementById("reportTopCategoriesList");
    if (!list) return;
    if (labels.length === 0) {
        list.innerHTML = "";
        return;
    }
    const pairs = labels.map((n, i) => ({ name: n, value: values[i], color: colors[i] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 4);
    const total = pairs.reduce((s, p) => s + p.value, 0);
    list.innerHTML = pairs.map(p => {
        const share = total > 0 ? Math.round((p.value / total) * 100) : 0;
        return `
        <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div class="flex items-center gap-1.5 mb-1.5">
                <span class="w-2 h-2 rounded-full shrink-0 animate-pulse" style="background:${p.color}"></span>
                <span class="text-[9px] font-bold text-slate-200 truncate">${p.name}</span>
            </div>
            <span class="text-[11px] font-black text-white block">${state.currencySymbol}${p.value.toLocaleString()}</span>
            <span class="text-[8px] text-slate-500 font-bold mt-1 block">${share}% of top spend</span>
        </div>`;
    }).join("");
}

function toggleReportMode(mode) {
    activeReportViewMode = mode;
    const chartsBtn = document.getElementById("reportModeChartsBtn");
    const accordionBtn = document.getElementById("reportModeAccordionBtn");
    const momBtn = document.getElementById("reportModeMomBtn");

    const chartsContainer = document.getElementById("reportChartsContainer");
    const accordionContainer = document.getElementById("reportAccordionContainer");
    const momContainer = document.getElementById("reportMomContainer");

    const activeClass = "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all bg-indigo-600 text-white flex items-center justify-center gap-1";
    const inactiveClass = "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all text-slate-400 hover:text-white flex items-center justify-center gap-1";

    chartsBtn.className = inactiveClass;
    accordionBtn.className = inactiveClass;
    momBtn.className = inactiveClass;
    chartsContainer.classList.add("hidden");
    accordionContainer.classList.add("hidden");
    momContainer.classList.add("hidden");

    if (mode === 'charts') {
        chartsBtn.className = activeClass;
        chartsContainer.classList.remove("hidden");
        setTimeout(() => { resizeReportCharts(); renderHistoricalMonthReport(); }, 60);
    } else if (mode === 'accordion') {
        accordionBtn.className = activeClass;
        accordionContainer.classList.remove("hidden");
        renderAccordionReportList();
    } else if (mode === 'mom') {
        momBtn.className = activeClass;
        momContainer.classList.remove("hidden");
        populateMomCycleSelectors();
        setTimeout(renderMomReport, 60);
    }
}

function renderHistoricalMonthReport() {
    const symbol = state.currencySymbol;
    const chartsEmptyEl = document.getElementById("reportChartsEmptyState");
    const chartsBodyEl = document.getElementById("reportChartsBody");

    // Guard: no transactions — prevent all Chart.js execution
    if (!state.transactions || state.transactions.length === 0) {
        reportsCategoryChartInstance = destroyReportChart(reportsCategoryChartInstance);
        reportsPaymentChartInstance = destroyReportChart(reportsPaymentChartInstance);
        reportsBarChartInstance = destroyReportChart(reportsBarChartInstance);
        reportGaugeChartInstance = destroyReportChart(reportGaugeChartInstance);
        if (chartsEmptyEl) chartsEmptyEl.classList.remove("hidden");
        if (chartsBodyEl) chartsBodyEl.classList.add("hidden");
        document.getElementById("reportAllocatedSpan").textContent = `${symbol}0`;
        document.getElementById("reportSpentSpan").textContent = `${symbol}0`;
        document.getElementById("reportLeftoverSpan").textContent = `${symbol}0`;
        document.getElementById("reportSummaryText").innerHTML = `<span class="text-slate-500 italic">No data available for displaying graphs.</span>`;
        return;
    }

    // Dynamic cycle selector: derive key from selector value
    const selectorVal = document.getElementById("reportCycleSelector").value;
    let cycleKey = null;

    // Parse "Month YYYY" label → "YYYY-MM" key
    if (selectorVal) {
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const parts = selectorVal.trim().split(" ");
        if (parts.length === 2) {
            const moIdx = months.indexOf(parts[0]);
            if (moIdx !== -1) cycleKey = `${parts[1]}-${String(moIdx + 1).padStart(2, "0")}`;
        }
    }

    // Fallback: current month
    if (!cycleKey) {
        const now = new Date();
        cycleKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const cycleTransactions = state.transactions.filter(t => t.date && t.date.startsWith(cycleKey));
    const currentLimit = state.monthlyBudget || 0;
    const totalSpent = cycleTransactions.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const surplus = Math.max(0, currentLimit - totalSpent);

    document.getElementById("reportAllocatedSpan").textContent = `${symbol}${currentLimit.toLocaleString()}`;
    document.getElementById("reportSpentSpan").textContent = `${symbol}${totalSpent.toLocaleString()}`;
    document.getElementById("reportLeftoverSpan").textContent = `${symbol}${surplus.toLocaleString()}`;

    // Cycle-specific summary text
    const isCurrentMonth = (() => {
        const now = new Date();
        return cycleKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();

    if (isCurrentMonth) {
        const metrics = calculateCycleMetrics();
        document.getElementById("reportSummaryText").innerHTML =
            `Currently tracking this cycle. Safe remaining balance is <strong class="text-emerald-400 font-bold">${symbol}${metrics.remainingBudget.toLocaleString()}</strong>. Ensure your burn velocity remains in line with projections.`;
    } else if (cycleTransactions.length === 0) {
        document.getElementById("reportSummaryText").innerHTML =
            `<span class="text-slate-500 italic">No transactions recorded for this cycle.</span>`;
    } else {
        document.getElementById("reportSummaryText").innerHTML =
            `Cycle completed with <strong class="text-white">${symbol}${totalSpent.toLocaleString()}</strong> spent${currentLimit > 0 ? ` out of <strong class="text-slate-300">${symbol}${currentLimit.toLocaleString()}</strong> budget` : ""}. Surplus: <strong class="text-emerald-400 font-bold">${symbol}${surplus.toLocaleString()}</strong>.`;
    }

    const catSums = {};
    state.categories.forEach(c => { catSums[c.name] = { sum: 0, color: c.color }; });
    cycleTransactions.forEach(t => {
        const categoryObj = state.categories.find(c => c.id === t.categoryId);
        if (categoryObj && catSums[categoryObj.name]) {
            catSums[categoryObj.name].sum += parseFloat(t.amount || 0);
        }
    });

    const catLabels = [], catValues = [], catColors = [];
    Object.keys(catSums).forEach(k => {
        if (catSums[k].sum > 0) {
            catLabels.push(k);
            catValues.push(catSums[k].sum);
            catColors.push(catSums[k].color);
        }
    });

    const paySums = {};
    state.payments.forEach(p => { paySums[p.name] = { sum: 0, color: p.color }; });
    cycleTransactions.forEach(t => {
        const paymentObj = state.payments.find(p => p.id === t.paymentId);
        if (paymentObj && paySums[paymentObj.name]) {
            paySums[paymentObj.name].sum += parseFloat(t.amount || 0);
        }
    });
    const payLabels = [], payValues = [], payColors = [];
    Object.keys(paySums).forEach(k => {
        if (paySums[k].sum > 0) {
            payLabels.push(k);
            payValues.push(paySums[k].sum);
            payColors.push(paySums[k].color);
        }
    });

    renderReportGauge(totalSpent, currentLimit);

    if (activeReportViewMode === "charts") {
        renderPremiumReportCharts(catLabels, catValues, catColors, payLabels, payValues, payColors);
        setTimeout(resizeReportCharts, 100);
    }

    if (activeReportViewMode === "accordion") {
        renderAccordionReportList();
    }
}

function renderAccordionReportList() {
    const selectorVal = document.getElementById("reportCycleSelector").value;
    const accordionView = document.getElementById("accordionListView");
    accordionView.innerHTML = "";

    // Dynamic cycle key from selector label
    let cycleKey = null;
    if (selectorVal) {
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const parts = selectorVal.trim().split(" ");
        if (parts.length === 2) {
            const moIdx = months.indexOf(parts[0]);
            if (moIdx !== -1) cycleKey = `${parts[1]}-${String(moIdx + 1).padStart(2, "0")}`;
        }
    }
    if (!cycleKey) {
        const now = new Date();
        cycleKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const cycleTransactions = (!state.transactions || state.transactions.length === 0)
        ? []
        : state.transactions.filter(t => t.date && t.date.startsWith(cycleKey));

    state.categories.forEach(cat => {
        const catTxs = cycleTransactions.filter(t => t.categoryId === cat.id);
        const totalOutlay = catTxs.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        if (catTxs.length === 0) return;

        const accordionId = `accordion_item_${cat.id}`;
        const innerListId = `accordion_list_${cat.id}`;
        const iconId = `accordion_icon_${cat.id}`;

        const wrapper = document.createElement("div");
        wrapper.className = "bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden";
        wrapper.innerHTML = `
            <div class="p-4 flex justify-between items-center cursor-pointer select-none hover:bg-slate-850/50" onclick="toggleAccordionItem('${innerListId}', '${iconId}')">
                <div class="flex items-center gap-2.5">
                    <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${cat.color}"></span>
                    <span class="text-xs font-extrabold text-slate-200">${cat.name}</span>
                    <span class="text-[9px] px-1.5 py-0.5 bg-slate-950 text-slate-500 rounded font-bold">${catTxs.length} items</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-white">${state.currencySymbol}${totalOutlay.toLocaleString()}</span>
                    <i data-lucide="chevron-down" id="${iconId}" class="w-4 h-4 text-slate-500 transition-transform duration-200"></i>
                </div>
            </div>
            <div id="${innerListId}" class="hidden bg-slate-950/40 divide-y divide-slate-900 border-t border-slate-900">
            </div>
        `;

        const listContainer = wrapper.querySelector(`#${innerListId}`);
        catTxs.forEach(tx => {
            const pay = state.payments.find(p => p.id === tx.paymentId) || { name: "Cash" };
            const dText = formatDateReadable(new Date(tx.date));
            const row = document.createElement("div");
            row.className = "p-3.5 flex justify-between items-center text-[11px]";
            row.innerHTML = `
                <div class="min-w-0 pr-2">
                    <span class="text-slate-300 font-medium block truncate max-w-[190px]">${tx.note || 'No comment noted'}</span>
                    <span class="text-[9px] text-slate-500 block mt-0.5">${dText} &bull; ${pay.name}</span>
                </div>
                <span class="font-bold text-slate-400 shrink-0">${state.currencySymbol}${tx.amount.toLocaleString()}</span>
            `;
            listContainer.appendChild(row);
        });

        accordionView.appendChild(wrapper);
    });

    if (accordionView.children.length === 0) {
        accordionView.innerHTML = `<p class="text-[10px] text-slate-500 text-center py-4 italic">No transactions cataloged for this period.</p>`;
    } else {
        initLucideIcons();
    }
}

function toggleAccordionItem(listId, iconId) {
    const list = document.getElementById(listId);
    const icon = document.getElementById(iconId);
    if (list.classList.contains("hidden")) {
        list.classList.remove("hidden");
        icon.style.transform = "rotate(180deg)";
    } else {
        list.classList.add("hidden");
        icon.style.transform = "rotate(0deg)";
    }
}

/* ── MONTH-OVER-MONTH ENGINE ─────────────────────────────────────── */

let momGroupedBarInstance = null;
let momTrendLineInstance = null;

// Returns sorted array of { key: "2026-05", label: "May 2026" } from all transactions
function getMomAvailableCycles() {
    // Guard: if no transactions, return empty list (no phantom months)
    if (!state.transactions || state.transactions.length === 0) return [];

    const seen = new Set();
    state.transactions.forEach(t => {
        if (t.date && t.date.length >= 7) seen.add(t.date.substring(0, 7));
    });

    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return Array.from(seen)
        .sort((a, b) => b.localeCompare(a))
        .map(key => {
            const [yr, mo] = key.split("-");
            return { key, label: `${months[parseInt(mo, 10) - 1]} ${yr}` };
        });
}

function populateMomCycleSelectors() {
    const cycles = getMomAvailableCycles();

    // Guard: no data — clear all selectors
    if (cycles.length === 0) {
        ["momCycleA", "momCycleB", "momCycleC"].forEach(selId => {
            const sel = document.getElementById(selId);
            if (sel) sel.innerHTML = "";
        });
        return;
    }

    ["momCycleA", "momCycleB", "momCycleC"].forEach((selId, idx) => {
        const sel = document.getElementById(selId);
        const prev = sel.value;
        sel.innerHTML = "";
        if (idx === 2) {
            const none = document.createElement("option");
            none.value = "";
            none.textContent = "— None —";
            sel.appendChild(none);
        }
        cycles.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.key;
            opt.textContent = c.label;
            sel.appendChild(opt);
        });
        // Default selections: A = current, B = prev month, C = none
        if (!prev) {
            if (idx === 0 && cycles[0]) sel.value = cycles[0].key;
            if (idx === 1 && cycles[1]) sel.value = cycles[1].key;
            if (idx === 2) sel.value = "";
        } else {
            sel.value = prev || "";
        }
    });
}

function getTxForCycle(cycleKey) {
    if (!cycleKey) return [];
    return state.transactions.filter(t => t.date && t.date.startsWith(cycleKey));
}

function sumByCategory(txs) {
    const map = {};
    state.categories.forEach(c => { map[c.id] = 0; });
    txs.forEach(t => {
        if (map[t.categoryId] !== undefined) map[t.categoryId] += parseFloat(t.amount || 0);
    });
    return map;
}

function cycleLabelFromKey(key) {
    if (!key) return "—";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const [yr, mo] = key.split("-");
    return `${months[parseInt(mo, 10) - 1]} '${yr.slice(2)}`;
}

function renderMomReport() {
    const keyA = document.getElementById("momCycleA").value;
    const keyB = document.getElementById("momCycleB").value;
    const keyC = document.getElementById("momCycleC").value;

    if (!keyA || !keyB) return;

    const txA = getTxForCycle(keyA);
    const txB = getTxForCycle(keyB);
    const txC = keyC ? getTxForCycle(keyC) : null;

    // Empty state: no data in any selected cycle
    const momContentEl = document.getElementById("momContent");
    const momEmptyEl = document.getElementById("momEmptyState");
    const hasData = txA.length > 0 || txB.length > 0 || (txC && txC.length > 0);
    if (!hasData) {
        if (momEmptyEl) momEmptyEl.classList.remove("hidden");
        if (momContentEl) momContentEl.classList.add("hidden");
        return;
    }
    if (momEmptyEl) momEmptyEl.classList.add("hidden");
    if (momContentEl) momContentEl.classList.remove("hidden");

    const totalA = txA.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalB = txB.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalC = txC ? txC.reduce((s, t) => s + parseFloat(t.amount || 0), 0) : null;

    const sym = state.currencySymbol;
    const labelA = cycleLabelFromKey(keyA);
    const labelB = cycleLabelFromKey(keyB);
    const labelC = keyC ? cycleLabelFromKey(keyC) : null;

    // Totals row
    const totalsRow = document.getElementById("momTotalsRow");
    const cycleColors = ["#6366f1", "#06b6d4", "#10b981"];
    const cycles = [
        { label: labelA, total: totalA, color: cycleColors[0] },
        { label: labelB, total: totalB, color: cycleColors[1] },
        ...(totalC !== null ? [{ label: labelC, total: totalC, color: cycleColors[2] }] : [])
    ];
    totalsRow.className = `grid gap-2 ${cycles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`;
    totalsRow.innerHTML = cycles.map(c => `
        <div class="bg-slate-900/60 border rounded-xl p-3 text-center" style="border-color: ${c.color}33">
            <span class="text-[8px] font-extrabold uppercase tracking-widest block mb-1" style="color:${c.color}">${c.label}</span>
            <span class="text-sm font-black text-white block">${sym}${c.total.toLocaleString()}</span>
            <span class="text-[8px] text-slate-500 font-bold">${getTxForCycle(c.label).length || '—'} txns</span>
        </div>
    `).join("");

    // Delta banner (A vs B)
    const delta = totalA - totalB;
    const deltaPct = totalB > 0 ? Math.round(Math.abs(delta) / totalB * 100) : 0;
    const deltaBanner = document.getElementById("momDeltaBanner");
    const deltaText = document.getElementById("momDeltaText");
    const deltaIcon = document.getElementById("momDeltaIcon");
    deltaBanner.classList.remove("hidden");

    if (delta > 0) {
        deltaBanner.className = "bg-rose-950/40 border border-rose-500/25 rounded-2xl p-3.5 flex items-start gap-3";
        deltaIcon.setAttribute("data-lucide", "trending-up");
        deltaText.innerHTML = `<strong class="text-rose-400">${labelA}</strong> spending was <strong class="text-rose-300">${sym}${Math.abs(delta).toLocaleString()} (+${deltaPct}%) higher</strong> than <strong class="text-slate-200">${labelB}</strong>. Consider reviewing top categories for reduction opportunities.`;
    } else if (delta < 0) {
        deltaBanner.className = "bg-emerald-950/40 border border-emerald-500/25 rounded-2xl p-3.5 flex items-start gap-3";
        deltaIcon.setAttribute("data-lucide", "trending-down");
        deltaText.innerHTML = `<strong class="text-emerald-400">${labelA}</strong> spending was <strong class="text-emerald-300">${sym}${Math.abs(delta).toLocaleString()} (-${deltaPct}%) lower</strong> than <strong class="text-slate-200">${labelB}</strong>. Great improvement in spend discipline!`;
    } else {
        deltaBanner.className = "bg-slate-900/50 border border-slate-700 rounded-2xl p-3.5 flex items-start gap-3";
        deltaIcon.setAttribute("data-lucide", "minus");
        deltaText.innerHTML = `Spending in <strong class="text-white">${labelA}</strong> and <strong class="text-white">${labelB}</strong> was identical at <strong>${sym}${totalA.toLocaleString()}</strong>.`;
    }
    initLucideIcons(deltaBanner);

    // Category data for charts
    const catSumsA = sumByCategory(txA);
    const catSumsB = sumByCategory(txB);
    const catSumsC = txC ? sumByCategory(txC) : null;

    // Only include categories that have spend in at least one cycle
    const activeCats = state.categories.filter(c =>
        (catSumsA[c.id] || 0) + (catSumsB[c.id] || 0) + (catSumsC ? (catSumsC[c.id] || 0) : 0) > 0
    );

    // Grouped bar chart
    if (momGroupedBarInstance) { momGroupedBarInstance.destroy(); momGroupedBarInstance = null; }
    const barCanvas = document.getElementById("momGroupedBarChart");
    if (barCanvas && activeCats.length > 0) {
        const datasets = [
            {
                label: labelA,
                data: activeCats.map(c => catSumsA[c.id] || 0),
                backgroundColor: hexToRgba("#6366f1", 0.85),
                borderColor: "#6366f1",
                borderWidth: 1,
                borderRadius: 5,
                borderSkipped: false,
            },
            {
                label: labelB,
                data: activeCats.map(c => catSumsB[c.id] || 0),
                backgroundColor: hexToRgba("#06b6d4", 0.85),
                borderColor: "#06b6d4",
                borderWidth: 1,
                borderRadius: 5,
                borderSkipped: false,
            },
        ];
        if (catSumsC) {
            datasets.push({
                label: labelC,
                data: activeCats.map(c => catSumsC[c.id] || 0),
                backgroundColor: hexToRgba("#10b981", 0.85),
                borderColor: "#10b981",
                borderWidth: 1,
                borderRadius: 5,
                borderSkipped: false,
            });
        }

        momGroupedBarInstance = new Chart(barCanvas.getContext("2d"), {
            type: "bar",
            data: { labels: activeCats.map(c => c.name), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: "easeOutQuart" },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: "#94a3b8",
                            font: { family: REPORT_CHART_FONT, size: 9, weight: "600" },
                            padding: 10,
                            usePointStyle: true,
                            pointStyle: "circle",
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        ...premiumChartTooltip(),
                        callbacks: {
                            label(ctx) { return ` ${sym}${(ctx.parsed.y || 0).toLocaleString()}`; }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: "#94a3b8", font: { family: REPORT_CHART_FONT, size: 8, weight: "600" } }
                    },
                    y: {
                        grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
                        ticks: {
                            color: "#64748b",
                            font: { family: REPORT_CHART_FONT, size: 8, weight: "600" },
                            callback: v => sym + (v >= 1000 ? Math.round(v / 1000) + "k" : v)
                        }
                    }
                }
            }
        });
    }

    // Trend line chart (total spend across cycles in chronological order)
    if (momTrendLineInstance) { momTrendLineInstance.destroy(); momTrendLineInstance = null; }
    const lineCanvas = document.getElementById("momTrendLineChart");
    if (lineCanvas) {
        // Sort cycles chronologically for the trend line
        const trendCycles = [
            { key: keyA, label: labelA, total: totalA },
            { key: keyB, label: labelB, total: totalB },
            ...(keyC && totalC !== null ? [{ key: keyC, label: labelC, total: totalC }] : [])
        ].sort((a, b) => a.key.localeCompare(b.key));

        const gradCtx = lineCanvas.getContext("2d");
        const grad = gradCtx.createLinearGradient(0, 0, 0, 140);
        grad.addColorStop(0, "rgba(99, 102, 241, 0.35)");
        grad.addColorStop(1, "rgba(99, 102, 241, 0.02)");

        momTrendLineInstance = new Chart(gradCtx, {
            type: "line",
            data: {
                labels: trendCycles.map(c => c.label),
                datasets: [{
                    label: "Total Spend",
                    data: trendCycles.map(c => c.total),
                    borderColor: "#6366f1",
                    backgroundColor: grad,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: "#6366f1",
                    pointBorderColor: "#020617",
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: "easeOutQuart" },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...premiumChartTooltip(),
                        callbacks: {
                            label(ctx) { return ` ${sym}${(ctx.parsed.y || 0).toLocaleString()}`; }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: "#94a3b8", font: { family: REPORT_CHART_FONT, size: 9, weight: "600" } }
                    },
                    y: {
                        grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
                        ticks: {
                            color: "#64748b",
                            font: { family: REPORT_CHART_FONT, size: 8, weight: "600" },
                            callback: v => sym + (v >= 1000 ? Math.round(v / 1000) + "k" : v)
                        }
                    }
                }
            }
        });
    }

    // Category delta table (A vs B)
    const deltaTable = document.getElementById("momDeltaTable");
    const deltaRows = activeCats
        .map(c => ({
            name: c.name,
            color: c.color,
            valA: catSumsA[c.id] || 0,
            valB: catSumsB[c.id] || 0,
            diff: (catSumsA[c.id] || 0) - (catSumsB[c.id] || 0)
        }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    if (deltaRows.length === 0) {
        deltaTable.innerHTML = `<p class="text-[10px] text-slate-500 text-center py-4 italic">No shared category data for these cycles.</p>`;
    } else {
        deltaTable.innerHTML = deltaRows.map(row => {
            const isUp = row.diff > 0;
            const isZero = row.diff === 0;
            const pct = row.valB > 0 ? Math.round(Math.abs(row.diff) / row.valB * 100) : (row.valA > 0 ? 100 : 0);
            const diffColor = isZero ? "text-slate-400" : isUp ? "text-rose-400" : "text-emerald-400";
            const arrow = isZero ? "→" : isUp ? "▲" : "▼";
            return `
            <div class="flex items-center justify-between bg-slate-950/60 rounded-xl px-3 py-2.5 gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <span class="w-2 h-2 rounded-full shrink-0" style="background:${row.color}"></span>
                    <span class="text-[10px] font-bold text-slate-200 truncate">${row.name}</span>
                </div>
                <div class="flex items-center gap-3 shrink-0 text-right">
                    <span class="text-[9px] text-slate-500 font-mono">${sym}${row.valB.toLocaleString()}</span>
                    <span class="text-[9px] text-slate-400">→</span>
                    <span class="text-[9px] text-slate-200 font-mono">${sym}${row.valA.toLocaleString()}</span>
                    <span class="text-[10px] font-black ${diffColor} w-16 text-right">${arrow} ${isZero ? 'No change' : pct + '%'}</span>
                </div>
            </div>`;
        }).join("");
    }
}

/* ── END MONTH-OVER-MONTH ENGINE ─────────────────────────────────── */

/* ── PDF SUMMARY REPORT ENGINE ───────────────────────────────────── */

/**
 * Generates and downloads a beautifully structured multi-page PDF financial
 * summary report using html2canvas + jsPDF.
 * File name: TReX_Financial_Report_[Month].pdf
 */
async function generatePDFReport() {
    if (typeof window.jspdf === "undefined" || typeof html2canvas === "undefined") {
        showNotification("PDF libraries loading. Please try again in a moment.");
        return;
    }

    if (!state.transactions || state.transactions.length === 0) {
        showNotification("No transaction data available to generate a report.");
        return;
    }

    showNotification("Generating PDF report…");

    const { jsPDF } = window.jspdf;
    const sym = state.currencySymbol;
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    // Determine active cycle
    const selectorVal = document.getElementById("reportCycleSelector") ? document.getElementById("reportCycleSelector").value : "";
    let cycleKey = null;
    if (selectorVal) {
        const parts = selectorVal.trim().split(" ");
        if (parts.length === 2) {
            const moIdx = months.indexOf(parts[0]);
            if (moIdx !== -1) cycleKey = `${parts[1]}-${String(moIdx + 1).padStart(2, "0")}`;
        }
    }
    if (!cycleKey) {
        const now = new Date();
        cycleKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const [cycleYear, cycleMoNum] = cycleKey.split("-");
    const cycleMonthName = months[parseInt(cycleMoNum, 10) - 1];
    const cycleLabel = `${cycleMonthName} ${cycleYear}`;

    const cycleTxs = state.transactions.filter(t => t.date && t.date.startsWith(cycleKey));
    const totalSpent = cycleTxs.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const budget = state.monthlyBudget || 0;
    const savings = Math.max(0, budget - totalSpent);
    const inflow = budget;

    // Category breakdown
    const catMap = {};
    state.categories.forEach(c => { catMap[c.id] = { name: c.name, color: c.color, sum: 0 }; });
    cycleTxs.forEach(t => { if (catMap[t.categoryId]) catMap[t.categoryId].sum += parseFloat(t.amount || 0); });
    const catRows = Object.values(catMap).filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum);

    // Payment breakdown
    const payMap = {};
    state.payments.forEach(p => { payMap[p.id] = { name: p.name, sum: 0 }; });
    cycleTxs.forEach(t => { if (payMap[t.paymentId]) payMap[t.paymentId].sum += parseFloat(t.amount || 0); });
    const payRows = Object.values(payMap).filter(p => p.sum > 0).sort((a, b) => b.sum - a.sum);

    // Build off-screen report container
    const container = document.createElement("div");
    container.id = "__pdfReportSnapshot";
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:750px;background:#020617;color:#f8fafc;font-family:'Plus Jakarta Sans',sans-serif;padding:48px;box-sizing:border-box;";

    const kpiColor = (v) => v > 0 ? "#34d399" : "#f43f5e";

    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:1px solid #1e293b;">
            <div>
                <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">TReX Financial Report</div>
                <div style="font-size:13px;color:#64748b;margin-top:4px;font-weight:600;">${cycleLabel} · Generated ${new Date().toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}</div>
            </div>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:10px 18px;text-align:right;">
                <div style="font-size:9px;color:#64748b;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Cycle Budget</div>
                <div style="font-size:18px;font-weight:900;color:#6366f1;">${sym}${budget.toLocaleString()}</div>
            </div>
        </div>

        <!-- KPI Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:36px;">
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:20px;">
                <div style="font-size:9px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Total Inflow (Budget)</div>
                <div style="font-size:20px;font-weight:900;color:#6366f1;">${sym}${inflow.toLocaleString()}</div>
            </div>
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:20px;">
                <div style="font-size:9px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Total Outflow (Spent)</div>
                <div style="font-size:20px;font-weight:900;color:#f43f5e;">${sym}${totalSpent.toLocaleString()}</div>
            </div>
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:20px;">
                <div style="font-size:9px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Net Savings / Surplus</div>
                <div style="font-size:20px;font-weight:900;color:${kpiColor(savings)};">${sym}${savings.toLocaleString()}</div>
            </div>
        </div>

        <!-- Category Breakdown -->
        <div style="margin-bottom:36px;">
            <div style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Category Breakdown</div>
            ${catRows.length === 0
                ? `<div style="color:#475569;font-size:12px;font-style:italic;">No spending recorded for this cycle.</div>`
                : catRows.map(c => {
                    const pct = totalSpent > 0 ? Math.round((c.sum / totalSpent) * 100) : 0;
                    const barW = Math.max(2, pct);
                    return `
                    <div style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block;"></span>
                                <span style="font-size:12px;font-weight:700;color:#e2e8f0;">${c.name}</span>
                            </div>
                            <div style="text-align:right;">
                                <span style="font-size:12px;font-weight:900;color:#ffffff;">${sym}${c.sum.toLocaleString()}</span>
                                <span style="font-size:10px;color:#64748b;margin-left:6px;">${pct}%</span>
                            </div>
                        </div>
                        <div style="height:5px;background:#1e293b;border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${barW}%;background:${c.color};border-radius:3px;"></div>
                        </div>
                    </div>`;
                }).join("")
            }
        </div>

        <!-- Payment Method Breakdown -->
        <div style="margin-bottom:36px;">
            <div style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Payment Method Split</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
                ${payRows.length === 0
                    ? `<div style="color:#475569;font-size:12px;font-style:italic;">No payment data.</div>`
                    : payRows.map(p => `
                    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px;">
                        <div style="font-size:10px;font-weight:700;color:#64748b;">${p.name}</div>
                        <div style="font-size:15px;font-weight:900;color:#ffffff;margin-top:4px;">${sym}${p.sum.toLocaleString()}</div>
                    </div>`).join("")
                }
            </div>
        </div>

        <!-- Transaction Ledger Table -->
        <div>
            <div style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">
                Transaction Ledger — ${cycleLabel} (${cycleTxs.length} records)
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                    <tr style="background:#0f172a;border-bottom:1px solid #1e293b;">
                        <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;font-size:9px;">Date</th>
                        <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;font-size:9px;">Note</th>
                        <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;font-size:9px;">Category</th>
                        <th style="text-align:left;padding:10px 12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;font-size:9px;">Payment</th>
                        <th style="text-align:right;padding:10px 12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;font-size:9px;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${cycleTxs.length === 0
                        ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:#475569;font-style:italic;">No transactions for this cycle.</td></tr>`
                        : [...cycleTxs].sort((a, b) => new Date(b.date) - new Date(a.date)).map((t, i) => {
                            const cat = state.categories.find(c => c.id === t.categoryId) || { name: "—", color: "#64748b" };
                            const pay = state.payments.find(p => p.id === t.paymentId) || { name: "—" };
                            const rowBg = i % 2 === 0 ? "#0f172a" : "#020617";
                            return `
                            <tr style="background:${rowBg};border-bottom:1px solid #1e293b;">
                                <td style="padding:9px 12px;color:#94a3b8;">${t.date}</td>
                                <td style="padding:9px 12px;color:#e2e8f0;font-weight:600;">${t.note || "—"}</td>
                                <td style="padding:9px 12px;">
                                    <span style="background:${cat.color}22;color:${cat.color};padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700;">${cat.name}</span>
                                </td>
                                <td style="padding:9px 12px;color:#94a3b8;">${pay.name}</td>
                                <td style="padding:9px 12px;text-align:right;font-weight:900;color:#ffffff;">${sym}${parseFloat(t.amount || 0).toLocaleString()}</td>
                            </tr>`;
                        }).join("")
                    }
                </tbody>
                <tfoot>
                    <tr style="background:#0f172a;border-top:2px solid #6366f1;">
                        <td colspan="4" style="padding:12px;font-weight:800;color:#94a3b8;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;">TOTAL OUTFLOW</td>
                        <td style="padding:12px;text-align:right;font-weight:900;color:#f43f5e;font-size:14px;">${sym}${totalSpent.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Footer -->
        <div style="margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:10px;color:#334155;font-weight:600;">TReX - Devour Your Expenses</div>
            <div style="font-size:10px;color:#334155;font-weight:600;">Confidential — ${new Date().toISOString().split("T")[0]}</div>
        </div>
    `;

    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container, {
            backgroundColor: "#020617",
            scale: 2,
            useCORS: true,
            logging: false
        });

        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const imgW = canvas.width;
        const imgH = canvas.height;

        const ratio = pdfW / imgW;
        const scaledH = imgH * ratio;

        let yOffset = 0;
        let pageCount = 0;

        while (yOffset < scaledH) {
            if (pageCount > 0) pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, -yOffset, pdfW, scaledH);
            yOffset += pdfH;
            pageCount++;
        }

        const fileName = `TReX_Financial_Report_${cycleMonthName}_${cycleYear}.pdf`;
        pdf.save(fileName);
        showNotification(`Report downloaded: ${fileName}`);
    } catch (err) {
        console.error("PDF generation error:", err);
        showNotification("PDF generation failed. Please try again.");
    } finally {
        document.body.removeChild(container);
    }
}

/* ── END PDF REPORT ENGINE ───────────────────────────────────────── */
