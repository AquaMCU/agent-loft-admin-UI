/* ─── Constants ──────────────────────────────────────────────────── */
const WEBHOOK_URL =
  "https://n8n.agent-loft.com/webhook/4ad0c89f-ab8c-45ee-bad1-9321ce94dd64";
const INSTANCES_URL =
  "https://n8n.agent-loft.com/webhook/bb369f27-244c-4f8a-869b-f787050619a2";
const BACKUP_URL =
  "https://n8n.agent-loft.com/webhook/69c0c632-df3b-457f-affe-b725f217f9a2";
const SERVERS_URL =
  "https://n8n.agent-loft.com/webhook/78c0c2b8-e497-4d44-8f26-fec34217513c";
const KEYS_URL =
  "https://n8n.agent-loft.com/webhook/a001374f-d8c0-4430-9b47-9f1e9ab134c3";

/* ─── State ──────────────────────────────────────────────────────── */
let dnsRecords = [];
let instancesRecords = [];
let instancesEditTarget = null;
let backupRecords = [];
let serversData = [];
let currentServerIdx = 0;
let keysData = [];

/* ─── Auth helpers ───────────────────────────────────────────────── */
function getApiUrl() {
  return localStorage.getItem("al_url") || WEBHOOK_URL;
}
function getBasicAuth() {
  const u = localStorage.getItem("al_user") || "";
  const p = localStorage.getItem("al_pass") || "";
  if (!u && !p) return "";
  return "Basic " + btoa(u + ":" + p);
}
function hasCredentials() {
  return !!(localStorage.getItem("al_user") || localStorage.getItem("al_pass"));
}

function apiHeaders(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  const auth = getBasicAuth();
  if (auth) h["Authorization"] = auth;
  return h;
}

/* ─── Auth — login modal ─────────────────────────────────────────── */
function authCheck() {
  if (!hasCredentials()) {
    authShowLogin();
  } else {
    authHideLogin();
    updateSidebarUser();
    dnsLoadRecords();
  }
}

function authShowLogin(message) {
  const el = document.getElementById("login-error");
  if (message) {
    el.textContent = message;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
  document.getElementById("login-backdrop").classList.remove("hidden");
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  setTimeout(() => document.getElementById("login-username").focus(), 80);
}

function authHideLogin() {
  document.getElementById("login-backdrop").classList.add("hidden");
}

async function authSubmit() {
  const user = document.getElementById("login-username").value.trim();
  const pass = document.getElementById("login-password").value;
  if (!user) {
    authShowLogin("Username is required.");
    return;
  }

  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;"></div> Signing in…`;

  try {
    const testHeader = "Basic " + btoa(user + ":" + pass);
    const res = await fetch(getApiUrl(), {
      headers: { Authorization: testHeader },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid credentials.");
    }
    // Accept any non-auth error as "credentials OK"
    localStorage.setItem("al_user", user);
    localStorage.setItem("al_pass", pass);
    authHideLogin();
    updateSidebarUser();
    await dnsLoadRecords();
  } catch (err) {
    authShowLogin(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Sign In";
  }
}

function authLogout() {
  localStorage.removeItem("al_user");
  localStorage.removeItem("al_pass");
  updateSidebarUser();
  authShowLogin();
  toast("Signed out", "info");
}

function updateSidebarUser() {
  const u = localStorage.getItem("al_user") || "";
  document.getElementById("sidebar-username").textContent =
    u || "Not signed in";
}

/* ─── Navigation ─────────────────────────────────────────────────── */
document.querySelectorAll(".nav-item[data-section]").forEach((el) => {
  el.addEventListener("click", () => {
    const key = el.dataset.section;
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    el.classList.add("active");
    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
    document.getElementById("section-" + key)?.classList.add("active");

    const labels = {
      dns: "DNS Records",
      instances: "Instances",
      backup: "Backup",
      servers: "Servers",
      settings: "Settings",
      "coming-soon-firewall": "Firewall",
      "coming-soon-ssl": "SSL / TLS",
      keys: "Keys",
    };
    document.getElementById("page-title").textContent = labels[key] || key;

    // Show refresh button for sections that have live data
    const topbar = document.getElementById("topbar-actions");
    const btnRefresh = document.getElementById("btn-refresh");
    if (key === "dns") {
      topbar.style.display = "";
      btnRefresh.onclick = dnsLoadRecords;
    } else if (key === "instances") {
      topbar.style.display = "";
      btnRefresh.onclick = instancesLoadRecords;
    } else if (key === "backup") {
      topbar.style.display = "";
      btnRefresh.onclick = backupLoadRecords;
    } else if (key === "servers") {
      topbar.style.display = "";
      btnRefresh.onclick = serversLoadData;
    } else if (key === "keys") {
      topbar.style.display = "";
      btnRefresh.onclick = keysLoadRecords;
    } else {
      topbar.style.display = "none";
    }

    // Load data when switching to a section for the first time
    if (key === "instances" && instancesRecords.length === 0) {
      instancesLoadRecords();
    }
    if (key === "backup" && backupRecords.length === 0) {
      backupLoadRecords();
    }
    if (key === "servers" && serversData.length === 0) {
      serversLoadData();
    }
    if (key === "keys" && keysData.length === 0) {
      keysLoadRecords();
    }
  });
});

/* ─── Toast ──────────────────────────────────────────────────────── */
function toast(msg, type = "info", duration = 3500) {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/* ─── Confirm dialog ─────────────────────────────────────────────── */
let confirmResolve = null;
function confirmDialog(title, message, okLabel = "Delete") {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("confirm-ok-btn").textContent = okLabel;
  document.getElementById("confirm-backdrop").classList.add("open");
  return new Promise((res) => {
    confirmResolve = res;
  });
}
function confirmClose(result = false) {
  document.getElementById("confirm-backdrop").classList.remove("open");
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}
document
  .getElementById("confirm-ok-btn")
  .addEventListener("click", () => confirmClose(true));
document.getElementById("confirm-backdrop").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) confirmClose(false);
});

/* ─── DNS — Load ─────────────────────────────────────────────────── */
async function dnsLoadRecords() {
  const tbody = document.getElementById("dns-table-body");
  tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="spinner"></div><p style="margin-top:12px;">Loading…</p></div></td></tr>`;
  try {
    const res = await fetch(getApiUrl(), {
      headers: apiHeaders(),
    });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired. Please sign in again.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const json = await res.json();

    // Support both array-wrapped and direct response shapes
    const data = Array.isArray(json)
      ? (json[0]?.response ?? json)
      : (json?.response ?? []);
    dnsRecords = Array.isArray(data) ? data : [];
    dnsRender();
    toast(
      `Loaded ${dnsRecords.length} record${dnsRecords.length !== 1 ? "s" : ""}`,
      "success",
    );
  } catch (err) {
    dnsRecords = [];
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  <p style="margin-top:10px; color:var(--danger);">${err.message}</p>
</div></td></tr>`;
    toast("Failed to load DNS records: " + err.message, "error");
  }
}

/* ─── DNS — Render table ─────────────────────────────────────────── */
function dnsRender() {
  const search = document.getElementById("dns-search").value.toLowerCase();
  const typeFilter = document
    .getElementById("dns-filter-type")
    .value.toUpperCase();

  const filtered = dnsRecords.filter((r) => {
    const matchType = !typeFilter || r.type === typeFilter;
    const content = (r.records || [])
      .map((x) => x.content)
      .join(" ")
      .toLowerCase();
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search) ||
      content.includes(search) ||
      r.type.toLowerCase().includes(search);
    return matchType && matchSearch;
  });

  document.getElementById("dns-record-count").textContent =
    filtered.length === dnsRecords.length
      ? `${dnsRecords.length} record${dnsRecords.length !== 1 ? "s" : ""}`
      : `${filtered.length} / ${dnsRecords.length} records`;

  const tbody = document.getElementById("dns-table-body");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
  </svg>
  <p>No records found</p>
</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const records = r.records || [];
      const content = records
        .map((x) => `<span class="mono">${escHtml(x.content)}</span>`)
        .join("<br>");
      const disabled = records.some((x) => x.is_disabled);
      const statusHtml = disabled
        ? `<span class="status-dot dot-disabled"></span>Disabled`
        : `<span class="status-dot dot-enabled"></span>Enabled`;

      return `<tr>
  <td><span class="mono">${escHtml(r.name)}</span></td>
  <td><span class="badge badge-${r.type.toLowerCase()}">${escHtml(r.type)}</span></td>
  <td>${content}</td>
  <td class="text-muted">${formatTTL(r.ttl)}</td>
  <td style="white-space:nowrap;">${statusHtml}</td>
  <td>
      <button class="btn btn-danger btn-sm"
        data-name="${escHtml(r.name)}"
        data-type="${escHtml(r.type)}"
        onclick="dnsDeleteRecord(this)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete
      </button>
  </td>
</tr>`;
    })
    .join("");
}

/* ─── DNS — Delete ─────────────────────────────────────────────────── */
async function dnsDeleteRecord(btn) {
  const record = {
    name: btn.dataset.name,
    type: btn.dataset.type,
  };
  const ok = await confirmDialog(
    "Delete DNS Record",
    `Delete the ${record.type} record "${record.name}"? This cannot be undone.`,
  );
  if (!ok) return;

  try {
    const res = await fetch(getApiUrl(), {
      method: "DELETE",
      headers: apiHeaders(),
      body: JSON.stringify({
        name: record.name,
        type: record.type,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast(`Record "${record.name}" (${record.type}) deleted`, "success");
    await dnsLoadRecords();
  } catch (err) {
    toast("Delete failed: " + err.message, "error");
  }
}

/* ─── DNS — Add record (inline form) ────────────────────────────── */
async function dnsAddRecord() {
  const name = document.getElementById("add-name").value.trim();
  const type = document.getElementById("add-type").value;
  const content = document.getElementById("add-content").value.trim();
  const ttl = parseInt(document.getElementById("add-ttl").value, 10) || 3600;

  if (!name) {
    toast("Name is required", "warning");
    return;
  }
  if (!content) {
    toast("Content is required", "warning");
    return;
  }

  const btn = document.getElementById("add-submit-btn");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;"></div> Adding…`;

  try {
    const res = await fetch(getApiUrl(), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        action: "create",
        name,
        type,
        content,
        ttl,
        is_disabled: false,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    toast(`Record "${name}" (${type}) added`, "success");
    document.getElementById("add-name").value = "";
    document.getElementById("add-content").value = "";
    document.getElementById("add-ttl").value = "3600";
    await dnsLoadRecords();
  } catch (err) {
    toast("Add failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

/* ─── Settings ───────────────────────────────────────────────────── */
function settingsSave() {
  const url = document.getElementById("setting-url").value.trim();
  if (url) {
    localStorage.setItem("al_url", url);
    toast("Webhook URL saved", "success");
  } else toast("Enter a URL to save", "warning");
}

function settingsUpdateCredentials() {
  const user = document.getElementById("setting-username").value.trim();
  const pass = document.getElementById("setting-password").value;
  if (!user && !pass) {
    toast("Enter new credentials to update", "warning");
    return;
  }
  if (user) localStorage.setItem("al_user", user);
  if (pass) localStorage.setItem("al_pass", pass);
  document.getElementById("setting-username").value = "";
  document.getElementById("setting-password").value = "";
  updateSidebarUser();
  toast("Credentials updated", "success");
}

async function settingsTest() {
  try {
    const res = await fetch(getApiUrl(), {
      headers: apiHeaders(),
    });
    if (res.status === 401 || res.status === 403)
      toast("Auth failed — check credentials", "error");
    else if (res.ok) toast("Connection OK — HTTP " + res.status, "success");
    else toast("Reachable but HTTP " + res.status, "warning");
  } catch (err) {
    toast("Connection failed: " + err.message, "error");
  }
}

function settingsLoad() {
  const url = localStorage.getItem("al_url");
  if (url) document.getElementById("setting-url").value = url;
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(s) {
  return `'${String(s).replace(/'/g, "&apos;")}'`;
}
function formatTTL(s) {
  if (!s && s !== 0) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/* ─── Add form: Enter key on content submits ─────────────────────── */
document.getElementById("add-content").addEventListener("keydown", (e) => {
  if (e.key === "Enter") dnsAddRecord();
});
document.getElementById("add-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("add-content").focus();
});

/* ─── Login: submit on Enter ─────────────────────────────────────── */
document.getElementById("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") authSubmit();
});
document.getElementById("login-username").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login-password").focus();
});

/* ─── Instances — Helpers ────────────────────────────────────── */
// The API stores some values wrapped in literal quotes, e.g. '"Hermes"'.
// Strip them for clean display and editing.
function stripQuotes(s) {
  if (typeof s !== "string") return String(s ?? "");
  return s.replace(/^"|"$/g, "").trim();
}

/* ─── Instances — Load ───────────────────────────────────────── */
async function instancesLoadRecords() {
  const tbody = document.getElementById("inst-table-body");
  tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="spinner"></div><p style="margin-top:12px;">Loading…</p></div></td></tr>`;
  try {
    const res = await fetch(INSTANCES_URL, { headers: apiHeaders() });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired. Please sign in again.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const json = await res.json();
    // Normalise: [{data:[...]}, ...], plain array, {data:[...]}, or single object
    const data = Array.isArray(json)
      ? (json[0]?.data ?? json)
      : (json?.instances ?? json?.data ?? (json?.uuid ? [json] : []));
    instancesRecords = Array.isArray(data) ? data : [];
    instancesRender();
    toast(
      `Loaded ${instancesRecords.length} instance${instancesRecords.length !== 1 ? "s" : ""}`,
      "success",
    );
  } catch (err) {
    instancesRecords = [];
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  <p style="margin-top:10px; color:var(--danger);">${err.message}</p>
</div></td></tr>`;
    toast("Failed to load instances: " + err.message, "error");
  }
}

/* ─── Instances — Render table ────────────────────────────────── */
function instancesRender() {
  const search = document.getElementById("inst-search").value.toLowerCase();

  const filtered = instancesRecords.filter((r) => {
    if (!search) return true;
    return (
      stripQuotes(r.uuid).toLowerCase().includes(search) ||
      stripQuotes(r.agent).toLowerCase().includes(search) ||
      stripQuotes(r.domain).toLowerCase().includes(search) ||
      stripQuotes(r.server ?? "")
        .toLowerCase()
        .includes(search)
    );
  });

  document.getElementById("inst-record-count").textContent =
    filtered.length === instancesRecords.length
      ? `${instancesRecords.length} instance${instancesRecords.length !== 1 ? "s" : ""}`
      : `${filtered.length} / ${instancesRecords.length} instances`;

  const tbody = document.getElementById("inst-table-body");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
  <p>No instances found</p>
</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const uuid = escHtml(r.uuid);
      const agent = escHtml(stripQuotes(r.agent));
      const domain = escHtml(stripQuotes(r.domain));
      const sshPort = escHtml(stripQuotes(r.ssh_port));
      const ram = escHtml(stripQuotes(r.ram));
      const cpu = escHtml(stripQuotes(r.cpu));
      const server = escHtml(stripQuotes(r.server ?? ""));
      const created = escHtml(stripQuotes(r.created ?? ""));
      return `<tr>
  <td><span class="mono">${uuid}</span></td>
  <td>${agent}</td>
  <td><span class="mono">${domain}</span></td>
  <td class="mono">${sshPort}</td>
  <td>${ram}</td>
  <td>${cpu}</td>
  <td>${server}</td>
  <td>${created}</td>
  <td style="white-space:nowrap; display:flex; gap:6px;">
    <button class="btn btn-ghost btn-sm"
      data-domain="${domain}"
      data-port="${sshPort}"
      onclick="instancesCopySSH(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copy SSH
    </button>
    <button class="btn btn-ghost btn-sm"
      data-uuid="${uuid}"
      onclick="instancesOpenEdit(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Edit
    </button>
    <button class="btn btn-danger btn-sm"
      data-uuid="${uuid}"
      data-agent="${agent}"
      onclick="instancesDelete(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
      Delete
    </button>
  </td>
</tr>`;
    })
    .join("");
}

/* ─── Instances — Copy SSH ────────────────────────────────────── */
function instancesCopySSH(btn) {
  const domain = btn.dataset.domain;
  const port = btn.dataset.port;
  const cmd = `ssh root@${domain} -p ${port}`;
  navigator.clipboard
    .writeText(cmd)
    .then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        btn.innerHTML = orig;
      }, 1800);
      toast(`Copied: ${cmd}`, "success");
    })
    .catch(() => {
      toast("Clipboard access denied", "error");
    });
}

/* ─── Instances — Delete ───────────────────────────────────────── */
async function instancesDelete(btn) {
  const uuid = btn.dataset.uuid;
  const agent = btn.dataset.agent;
  const ok = await confirmDialog(
    "Delete Instance",
    `Delete instance “${agent}” (${uuid})? This cannot be undone.`,
  );
  if (!ok) return;

  try {
    const res = await fetch(INSTANCES_URL, {
      method: "DELETE",
      headers: apiHeaders(),
      body: JSON.stringify({ uuid }),
    });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast(`Instance “${agent}” deleted`, "success");
    await instancesLoadRecords();
  } catch (err) {
    toast("Delete failed: " + err.message, "error");
  }
}

/* ─── Instances — Edit modal ──────────────────────────────────── */
function instancesOpenEdit(btn) {
  const uuid = btn.dataset.uuid;
  const record = instancesRecords.find((r) => r.uuid === uuid);
  if (!record) return;
  instancesEditTarget = record;

  document.getElementById("inst-edit-uuid").value = record.uuid;
  document.getElementById("inst-edit-agent").value = stripQuotes(record.agent);
  document.getElementById("inst-edit-domain").value = stripQuotes(
    record.domain,
  );
  document.getElementById("inst-edit-ssh-port").value = stripQuotes(
    record.ssh_port,
  );
  document.getElementById("inst-edit-ram").value = stripQuotes(record.ram);
  document.getElementById("inst-edit-cpu").value = stripQuotes(record.cpu);

  document.getElementById("inst-edit-backdrop").classList.add("open");
  setTimeout(() => document.getElementById("inst-edit-ssh-port").focus(), 80);
}

function instancesCloseEdit() {
  document.getElementById("inst-edit-backdrop").classList.remove("open");
  instancesEditTarget = null;
}

async function instancesSaveEdit() {
  if (!instancesEditTarget) return;

  const ssh_port = document.getElementById("inst-edit-ssh-port").value.trim();
  const ram = document.getElementById("inst-edit-ram").value.trim();
  const cpu = document.getElementById("inst-edit-cpu").value.trim();

  if (!ssh_port || !ram || !cpu) {
    toast("SSH Port, RAM and CPU are required", "warning");
    return;
  }

  const btn = document.getElementById("inst-save-btn");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;"></div> Saving…`;

  try {
    const res = await fetch(INSTANCES_URL, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify({
        uuid: instancesEditTarget.uuid,
        ssh_port,
        ram,
        cpu,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    toast(`Instance “${instancesEditTarget.uuid}” updated`, "success");
    instancesCloseEdit();
    await instancesLoadRecords();
  } catch (err) {
    toast("Save failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

// Close edit modal on backdrop click
document.getElementById("inst-edit-backdrop").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) instancesCloseEdit();
});

/* ─── Backup — Load ────────────────────────────────────────── */
async function backupLoadRecords() {
  const tbody = document.getElementById("backup-table-body");
  tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="spinner"></div><p style="margin-top:12px;">Loading…</p></div></td></tr>`;
  try {
    const res = await fetch(BACKUP_URL, { headers: apiHeaders() });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired. Please sign in again.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const json = await res.json();
    // Shape: [{data:{repoList:[...]}}]
    const raw = Array.isArray(json) ? json[0] : json;
    backupRecords = raw?.data?.repoList ?? [];
    backupRender();
    toast(
      `Loaded ${backupRecords.length} repositor${backupRecords.length !== 1 ? "ies" : "y"}`,
      "success",
    );
  } catch (err) {
    backupRecords = [];
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  <p style="margin-top:10px; color:var(--danger);">${err.message}</p>
</div></td></tr>`;
    toast("Failed to load backups: " + err.message, "error");
  }
}

/* ─── Backup — Render table ─────────────────────────────────── */
function backupRender() {
  document.getElementById("backup-record-count").textContent =
    `${backupRecords.length} repositor${backupRecords.length !== 1 ? "ies" : "y"}`;

  const tbody = document.getElementById("backup-table-body");
  if (backupRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
  <p>No repositories found</p>
</div></td></tr>`;
    return;
  }

  tbody.innerHTML = backupRecords
    .map((r) => {
      const region = escHtml(r.region ?? "");
      const regionClass = ["eu", "us"].includes(region)
        ? `badge-${region}`
        : "badge-region";
      return `<tr>
  <td><strong>${escHtml(r.name)}</strong></td>
  <td><span class="mono">${escHtml(r.id)}</span></td>
  <td><span class="badge ${regionClass}">${region.toUpperCase()}</span></td>
  <td>${formatBytes(r.currentUsage)}</td>
  <td class="text-muted">${formatDate(r.lastModified)}</td>
  <td class="text-muted">${formatDate(r.createdAt)}</td>
  <td>
    <button class="btn btn-danger btn-sm"
      data-id="${escHtml(r.id)}"
      data-name="${escHtml(r.name)}"
      onclick="backupDelete(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
      Delete
    </button>
  </td>
</tr>`;
    })
    .join("");
}

/* ─── Backup — Delete ──────────────────────────────────────── */
async function backupDelete(btn) {
  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const ok = await confirmDialog(
    "Delete Repository",
    `Delete backup repository “${name}” (${id})? This cannot be undone.`,
  );
  if (!ok) return;

  try {
    const res = await fetch(BACKUP_URL, {
      method: "DELETE",
      headers: apiHeaders(),
      body: JSON.stringify({ id }),
    });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast(`Repository “${name}” deleted`, "success");
    await backupLoadRecords();
  } catch (err) {
    toast("Delete failed: " + err.message, "error");
  }
}

/* ─── Backup — Helpers ─────────────────────────────────────── */
// currentUsage appears to be in KB
function formatBytes(kb) {
  if (kb == null) return "—";
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Servers — Load ───────────────────────────────────────── */
async function serversLoadData() {
  document.getElementById("server-tabs-strip").innerHTML = "";
  document.getElementById("server-dashboard").innerHTML =
    `<div class="empty-state"><div class="spinner"></div><p style="margin-top:12px">Loading…</p></div>`;
  try {
    const res = await fetch(SERVERS_URL, { headers: apiHeaders() });
    if (res.status === 401 || res.status === 403) {
      authLogout();
      authShowLogin("Session expired. Please sign in again.");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const json = await res.json();
    const raw = Array.isArray(json) ? json : [json];
    serversData = raw
      .map((item) => {
        try {
          return typeof item.text === "string" ? JSON.parse(item.text) : item;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (serversData.length === 0) throw new Error("No server data in response");
    currentServerIdx = 0;
    serversRenderTabs();
    serversRenderDashboard(0);
    toast(
      `Loaded ${serversData.length} server${serversData.length !== 1 ? "s" : ""}`,
      "success",
    );
  } catch (err) {
    serversData = [];
    document.getElementById("server-tabs-strip").innerHTML = "";
    document.getElementById("server-dashboard").innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style="margin-top:10px; color:var(--danger)">${err.message}</p>
      </div>`;
    toast("Failed to load server data: " + err.message, "error");
  }
}

/* ─── Servers — Render tabs ────────────────────────────────── */
function serversRenderTabs() {
  const dotColor = {
    green: "var(--success)",
    yellow: "var(--warning)",
    red: "var(--danger)",
  };
  document.getElementById("server-tabs-strip").innerHTML = serversData
    .map((s, i) => {
      const status = s.summary?.overall_status ?? "unknown";
      const color = dotColor[status] ?? "var(--text-muted)";
      const name = escHtml(s.server?.name ?? `Server ${i + 1}`);
      return `<div class="server-tab${i === currentServerIdx ? " active" : ""}" onclick="serversSelectTab(${i})">
        <span class="server-tab-dot" style="background:${color}"></span>
        ${name}
      </div>`;
    })
    .join("");
}

function serversSelectTab(idx) {
  currentServerIdx = idx;
  serversRenderTabs();
  serversRenderDashboard(idx);
}

/* ─── Servers — Render dashboard ────────────────────────────── */
function serversRenderDashboard(idx) {
  const s = serversData[idx];
  if (!s) return;
  const {
    server,
    performance: perf,
    storage,
    containers,
    packages,
    security,
    podman,
    action_advice,
    summary,
    kpis,
  } = s;

  /* helpers */
  const pc = (p) => (p < 60 ? "prog-low" : p < 80 ? "prog-mid" : "prog-high"); // usage: high = bad
  const ps = (p) => (p >= 80 ? "prog-low" : p >= 60 ? "prog-mid" : "prog-high"); // score: high = good
  const fmtGB = (b) => {
    if (b == null) return "—";
    if (b >= 1e12) return (b / 1e12).toFixed(2) + " TB";
    if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
    if (b >= 1e6) return (b / 1e6).toFixed(0) + " MB";
    return (b / 1e3).toFixed(0) + " KB";
  };
  const statusColors = {
    green: "var(--success)",
    yellow: "var(--warning)",
    red: "var(--danger)",
  };
  const sc = statusColors[summary.overall_status] ?? "var(--text-muted)";
  const riskBadge = (lvl) => {
    const l = (lvl ?? "").toLowerCase();
    const cls =
      l === "low"
        ? "badge-low"
        : l === "medium"
          ? "badge-medium"
          : l === "high"
            ? "badge-high"
            : "badge-other";
    return `<span class="badge ${cls}">${escHtml((lvl ?? "—").toUpperCase())}</span>`;
  };
  const secScore = kpis?.kpi_19_security_score ?? "—";

  /* CPU */
  const cpuUsed = +(100 - (perf.cpu_idle_percent ?? 100)).toFixed(2);

  /* Security checks */
  const checks = [
    {
      label: "SSH password auth",
      ok: !security.ssh_password_auth,
      warn: security.ssh_password_auth,
    },
    {
      label: "SSH root login",
      ok: !security.ssh_root_login,
      suffix: security.ssh_root_login ? "enabled" : "disabled",
    },
    { label: "Seccomp", ok: security.seccomp_enabled },
    { label: "AppArmor", ok: security.apparmor_enabled },
    { label: "SELinux", ok: security.selinux_enabled },
  ];
  const secChecksHtml = checks
    .map(
      (c) =>
        `<div class="sec-check">
      <span class="status-dot ${c.ok ? "dot-enabled" : "dot-disabled"}"></span>
      ${escHtml(c.label)}${c.suffix ? ` <span class="text-muted">(${c.suffix})</span>` : ""}
    </div>`,
    )
    .join("");

  /* Exposed ports */
  const portsHtml = (security.firewall_exposed_services ?? []).length
    ? security.firewall_exposed_services
        .map(
          (p) =>
            `<span class="badge badge-other" style="margin:2px">${p}</span>`,
        )
        .join("")
    : `<span class="text-muted">—</span>`;

  /* Action advice */
  const actions = [
    ...(action_advice.priority_actions ?? []),
    action_advice.upgrade_needed
      ? "Package upgrades available — consider updating."
      : null,
    action_advice.ram_upgrade_recommended
      ? "RAM upgrade is recommended."
      : null,
    action_advice.container_cleanup_needed ? "Container cleanup needed." : null,
  ].filter(Boolean);
  const warnIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const actionsHtml = actions.length
    ? actions
        .map((a) => `<div class="action-item">${warnIcon}${escHtml(a)}</div>`)
        .join("")
    : `<div class="action-ok">${checkIcon} All clear — no priority actions.</div>`;

  document.getElementById("server-dashboard").innerHTML = `

    <!-- ─ Summary ────────────────────────────────────────────────── -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span style="font-size:20px;font-weight:700">${escHtml(server.name)}</span>
            <span class="badge badge-${escHtml(summary.overall_status)}">${summary.overall_status.toUpperCase()}</span>
          </div>
          <div class="text-muted" style="font-size:12px">
            ${escHtml(server.os)}&nbsp;&nbsp;·&nbsp;&nbsp;Kernel&nbsp;${escHtml(server.kernel)}&nbsp;&nbsp;·&nbsp;&nbsp;Up&nbsp;${escHtml(server.uptime)}
          </div>
        </div>
        <div style="text-align:center;min-width:70px">
          <div style="font-size:36px;font-weight:700;line-height:1;color:${sc}">${summary.score}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-top:3px">Score</div>
        </div>
      </div>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.65;border-top:1px solid var(--border);padding-top:12px;margin:0">
        ${escHtml(summary.short_summary)}
      </p>
    </div>

    <!-- ─ CPU / Memory / Disk ───────────────────────────────── -->
    <div class="dash-grid">

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>
          </svg>
          CPU
        </div>
        <div class="dash-stat">${cpuUsed}%</div>
        <div class="dash-stat-sub">Usage</div>
        <div class="prog-wrap"><div class="prog-bar ${pc(cpuUsed)}" style="width:${Math.max(cpuUsed, 0.5)}%"></div></div>
        <div class="dash-row">
          <span>User ${perf.cpu_user_percent}%</span>
          <span>Sys ${perf.cpu_system_percent}%</span>
          <span>Idle ${perf.cpu_idle_percent}%</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="6" width="20" height="14" rx="2"/>
            <path d="M6 10h.01M10 10h.01M6 14h.01M10 14h.01M14 10h.01M18 10h.01M14 14h.01M18 14h.01"/>
          </svg>
          Memory
        </div>
        <div class="dash-stat">${perf.memory_usage_percent.toFixed(1)}%</div>
        <div class="dash-stat-sub">Usage</div>
        <div class="prog-wrap"><div class="prog-bar ${pc(perf.memory_usage_percent)}" style="width:${perf.memory_usage_percent}%"></div></div>
        <div class="dash-row">
          <span>Used&nbsp;${fmtGB(perf.memory_used_bytes)}</span>
          <span>Free&nbsp;${fmtGB(perf.memory_free_bytes)}</span>
          <span>Total&nbsp;${fmtGB(perf.memory_total_bytes)}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          Disk
        </div>
        <div class="dash-stat">${storage.disk_usage_percent.toFixed(1)}%</div>
        <div class="dash-stat-sub">Usage</div>
        <div class="prog-wrap"><div class="prog-bar ${pc(storage.disk_usage_percent)}" style="width:${Math.max(storage.disk_usage_percent, 0.5)}%"></div></div>
        <div class="dash-row">
          <span>Used&nbsp;${fmtGB(storage.disk_used_bytes)}</span>
          <span>Total&nbsp;${fmtGB(storage.disk_total_bytes)}</span>
        </div>
      </div>
    </div>

    <!-- ─ Security + Containers ──────────────────────────────── -->
    <div class="dash-grid">

      <div class="card dash-span-2">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Security
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
          <div style="min-width:90px">
            <div class="dash-stat" style="color:${typeof secScore === "number" ? (secScore >= 80 ? "var(--success)" : secScore >= 60 ? "var(--warning)" : "var(--danger)") : "var(--text)"}">${secScore}</div>
            <div class="dash-stat-sub">Sec. Score</div>
            ${typeof secScore === "number" ? `<div class="prog-wrap" style="width:90px"><div class="prog-bar ${ps(secScore)}" style="width:${secScore}%"></div></div>` : ""}
          </div>
          <div style="flex:1;min-width:150px">${secChecksHtml}</div>
          <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Exposed Ports</div>
            <div>${portsHtml}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:8px">Vuln score: ${security.vulnerability_score ?? "—"}</div>
          </div>
        </div>
        ${
          security.risk_flags?.length
            ? `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap">
          ${security.risk_flags.map((f) => `<span class="badge badge-medium">${escHtml(f)}</span>`).join("")}
        </div>`
            : ""
        }
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Containers
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <div class="dash-stat" style="color:${containers.running > 0 ? "var(--success)" : "var(--text-muted)"}">${containers.running}</div>
            <div class="dash-stat-sub">Running</div>
          </div>
          <div>
            <div class="dash-stat" style="color:${containers.stopped > 0 ? "var(--warning)" : "var(--text-muted)"}">${containers.stopped}</div>
            <div class="dash-stat-sub">Stopped</div>
          </div>
        </div>
        <hr class="sep">
        <div class="dash-row" style="margin-top:8px">
          <span>Total: ${containers.total_containers}</span>
          <span>Images: ${containers.total_images}</span>
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">
          Ports: ${(containers.exposed_ports ?? []).join(", ") || "—"}
        </div>
      </div>
    </div>

    <!-- ─ Packages + Podman + Actions ───────────────────────── -->
    <div class="dash-grid" style="margin-bottom:0">

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Packages
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <div class="dash-stat">${packages.total_installed}</div>
            <div class="dash-stat-sub">Installed</div>
          </div>
          <div>
            <div class="dash-stat" style="color:${packages.upgradeable_count > 0 ? "var(--warning)" : "var(--success)"}">${packages.upgradeable_count}</div>
            <div class="dash-stat-sub">Upgradeable</div>
          </div>
        </div>
        ${riskBadge(packages.risk_level)}
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>
          </svg>
          Podman
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div class="dash-kv"><span class="text-muted">Network</span><span>${escHtml(podman.network_backend)}</span></div>
          <div class="dash-kv"><span class="text-muted">cgroup</span><span>${escHtml(podman.cgroup_version)}</span></div>
          <div class="dash-kv"><span class="text-muted">Storage</span><span>${escHtml(podman.storage_driver)}</span></div>
          <div class="dash-kv"><span class="text-muted">Rootless</span><span>${podman.rootless ? "Yes" : "No"}</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Action Advice
        </div>
        ${actionsHtml}
      </div>
    </div>
  `;
}

/* ─── Keys — Load ───────────────────────────────────────────────── */
async function keysLoadRecords() {
  const tbody = document.getElementById("keys-table-body");
  tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="spinner"></div><p style="margin-top:12px;">Loading…</p></div></td></tr>`;
  try {
    const res = await fetch(KEYS_URL, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Support both [{data:[...]}, ...] and {data:[...]} and flat array
    const first = Array.isArray(json) ? json[0] : json;
    keysData =
      first && Array.isArray(first.data)
        ? first.data
        : Array.isArray(json)
          ? json
          : [];
    const count = document.getElementById("keys-record-count");
    if (count)
      count.textContent = `${keysData.length} key${keysData.length !== 1 ? "s" : ""}`;
    keysRender();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p style="color:var(--danger)">Failed to load keys: ${escHtml(err.message)}</p></div></td></tr>`;
  }
}

function keysRender() {
  const tbody = document.getElementById("keys-table-body");
  if (!keysData.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No keys found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = keysData
    .map((k) => {
      const statusBadge = k.disabled
        ? `<span class="badge badge-red">Disabled</span>`
        : `<span class="badge badge-green">Active</span>`;
      const limit = k.limit != null ? `$${Number(k.limit).toFixed(2)}` : `—`;
      const remaining =
        k.limit_remaining != null
          ? `$${Number(k.limit_remaining).toFixed(2)}`
          : `—`;
      const reset = k.limit_reset
        ? k.limit_reset.charAt(0).toUpperCase() + k.limit_reset.slice(1)
        : `—`;
      const usage =
        k.usage_monthly != null
          ? `$${Number(k.usage_monthly).toFixed(4)}`
          : `—`;
      const created = k.created_at ? formatDate(k.created_at) : `—`;
      return `<tr>
      <td>${escHtml(k.name)}</td>
      <td><code style="font-size:12px;">${escHtml(k.label)}</code></td>
      <td>${statusBadge}</td>
      <td>${limit}</td>
      <td>${remaining}</td>
      <td>${reset}</td>
      <td>${usage}</td>
      <td>${created}</td>
    </tr>`;
    })
    .join("");
}

/* ─── Init ────────────────────────────────────────────────────────── */
settingsLoad();
authCheck();
