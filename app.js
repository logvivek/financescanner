const STORAGE_KEY = "finsight-setups-v1";

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
  lastRunAt: ""
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

function switchView(view) {
  const labels = { scanner: "Scanner", saved: "Saved setups", schedule: "Schedule" };
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
}

init();
