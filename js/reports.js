/**
 * reports.js — Analytics & Reports
 * Trex — Track Expenses
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
    const selectorVal = document.getElementById("reportCycleSelector").value;
    const symbol = state.currencySymbol;

    let cycleTransactions = [];
    let currentLimit = state.monthlyBudget;

    if (selectorVal === "May 2026") {
        const metrics = calculateCycleMetrics();
        cycleTransactions = state.transactions.filter(t => t.date.startsWith("2026-05"));
        currentLimit = state.monthlyBudget;

        document.getElementById("reportAllocatedSpan").textContent = `${symbol}${currentLimit.toLocaleString()}`;
        document.getElementById("reportSpentSpan").textContent = `${symbol}${metrics.totalSpent.toLocaleString()}`;
        document.getElementById("reportLeftoverSpan").textContent = `${symbol}${metrics.remainingBudget.toLocaleString()}`;

        document.getElementById("reportSummaryText").innerHTML = 
            `Currently tracking May statement. Safe remaining balance is <strong class="text-emerald-400 font-bold">${symbol}${metrics.remainingBudget.toLocaleString()}</strong>. Ensure your burn velocity remains in line with projections.`;

    } else if (selectorVal === "April 2026") {
        cycleTransactions = state.transactions.filter(t => t.date.startsWith("2026-04"));
        currentLimit = 50000;
        const spent = cycleTransactions.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        const surplus = Math.max(0, currentLimit - spent);

        document.getElementById("reportAllocatedSpan").textContent = `${symbol}${currentLimit.toLocaleString()}`;
        document.getElementById("reportSpentSpan").textContent = `${symbol}${spent.toLocaleString()}`;
        document.getElementById("reportLeftoverSpan").textContent = `${symbol}${surplus.toLocaleString()}`;

        document.getElementById("reportSummaryText").innerHTML = 
            `In April, you completed the cycle successfully with a savings surplus of <strong class="text-emerald-400 font-bold">${symbol}${surplus.toLocaleString()}</strong> over a total target pool of <strong class="text-white">${symbol}50,000</strong>.`;

    } else if (selectorVal === "March 2026") {
        cycleTransactions = state.transactions.filter(t => t.date.startsWith("2026-03"));
        currentLimit = 50000;
        const spent = cycleTransactions.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        const surplus = Math.max(0, currentLimit - spent);

        document.getElementById("reportAllocatedSpan").textContent = `${symbol}${currentLimit.toLocaleString()}`;
        document.getElementById("reportSpentSpan").textContent = `${symbol}${spent.toLocaleString()}`;
        document.getElementById("reportLeftoverSpan").textContent = `${symbol}${surplus.toLocaleString()}`;

        document.getElementById("reportSummaryText").innerHTML = 
            `March spending finished at <strong class="text-rose-400 font-bold">${symbol}${spent.toLocaleString()}</strong>. Remaining balance compiled to a surplus of <strong class="text-emerald-400 font-bold">${symbol}${surplus.toLocaleString()}</strong>.`;
    }

    const catSums = {};
    state.categories.forEach(c => { catSums[c.name] = { sum: 0, color: c.color }; });

    cycleTransactions.forEach(t => {
        const categoryObj = state.categories.find(c => c.id === t.categoryId);
        if (categoryObj && catSums[categoryObj.name]) {
            catSums[categoryObj.name].sum += parseFloat(t.amount || 0);
        }
    });

    const catLabels = [];
    const catValues = [];
    const catColors = [];

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
    const payLabels = [];
    const payValues = [];
    const payColors = [];
    Object.keys(paySums).forEach(k => {
        if (paySums[k].sum > 0) {
            payLabels.push(k);
            payValues.push(paySums[k].sum);
            payColors.push(paySums[k].color);
        }
    });

    const totalSpent = cycleTransactions.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    renderReportGauge(totalSpent, currentLimit);

    if (activeReportViewMode === "charts") {
        renderPremiumReportCharts(catLabels, catValues, catColors, payLabels, payValues, payColors);
        setTimeout(resizeReportCharts, 100);
    }

    if (activeReportViewMode === 'accordion') {
        renderAccordionReportList();
    }
}

function renderAccordionReportList() {
    const selectorVal = document.getElementById("reportCycleSelector").value;
    const accordionView = document.getElementById("accordionListView");
    accordionView.innerHTML = "";

    let cycleTransactions = [];
    if (selectorVal === "May 2026") {
        cycleTransactions = state.transactions.filter(t => t.date.startsWith("2026-05"));
    } else if (selectorVal === "April 2026") {
        cycleTransactions = state.transactions.filter(t => t.date.startsWith("2026-04"));
    } else if (selectorVal === "March 2026") {
        cycleTransactions = state.transactions.filter(t => t.date.startsWith("2026-03"));
    }

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
    const seen = new Set();
    state.transactions.forEach(t => {
        if (t.date && t.date.length >= 7) seen.add(t.date.substring(0, 7));
    });
    // Also include current month even if no transactions yet
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    seen.add(currentKey);

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

