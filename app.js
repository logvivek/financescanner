const STORAGE_KEY = "finsight-setups-v1";
const RESEARCH_INDEX_NAMES = ["Dow Jones", "DAX", "CAC 40", "Hang Seng", "Nikkei 225"];
const MARKET_RESEARCH_PROMPT = "You are my market research assistant. Brief me on the latest NSE/BSE session as a swing trader. 1) Top 5 market-moving headlines. For each: what happened in one line, facts only; sectors or stocks affected; impact on NIFTY — bullish / bearish / neutral. 2) A table of yesterday's global closes: Dow Jones, DAX, CAC 40, Hang Seng, Nikkei 225. State today's date and name your source for each headline. Under 300 words. Plain language.";

const defaultSetups = [
  { id: "gfs", name: "GFS", range: "38-43", color: "blue" },
  { id: "advance-gfs", name: "Advance GFS", range: "58-62", color: "violet" }
];

const demoRows = {
  gfs: [
    { stock: "RELIANCE", monthly: 67.42, weekly: 62.18, daily: 40.12, change: "Continuing" },
    { stock: "HDFCBANK", monthly: 64.81, weekly: 66.04, daily: 39.56, change: "New" },
    { stock: "ICICIBANK", monthly: 71.36, weekly: 61.92, daily: 42.07, change: "Continuing" },
    { stock: "SBIN", monthly: 63.18, weekly: 68.31, daily: 38.94, change: "New" },
    { stock: "TATAMOTORS", monthly: 66.53, weekly: 60.75, daily: 41.28, change: "Continuing" }
  ],
  "advance-gfs": [
    { stock: "INFY", monthly: 68.22, weekly: 64.73, daily: 60.34, change: "New" },
    { stock: "LT", monthly: 72.16, weekly: 67.42, daily: 59.81, change: "Continuing" },
    { stock: "AXISBANK", monthly: 63.91, weekly: 62.07, daily: 61.24, change: "Continuing" }
  ]
};

const state = {
  setups: loadSetups(),
  activeSetupId: "gfs",
  currentRows: [],
  showingChanges: false,
  sortKey: "stock",
  sortDirection: 1,
  lastRunSetupId: null,
  lastRunAt: "",
  activeCalculatorTab: "risk",
  cupLevel: null
};

const setupGrid = document.getElementById("setup-grid");
const sidebarSetups = document.getElementById("sidebar-setups");
const resultBody = document.getElementById("results-body");
const tableHead = document.getElementById("table-head");
const commandInput = document.getElementById("command-input");
const dialog = document.getElementById("setup-dialog");
const toast = document.getElementById("toast");
let toastTimer;
let editingId = null;

function loadSetups() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored) && stored.every(item => item && typeof item.id === "string" && typeof item.name === "string" && ["38-43", "58-62"].includes(item.range))) {
      return stored;
    }
  } catch (error) {
    console.warn("Saved scan setups could not be loaded.", error);
  }
  return defaultSetups.map(setup => ({ ...setup }));
}

function persistSetups() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.setups));
  } catch (error) {
    showToast("Your setup was saved for this session, but could not be stored on this device.");
    console.warn("Saved scan setups could not be persisted.", error);
  }
}

function getSetup(id = state.activeSetupId) {
  return state.setups.find(setup => setup.id === id) || state.setups[0] || null;
}

function getSetupKey(setup) {
  return setup && setup.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function rangeText(setup) {
  return `Daily RSI 14 between ${setup.range.replace("-", " and ")}`;
}

function renderSetups() {
  setupGrid.innerHTML = "";
  sidebarSetups.innerHTML = "";
  document.getElementById("setup-count").textContent = String(state.setups.length).padStart(2, "0");

  if (!state.setups.length) {
    setupGrid.innerHTML = '<div class="empty-setups">No saved setups yet. Create one to get started.</div>';
  }

  state.setups.forEach(setup => {
    const color = setup.color === "violet" || setup.range === "58-62" ? "violet" : "blue";
    const sideButton = document.createElement("button");
    sideButton.type = "button";
    sideButton.className = `side-setup${setup.id === state.activeSetupId ? " selected" : ""}`;
    sideButton.innerHTML = `<span class="chip-dot ${color}"></span><span>${escapeHTML(setup.name)}</span>`;
    sideButton.addEventListener("click", () => selectSetup(setup.id, true));
    sidebarSetups.appendChild(sideButton);

    const card = document.createElement("article");
    card.className = "setup-card";
    card.innerHTML = `
      <div class="setup-card-top">
        <div class="setup-title-wrap">
          <span class="setup-setup-icon ${color}">${chartIcon()}</span>
          <span><h3>${escapeHTML(setup.name)}</h3><p>Multi-timeframe RSI setup</p></span>
        </div>
        <button class="more-button" type="button" aria-label="Edit or delete ${escapeHTML(setup.name)}" data-edit="${escapeHTML(setup.id)}">···</button>
      </div>
      <div class="setup-stats">
        <div class="stat-cell"><small>MONTHLY RSI 14</small><strong>Above 60</strong></div>
        <div class="stat-cell"><small>WEEKLY RSI 14</small><strong>Above 60</strong></div>
        <div class="stat-cell"><small>DAILY RSI 14</small><strong>${setup.range.replace("-", " – ")}</strong></div>
      </div>
      <div class="setup-card-bottom">
        <span class="setup-universe">${globeIcon()} NSE F&amp;O stocks</span>
        <button type="button" class="run-setup" data-run="${escapeHTML(setup.id)}">Run scan <span>→</span></button>
      </div>`;
    setupGrid.appendChild(card);
  });

  document.querySelectorAll("[data-run]").forEach(button => button.addEventListener("click", () => runScan(button.dataset.run)));
  document.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openSetupDialog(button.dataset.edit)));
  renderSavedList();
}

function renderSavedList() {
  const list = document.getElementById("saved-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.setups.length) {
    list.innerHTML = '<div class="empty-setups">No saved setups yet. Create a setup to add your first scan.</div>';
    return;
  }
  state.setups.forEach(setup => {
    const row = document.createElement("article");
    row.className = "saved-row";
    row.innerHTML = `
      <div class="saved-row-main"><span class="setup-setup-icon ${setup.color === "violet" || setup.range === "58-62" ? "violet" : ""}">${chartIcon()}</span>
      <span><h3>${escapeHTML(setup.name)}</h3><p>Monthly RSI(14) &gt; 60 · Weekly RSI(14) &gt; 60 · ${escapeHTML(rangeText(setup))} · NSE F&amp;O</p></span></div>
      <div class="saved-row-actions"><button class="secondary-button" type="button" data-run="${escapeHTML(setup.id)}">Run scan →</button><button class="secondary-button" type="button" data-edit="${escapeHTML(setup.id)}">Edit</button></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-run]").forEach(button => button.addEventListener("click", () => runScan(button.dataset.run)));
  list.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openSetupDialog(button.dataset.edit)));
}

function renderResults() {
  const setup = getSetup();
  const sampleAvailable = Boolean(setup && Object.prototype.hasOwnProperty.call(demoRows, getSetupKey(setup)));
  const allRows = sampleAvailable ? getRows(setup) : [];
  const rows = state.showingChanges && sampleAvailable
    ? allRows.filter(row => row.change !== "Continuing").concat([
      { stock: "WIPRO", monthly: 62.8, weekly: 63.2, daily: setup && setup.range === "58-62" ? 57.4 : 44.1, change: "Dropped" }
    ])
    : allRows;
  state.currentRows = rows.slice().sort((a, b) => {
    const left = a[state.sortKey];
    const right = b[state.sortKey];
    return (typeof left === "number" ? left - right : String(left).localeCompare(String(right))) * state.sortDirection;
  });

  document.getElementById("results-title").textContent = setup ? `${setup.name} scan results` : "Latest scan results";
  document.getElementById("results-subtitle").textContent = setup ? `${setup.name} · NSE F&O stocks · illustrative preview` : "Create a setup to see scan results.";
  const hasCurrentRun = state.lastRunSetupId === state.activeSetupId;
  document.getElementById("run-time").textContent = hasCurrentRun ? state.lastRunAt : "—";
  document.getElementById("data-time").textContent = hasCurrentRun ? "Demo only — no live feed" : "No live run — demo only";
  document.getElementById("filter-summary").textContent = setup
    ? `Monthly RSI(14) > 60 · Weekly RSI(14) > 60 · ${rangeText(setup)}`
    : "No filter selected";

  tableHead.innerHTML = "";
  const columns = [
    ["stock", "STOCK"],
    ["monthly", "MONTHLY RSI 14"],
    ["weekly", "WEEKLY RSI 14"],
    ["daily", "DAILY RSI 14"]
  ];
  if (state.showingChanges) columns.push(["change", "CHANGE"]);
  columns.push(["match", "STATUS"]);
  columns.forEach(([key, label]) => {
    const th = document.createElement("th");
    th.innerHTML = `<button type="button" data-sort="${key}">${label}<span class="sort-icon">${state.sortKey === key ? state.sortDirection === 1 ? "↑" : "↓" : "↕"}</span></button>`;
    tableHead.appendChild(th);
  });
  tableHead.querySelectorAll("[data-sort]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    state.sortDirection = state.sortKey === key ? state.sortDirection * -1 : 1;
    state.sortKey = key;
    renderResults();
  }));

  resultBody.innerHTML = "";
  state.currentRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const initials = row.stock.slice(0, 2);
    tr.innerHTML = `
      <td><span class="stock-cell"><span class="stock-avatar tone-${index % 4}">${initials}</span>${escapeHTML(row.stock)}</span></td>
      <td><span class="rsi-value">${row.monthly.toFixed(2)}</span></td>
      <td><span class="rsi-value">${row.weekly.toFixed(2)}</span></td>
      <td><span class="rsi-value">${row.daily.toFixed(2)}</span></td>
      ${state.showingChanges ? `<td><span class="status-badge ${row.change === "New" ? "new" : row.change === "Dropped" ? "dropped" : ""}">${escapeHTML(row.change)}</span></td>` : ""}
      <td><span class="match-badge">${row.change === "Dropped" ? "Exited" : "Matched"}</span></td>`;
    resultBody.appendChild(tr);
  });
  const isEmpty = !state.currentRows.length;
  document.getElementById("empty-results").hidden = !isEmpty;
  document.getElementById("results-table").hidden = isEmpty;
  document.querySelector("#empty-results strong").textContent = sampleAvailable ? "No stocks matched" : "Demo results unavailable";
  document.querySelector("#empty-results p").textContent = sampleAvailable
    ? "Try another setup or review the filter above."
    : "No sample dataset is available for this setup, and no live data provider is connected.";
  document.getElementById("result-count").textContent = sampleAvailable
    ? `${state.currentRows.length} ${state.currentRows.length === 1 ? "stock" : "stocks"} ${state.showingChanges ? "in changes preview" : "matched"}`
    : "Demo preview unavailable";
  document.getElementById("change-summary").hidden = !state.showingChanges;
  document.getElementById("change-summary").textContent = "Changes preview: New and dropped rows are illustrative and are not calculated against live or prior-run data.";
}

function getRows(setup) {
  const key = getSetupKey(setup);
  return demoRows[key] || [];
}

function selectSetup(id, refreshResults = false) {
  if (!state.setups.some(setup => setup.id === id)) return;
  state.activeSetupId = id;
  state.showingChanges = false;
  renderSetups();
  renderResults();
  if (refreshResults) {
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function runScan(id = state.activeSetupId) {
  const setup = state.setups.find(item => item.id === id);
  if (!setup) {
    showToast("Create a setup before running a scan.");
    return;
  }
  state.activeSetupId = id;
  state.showingChanges = false;
  renderSetups();
  renderResults();
  const now = new Date();
  const timeOptions = { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata", timeZoneName: "short" };
  state.lastRunSetupId = id;
  state.lastRunAt = now.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", ...timeOptions });
  document.getElementById("run-time").textContent = state.lastRunAt;
  document.getElementById("data-time").textContent = "Demo only — no live feed";
  document.getElementById("command-feedback").textContent = getRows(setup).length
    ? `${setup.name} filter previewed. No live market data provider is connected, so these rows are illustrative only.`
    : `${setup.name} is saved, but no sample results are available. No live market data provider is connected.`;
  document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function handleCommand(value) {
  const command = value.trim();
  if (!command) {
    document.getElementById("command-feedback").textContent = "Enter a saved setup name, such as “scan GFS”.";
    commandInput.focus();
    return;
  }
  if (/changes/i.test(command)) {
    toggleChanges();
    document.getElementById("command-feedback").textContent = "Showing an illustrative changes preview. No previous live run is available for comparison.";
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  if (/\bboth\b/i.test(command) && state.setups.length > 1) {
    runScan(state.setups[0].id);
    document.getElementById("command-feedback").textContent = "Showing the first setup. Run the other saved setup separately to preview its results.";
    return;
  }
  const commandName = command.replace(/^scan\s+/i, "").trim().toLowerCase();
  const setup = state.setups.find(item => item.name.toLowerCase() === commandName);
  if (setup) {
    runScan(setup.id);
    return;
  }
  document.getElementById("command-feedback").textContent = "I couldn't match that to a saved setup. Use the New setup button to define and save a scan.";
}

function toggleChanges() {
  state.showingChanges = !state.showingChanges;
  renderResults();
  document.getElementById("changes-button").classList.toggle("change-active", state.showingChanges);
}

function openSetupDialog(id = null) {
  editingId = id;
  const setup = id ? state.setups.find(item => item.id === id) : null;
  document.getElementById("dialog-title").textContent = setup ? "Edit setup" : "Create a setup";
  document.getElementById("setup-name").value = setup ? setup.name : "";
  document.getElementById("daily-range").value = setup ? setup.range : "38-43";
  document.getElementById("delete-setup-button").hidden = !setup;
  dialog.showModal();
  document.getElementById("setup-name").focus();
}

function deleteSetup() {
  const setup = state.setups.find(item => item.id === editingId);
  if (!setup) return;
  state.setups = state.setups.filter(item => item.id !== editingId);
  if (state.activeSetupId === editingId) state.activeSetupId = state.setups[0] ? state.setups[0].id : null;
  if (state.lastRunSetupId === editingId) {
    state.lastRunSetupId = null;
    state.lastRunAt = "";
  }
  editingId = null;
  persistSetups();
  renderSetups();
  renderResults();
  dialog.close();
  showToast(`“${setup.name}” deleted.`);
}

function saveSetup(event) {
  event.preventDefault();
  const name = document.getElementById("setup-name").value.trim();
  const range = document.getElementById("daily-range").value;
  if (!name || !["38-43", "58-62"].includes(range)) return;
  const duplicate = state.setups.some(setup => setup.name.toLowerCase() === name.toLowerCase() && setup.id !== editingId);
  if (duplicate) {
    showToast("A setup with that name already exists.");
    document.getElementById("setup-name").focus();
    return;
  }
  if (editingId) {
    state.setups = state.setups.map(setup => setup.id === editingId ? { ...setup, name, range, color: range === "58-62" ? "violet" : "blue" } : setup);
    state.activeSetupId = editingId;
  } else {
    const id = `setup-${Date.now()}`;
    state.setups.push({ id, name, range, color: range === "58-62" ? "violet" : "blue" });
    state.activeSetupId = id;
  }
  persistSetups();
  renderSetups();
  renderResults();
  dialog.close();
  showToast(`“${name}” ${editingId ? "updated" : "saved"}.`);
  editingId = null;
}

function exportCsv() {
  if (!state.currentRows.length) {
    showToast("There are no rows to export.");
    return;
  }
  const headers = ["Stock", "Monthly RSI 14", "Weekly RSI 14", "Daily RSI 14"];
  if (state.showingChanges) headers.push("Change");
  headers.push("Status");
  const csvRows = state.currentRows.map(row => [
    row.stock,
    row.monthly.toFixed(2),
    row.weekly.toFixed(2),
    row.daily.toFixed(2),
    ...(state.showingChanges ? [row.change] : []),
    row.change === "Dropped" ? "Exited" : "Matched"
  ]);
  const csv = [headers, ...csvRows].map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${getSetupKey(getSetup()) || "scan"}-demo-results.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function chartIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V9m5 9V5m5 13v-6m5 6V7"/><path d="M3 20h18"/></svg>';
}

function globeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5s-1.1 6.2-3.3 8.5C9.8 18.2 8.7 15.4 8.7 12s1.1-6.2 3.3-8.5z"/></svg>';
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function readPositiveInput(inputId, errorId, label) {
  const input = document.getElementById(inputId);
  const value = input.value.trim() === "" ? NaN : Number(input.value);
  let message = "";
  if (!Number.isFinite(value)) message = `${label} is required.`;
  else if (value <= 0) message = `${label} must be greater than zero.`;
  input.setAttribute("aria-invalid", String(Boolean(message)));
  document.getElementById(errorId).textContent = message;
  return message ? null : value;
}

function getRiskBudget() {
  const capital = readPositiveInput("calc-capital", "calc-capital-error", "Capital");
  const riskPercent = readPositiveInput("calc-risk-percent", "calc-risk-error", "Risk per trade");
  const budget = document.getElementById("calc-risk-budget");
  const note = document.getElementById("calc-risk-budget-note");
  if (capital === null || riskPercent === null) {
    budget.textContent = "—";
    note.textContent = "Enter valid capital and risk.";
    return null;
  }
  const amount = capital * riskPercent / 100;
  budget.textContent = formatMoney(amount);
  note.textContent = `${riskPercent}% of ${formatMoney(capital)}`;
  return amount;
}

function setCalculatorEmpty(id, message) {
  const empty = document.getElementById(id);
  empty.textContent = message;
  empty.hidden = false;
}

function renderRiskCalculator() {
  const budget = getRiskBudget();
  const entry = readPositiveInput("risk-entry", "risk-entry-error", "Entry price");
  const stop = readPositiveInput("risk-stop", "risk-stop-error", "Stop-loss");
  const target = readPositiveInput("risk-target", "risk-target-error", "Target");
  const results = document.getElementById("risk-results");
  const warning = document.getElementById("risk-warning");
  const empty = document.getElementById("risk-empty");
  warning.hidden = true;

  if (entry !== null && stop !== null && stop >= entry) {
    document.getElementById("risk-stop").setAttribute("aria-invalid", "true");
    document.getElementById("risk-stop-error").textContent = "For long trades, stop-loss must be below entry.";
  }
  if (entry !== null && target !== null && target <= entry) {
    document.getElementById("risk-target").setAttribute("aria-invalid", "true");
    document.getElementById("risk-target-error").textContent = "For long trades, target must be above entry.";
  }
  const levelsValid = entry !== null && stop !== null && target !== null && stop < entry && target > entry;
  if (!levelsValid || budget === null) {
    results.hidden = true;
    setCalculatorEmpty("risk-empty", "Enter valid capital, risk, entry, stop-loss and target to see position sizing.");
    return;
  }

  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const quantity = Math.floor(budget / riskPerShare);
  const riskReward = rewardPerShare / riskPerShare;
  document.getElementById("risk-per-share").textContent = formatMoney(riskPerShare);
  document.getElementById("risk-quantity").textContent = quantity.toLocaleString("en-IN");
  document.getElementById("risk-amount").textContent = formatMoney(quantity * riskPerShare);
  document.getElementById("reward-amount").textContent = formatMoney(quantity * rewardPerShare);
  document.getElementById("risk-reward-ratio").textContent = `1:${riskReward.toFixed(2)}`;
  warning.hidden = riskReward >= 3;
  warning.textContent = riskReward < 3 ? `Reward-to-risk is below 1:3 (currently 1:${riskReward.toFixed(2)}).` : "";
  results.hidden = false;
  empty.hidden = true;
}

function setChecklist(id, met, reason) {
  const row = document.getElementById(id);
  row.classList.toggle("met", met);
  row.querySelector(".check-status").textContent = met ? "Met" : "Not met";
  row.querySelector("small").textContent = reason;
}

function renderValueBuyCalculator() {
  const budget = getRiskBudget();
  const monthlyRsi = readPositiveInput("value-monthly-rsi", "value-monthly-rsi-error", "Monthly RSI");
  const entry = readPositiveInput("value-entry", "value-entry-error", "Entry price");
  const confirmationLow = readPositiveInput("value-confirm-low", "value-confirm-low-error", "Confirmation candle low");
  const stop = readPositiveInput("value-stop", "value-stop-error", "Stop-loss");
  const target = readPositiveInput("value-target", "value-target-error", "Target");
  const weeklyConfirmed = document.getElementById("value-weekly-confirmation").checked;

  const longLevelsValid = entry !== null && stop !== null && target !== null && stop < entry && target > entry;
  if (entry !== null && stop !== null && stop >= entry) {
    document.getElementById("value-stop").setAttribute("aria-invalid", "true");
    document.getElementById("value-stop-error").textContent = "For long trades, stop-loss must be below entry.";
  }
  if (entry !== null && target !== null && target <= entry) {
    document.getElementById("value-target").setAttribute("aria-invalid", "true");
    document.getElementById("value-target-error").textContent = "For long trades, target must be above entry.";
  }

  const rsiMet = monthlyRsi !== null && monthlyRsi === 40;
  const stopMet = stop !== null && confirmationLow !== null && stop < confirmationLow && entry !== null && stop < entry;
  const riskReward = longLevelsValid ? (target - entry) / (entry - stop) : null;
  const rewardMet = riskReward !== null && riskReward >= 3;
  setChecklist("check-rsi", rsiMet, rsiMet ? "Monthly RSI is exactly 40." : monthlyRsi === null ? "Enter the required value to evaluate this rule." : "Monthly RSI must equal 40.");
  setChecklist("check-weekly", weeklyConfirmed, weeklyConfirmed ? "Weekly confirmation is checked." : "Tick the box when the weekly candle condition is met.");
  setChecklist("check-stop", stopMet, stopMet ? "Stop-loss is below the confirmation candle low." : stop === null || confirmationLow === null ? "Enter stop-loss and confirmation low to evaluate this rule." : "Stop-loss must be below the confirmation candle low and entry.");
  setChecklist("check-reward", rewardMet, rewardMet
    ? `Reward-to-risk is 1:${riskReward.toFixed(2)}.`
    : riskReward === null ? "Enter valid entry, stop-loss and target levels." : `Current reward-to-risk is 1:${riskReward.toFixed(2)}; it must be at least 1:3.`);

  const summary = document.getElementById("value-buy-summary");
  const canSize = longLevelsValid && budget !== null;
  if (canSize) {
    const riskPerShare = entry - stop;
    const rewardPerShare = target - entry;
    document.getElementById("value-risk-per-share").textContent = formatMoney(riskPerShare);
    document.getElementById("value-reward-per-share").textContent = formatMoney(rewardPerShare);
    document.getElementById("value-risk-reward").textContent = `1:${riskReward.toFixed(2)}`;
    document.getElementById("value-quantity").textContent = Math.floor(budget / riskPerShare).toLocaleString("en-IN");
  }
  summary.hidden = !canSize;

  const allMet = rsiMet && weeklyConfirmed && stopMet && rewardMet && canSize;
  const verdict = document.getElementById("value-verdict");
  verdict.classList.toggle("trade", allMet);
  verdict.classList.toggle("no-trade", !allMet);
  verdict.querySelector(".verdict-icon").textContent = allMet ? "✓" : "!";
  verdict.querySelector("strong").textContent = allMet ? "TRADE" : "NO TRADE";
  verdict.querySelector(".verdict-reason").textContent = allMet
    ? "All four Value Buy checks are met. This is a rule verdict, not investment advice."
    : "Meet all four checks with valid levels to change the rule verdict.";
}

const cupTargets = {
  1: [10, 20, 30],
  2: [20, 40, 60, 80, 100],
  3: [100, 200, 300]
};

function renderCupCalculator() {
  const budget = getRiskBudget();
  const referencePrice = readPositiveInput("cup-reference-price", "cup-reference-price-error", "Reference price");
  const results = document.getElementById("cup-results");
  const table = document.getElementById("cup-table-card");
  const empty = document.getElementById("cup-empty");
  if (referencePrice === null || budget === null || state.cupLevel === null) {
    results.hidden = true;
    table.hidden = true;
    setCalculatorEmpty("cup-empty", referencePrice === null
      ? "Enter a valid reference price and choose a target level to build the plan."
      : budget === null
        ? "Enter valid capital and risk settings to calculate the plan."
        : "Choose Level 1, Level 2 or Level 3 to build the target ladder.");
    return;
  }

  const entry = referencePrice * 1.04;
  const stop = referencePrice * 0.98;
  const riskPerShare = entry - stop;
  const quantity = Math.floor(budget / riskPerShare);
  document.getElementById("cup-entry").textContent = formatMoney(entry);
  document.getElementById("cup-stop").textContent = formatMoney(stop);
  document.getElementById("cup-risk-per-share").textContent = formatMoney(riskPerShare);
  document.getElementById("cup-quantity").textContent = quantity.toLocaleString("en-IN");
  document.getElementById("cup-level-heading").textContent = `Level ${state.cupLevel}`;

  const percentages = cupTargets[state.cupLevel];
  const targetPrices = percentages.map(percent => entry * (1 + percent / 100));
  const rows = document.getElementById("cup-target-rows");
  rows.innerHTML = "";
  percentages.forEach((percent, index) => {
    const row = document.createElement("tr");
    const targetName = `T${index + 1}`;
    const qtyToSell = state.cupLevel === 1 && quantity % 3 === 0
      ? (quantity / 3).toLocaleString("en-IN")
      : "Not specified";
    let stopAfter = "Not specified";
    if (state.cupLevel === 1 && index === 0) stopAfter = "Entry";
    if (state.cupLevel === 1 && index === 1) stopAfter = `T1 · ${formatMoney(targetPrices[0])}`;
    [targetName, `+${percent}%`, formatMoney(targetPrices[index]), qtyToSell, stopAfter].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    rows.appendChild(row);
  });
  document.getElementById("cup-table-note").textContent = state.cupLevel === 1
    ? quantity % 3 === 0
      ? "Level 1 divides the position into three equal whole-share exits. Price display is rounded to two decimals."
      : `Level 1 calls for one-third at each target, but ${quantity.toLocaleString("en-IN")} shares do not divide evenly into three; the PRD does not specify how to allocate the remainder. Prices are displayed to two decimals.`
    : "The PRD does not specify quantity splits or stop movement for this level. Prices are displayed to two decimals.";
  results.hidden = false;
  table.hidden = false;
  empty.hidden = true;
}

function renderActiveCalculator() {
  if (state.activeCalculatorTab === "value-buy") renderValueBuyCalculator();
  else if (state.activeCalculatorTab === "cup-pattern") renderCupCalculator();
  else renderRiskCalculator();
}

function renderDailyMarketResearch() {
  const today = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).format(new Date());
  document.getElementById("research-today").textContent = today;
  document.getElementById("research-updated").textContent = "Not searched";
  document.getElementById("research-session").textContent = "Manual review";
  document.getElementById("research-footer-sources").textContent = "Google Search links · verify original sources";
  const publisherSites = [
    "site:indiainfoline.com",
    "site:newsbytesapp.com",
    "site:stockinvest.com",
    "site:investinglive.com",
    "site:leprivatebanker.com"
  ].join(" OR ");
  const searchQueries = {
    "google-prompt-search": MARKET_RESEARCH_PROMPT,
    "google-headlines-search": `latest NSE BSE market-moving headlines today (${publisherSites})`,
    "google-dow-search": "Dow Jones previous close CNBC AP",
    "google-europe-search": "DAX CAC 40 previous close investingLive",
    "google-asia-search": "Hang Seng Nikkei 225 previous close MarketSpeaker CNBC"
  };
  Object.entries(searchQueries).forEach(([id, query]) => {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", query);
    document.getElementById(id).href = url.href;
  });
  renderResearchHeadlines([]);
  renderGlobalMarketCloses([]);
}

function renderGlobalMarketCloses(closes) {
  const closeByName = new Map(closes.map(close => [close.index, close]));
  const body = document.getElementById("global-closes-body");
  body.replaceChildren();
  RESEARCH_INDEX_NAMES.forEach(name => {
    const data = closeByName.get(name);
    const row = document.createElement("tr");
    const indexCell = document.createElement("td");
    const nameWrap = document.createElement("span");
    const mark = document.createElement("span");
    nameWrap.className = "global-index-name";
    mark.className = "global-index-mark";
    mark.textContent = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2);
    nameWrap.append(mark, document.createTextNode(name));
    indexCell.append(nameWrap);
    row.append(indexCell);

    const values = [
      data ? data.tradingDate : null,
      data ? data.close : null,
      data ? data.changePoints : null,
      data ? data.changePercent : null
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (value === null) {
        const unavailable = document.createElement("span");
        unavailable.className = "global-unavailable";
        unavailable.textContent = "Unavailable";
        cell.append(unavailable);
      } else if (index === 0) {
        const date = new Date(`${value}T12:00:00Z`);
        cell.textContent = new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC"
        }).format(date);
      } else {
        const number = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formatted = index === 1
          ? number
          : index === 3
            ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
            : `${value > 0 ? "+" : ""}${number}`;
        cell.textContent = formatted;
      }
      row.append(cell);
    });

    const sourceCell = document.createElement("td");
    const source = document.createElement(data && data.sourceUrl ? "a" : "span");
    source.className = "global-source";
    source.textContent = data ? data.source : "Use search links";
    if (data && data.sourceUrl) {
      source.href = data.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
    }
    sourceCell.append(source);
    row.append(sourceCell);
    body.append(row);
  });

  document.querySelector(".close-date-note").textContent = closes.some(close => close.tradingDate)
    ? "Trading date shown per index"
    : "Last close · date unavailable";
}

function setGlobalCloseEntryStatus(message, stateName = "info") {
  const status = document.getElementById("global-close-entry-status");
  status.textContent = message;
  status.dataset.state = stateName;
}

function saveGlobalMarketCloses(event) {
  event.preventDefault();
  try {
    const closes = Array.from(document.querySelectorAll("[data-global-close-row]"), row => {
      const read = name => row.querySelector(`[name="${name}"]`).value.trim();
      const values = {
        tradingDate: read("tradingDate"),
        close: read("close"),
        changePoints: read("changePoints"),
        changePercent: read("changePercent"),
        source: read("source"),
        sourceUrl: read("sourceUrl")
      };
      if (Object.values(values).every(value => !value)) {
        return {
          index: row.dataset.globalCloseRow,
          tradingDate: null,
          close: null,
          changePoints: null,
          changePercent: null,
          source: "Unavailable",
          sourceUrl: null
        };
      }
      const missing = Object.entries(values).find(([, value]) => !value);
      if (missing) throw new Error(`${row.dataset.globalCloseRow}: complete all fields or leave the row blank.`);
      const tradingDate = new Date(`${values.tradingDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.tradingDate)
        || Number.isNaN(tradingDate.getTime())
        || tradingDate.toISOString().slice(0, 10) !== values.tradingDate) {
        throw new Error(`${row.dataset.globalCloseRow}: enter a valid trading date.`);
      }
      const numericValues = ["close", "changePoints", "changePercent"].map(field => Number(values[field]));
      if (numericValues.some(value => !Number.isFinite(value)) || numericValues[0] < 0) {
        throw new Error(`${row.dataset.globalCloseRow}: enter valid numeric close and change values.`);
      }
      const sourceUrl = new URL(values.sourceUrl);
      if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password) {
        throw new Error(`${row.dataset.globalCloseRow}: source URL must be a public HTTPS link.`);
      }
      return {
        index: row.dataset.globalCloseRow,
        tradingDate: values.tradingDate,
        close: numericValues[0],
        changePoints: numericValues[1],
        changePercent: numericValues[2],
        source: values.source,
        sourceUrl: sourceUrl.href
      };
    });
    if (closes.every(close => close.tradingDate === null)) {
      throw new Error("Enter at least one verified global close before displaying the table.");
    }
    renderGlobalMarketCloses(closes);
    document.getElementById("research-session").textContent = "Manual data entered · verify sources";
    document.getElementById("research-footer-sources").textContent = "Manually entered Google research · verify each source";
    document.getElementById("global-data-note").textContent = "Values were entered manually and have not been independently verified. Confirm each value and trading date using its source link.";
    setResearchStatus(
      "Global closes entered manually",
      "The table reflects values you entered. This app does not fetch or independently verify Google results.",
      "Manual data loaded",
      "success"
    );
    setGlobalCloseEntryStatus("Closes displayed. Verify the source links, dates, and values.", "success");
  } catch (error) {
    setGlobalCloseEntryStatus(`Could not display closes: ${error.message}`, "error");
  }
}

function renderResearchHeadlines(headlines) {
  const list = document.getElementById("headline-list");
  const empty = document.getElementById("headline-empty");
  const count = document.getElementById("headline-count");
  const wordCount = headlines.reduce((total, headline) => total + headline.title.split(/\s+/).filter(Boolean).length, 0);

  list.replaceChildren();
  list.hidden = headlines.length === 0;
  empty.hidden = headlines.length > 0;
  count.textContent = `${headlines.length} sourced`;
  document.getElementById("research-word-count").textContent = String(wordCount);
  document.getElementById("research-footer-count").textContent = `Headline word count: ${wordCount} / 300`;
  document.querySelector(".headline-empty-count").textContent = `${headlines.length} of 5 eligible headlines`;

  headlines.forEach((headline, index) => {
    const card = document.createElement("article");
    card.className = "headline-card";

    const header = document.createElement("div");
    header.className = "headline-card-header";
    const rank = document.createElement("span");
    rank.className = "headline-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const source = document.createElement("span");
    source.className = "headline-source";
    source.textContent = headline.source;
    const indexed = document.createElement("time");
    indexed.className = "headline-time";
    indexed.dateTime = headline.indexedAt.toISOString();
    indexed.textContent = `Indexed ${new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata"
    }).format(headline.indexedAt)} IST`;
    header.append(rank, source, indexed);

    const link = document.createElement("a");
    link.className = "headline-title";
    link.href = headline.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = headline.title;

    const assessments = document.createElement("div");
    assessments.className = "headline-assessments";
    const impact = document.createElement("div");
    impact.className = "headline-assessment";
    const impactLabel = document.createElement("small");
    impactLabel.textContent = "NIFTY IMPACT";
    const impactTag = document.createElement("span");
    impactTag.className = "impact-tag neutral";
    impactTag.textContent = "Neutral";
    const impactNote = document.createElement("p");
    impactNote.textContent = "No directional effect inferred from the headline alone.";
    impact.append(impactLabel, impactTag, impactNote);

    const affected = document.createElement("div");
    affected.className = "headline-assessment";
    const affectedLabel = document.createElement("small");
    affectedLabel.textContent = "AFFECTED SECTORS / STOCKS";
    const affectedNote = document.createElement("p");
    affectedNote.textContent = "Not identified in headline metadata.";
    affected.append(affectedLabel, affectedNote);

    assessments.append(impact, affected);
    card.append(header, link, assessments);
    list.append(card);
  });
}

function setResearchStatus(title, message, status, alertType) {
  document.getElementById("research-alert-title").textContent = title;
  document.getElementById("research-alert-message").textContent = message;
  document.getElementById("research-alert").className = `research-alert ${alertType || ""}`.trim();
  document.getElementById("research-source-status").dataset.state = status;
  document.getElementById("research-source-status-label").textContent = status;
}

function formatResearchTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata"
  }).format(new Date(timestamp)) + " IST";
}

function startGoogleResearch() {
  const promptSearchUrl = document.getElementById("google-prompt-search").href;
  window.open(promptSearchUrl, "_blank", "noopener,noreferrer");
  document.getElementById("research-updated").textContent = formatResearchTimestamp(Date.now());
  document.getElementById("research-session").textContent = "Google Search · manual review";
  setResearchStatus(
    "Google search requested",
    "Google treats the prompt as search terms; it does not generate a brief. Verify results at their original sources, then enter verified global closes below.",
    "Google Search only",
    ""
  );
}

function selectCalculatorTab(tab) {
  state.activeCalculatorTab = tab;
  document.querySelectorAll("[data-calculator-tab]").forEach(button => {
    const active = button.dataset.calculatorTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });
  renderActiveCalculator();
}

function switchView(view) {
  const labels = { scanner: "Scanner", saved: "Saved setups", schedule: "Schedule", calculator: "Trade calculator", "daily-market-research": "Daily Market Research" };
  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.hidden = panel.id !== `${view}-view`;
  });
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  document.getElementById("breadcrumb-current").textContent = labels[view] || "Scanner";
  renderSavedList();
}

function init() {
  document.getElementById("date-label").textContent = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  renderSetups();
  renderResults();
  renderActiveCalculator();
  renderDailyMarketResearch();
  document.getElementById("command-form").addEventListener("submit", event => {
    event.preventDefault();
    handleCommand(commandInput.value);
  });
  document.querySelectorAll(".quick-chip").forEach(button => button.addEventListener("click", () => {
    commandInput.value = button.dataset.command;
    handleCommand(button.dataset.command);
  }));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.getElementById("add-setup").addEventListener("click", () => openSetupDialog());
  document.getElementById("new-setup-button").addEventListener("click", () => openSetupDialog());
  document.getElementById("setup-form").addEventListener("submit", saveSetup);
  document.getElementById("delete-setup-button").addEventListener("click", deleteSetup);
  document.getElementById("cancel-dialog").addEventListener("click", () => dialog.close());
  document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
  document.getElementById("export-button").addEventListener("click", exportCsv);
  document.getElementById("changes-button").addEventListener("click", toggleChanges);
  document.getElementById("schedule-toggle").addEventListener("click", event => {
    const toggle = event.currentTarget;
    const enabled = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(enabled));
    document.getElementById("schedule-feedback").textContent = enabled
      ? "Schedule preview enabled for this session only. No runs will be delivered without a connected service."
      : "Schedule is currently off.";
  });
  document.getElementById("help-button").addEventListener("click", () => showToast("Enter a saved setup name or use a quick-run chip to preview its filter and sample rows."));
  document.getElementById("notification-button").addEventListener("click", () => showToast("You’re all caught up."));
  document.getElementById("learn-more").addEventListener("click", () => showToast("FinSight helps you organize and preview your market scans."));
  document.getElementById("refresh-research").addEventListener("click", startGoogleResearch);
  document.getElementById("global-close-form").addEventListener("submit", saveGlobalMarketCloses);
  document.querySelectorAll("#calculator-view input").forEach(input => input.addEventListener("input", renderActiveCalculator));
  document.querySelectorAll("[data-calculator-tab]").forEach((button, index, buttons) => {
    button.addEventListener("click", () => selectCalculatorTab(button.dataset.calculatorTab));
    button.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextIndex = (index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
      buttons[nextIndex].focus();
      selectCalculatorTab(buttons[nextIndex].dataset.calculatorTab);
    });
  });
  document.querySelectorAll("[data-level]").forEach(button => button.addEventListener("click", () => {
    state.cupLevel = Number(button.dataset.level);
    document.querySelectorAll("[data-level]").forEach(levelButton => levelButton.setAttribute("aria-pressed", String(levelButton === button)));
    renderCupCalculator();
  }));
}

init();
