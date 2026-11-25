var S_TZ;
/* Infra Command Center (ICC) · SPDX-License-Identifier: Apache-2.0
 * Vanilla JS SPA, no build step. Data: /papi/inventory.json (config repo), /api/vm/* (Prometheus-compatible
 * metrics, read-only), /papi/changelog + /papi/todo (config repo), optional /api/docs/* (MkDocs search index).
 */
"use strict";

const S = { inv: null, m: {}, docs: null, changelog: null, todo: null, updated: null,
            f: { q: "", site: "all", type: "all", status: "all", view: "table", area: "all", prio: "all", pview: "board" }, range: "6h" };
let DOCS = ""; // MkDocs site of the organisation (icc.yaml links.docs), optional
const ICC = () => (S.invAll && S.invAll.icc) || {};
const AGENT = () => (ICC().assistant || {}).name || "Hermes";
const repoFile = (n) => ((ICC().repo || {}).files || {})[n] || { path: n, url: "" };
const repoLink = (n, label) => { const f = repoFile(n); return f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${label || esc(f.path)}${icon("external", "xs")}</a>` : `<span class="mono">${esc(f.path)}</span>`; };
/* the site Kubernetes / cluster-wide metrics without a site label belong to */
const k8sSite = () => (ICC().kubernetes || {}).site || ((S.invAll || S.inv).nodes.find((n) => n.k8s) || {}).site || null;
/* ---- icons: one drawn set, 24-grid, 1.6 stroke (no emoji / unicode glyphs) ---- */
const ICON_PATHS = {
  overview: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  design: "M12 3 2 8l10 5 10-5-10-5z M2 13l10 5 10-5 M2 18l10 5 10-5",
  monitor: "M3 12h4l3-8 4 16 3-8h4",
  planner: "M4 5h16v16H4z M4 9.5h16 M8 3v4 M16 3v4 M9 15l2 2 4-4",
  changelog: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  docs: "M5 4.5A1.5 1.5 0 0 1 6.5 3H20v15H6.5A1.5 1.5 0 0 0 5 19.5z M5 19.5A1.5 1.5 0 0 0 6.5 21H20",
  hermes: "M4 5h16v11H10l-5 4v-4H4z M8.5 10.5h.01 M12 10.5h.01 M15.5 10.5h.01",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  all: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  region: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c2.4 2.6 3.7 5.6 3.7 9s-1.3 6.4-3.7 9 M12 3C9.6 5.6 8.3 8.6 8.3 12s1.3 6.4 3.7 9",
  site: "M4 20V9l8-5 8 5v11 M9 20v-5h6v5 M2 20h20",
  building: "M5 21V4h10v17 M15 9h4v12 M3 21h18 M8.5 8h.01 M11.5 8h.01 M8.5 12h.01 M11.5 12h.01 M8.5 16h.01 M11.5 16h.01",
  floor: "M3 9l9-5 9 5-9 5z M3 15l9 5 9-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1L14.9 3h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.4h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.5z",
  play: "M7 4.5v15l12-7.5z",
  edit: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4",
  trash: "M4 7h16 M9 7V4h6v3 M6.5 7l1 13h9l1-13 M10 11v5 M14 11v5",
  plus: "M12 5v14 M5 12h14",
  chevron: "M6 9l6 6 6-6",
  logout: "M14 4h5v16h-5 M10 8l-4 4 4 4 M6 12h10",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7",
  stop: "M6 6h12v12H6z",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4",
  external: "M14 4h6v6 M20 4l-9 9 M19 14v6H4V5h6",
  folder: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z",
  folderplus: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z M12 10v6 M9 13h6",
  dots: "M5 12h.01 M12 12h.01 M19 12h.01",
  archive: "M3 5h18v4H3z M5 9v10h14V9 M10 13h4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4",
  send: "M4 12 20 4l-6 16-2.5-6.5z M11.5 13.5 20 4",
  chat: "M4 5h16v11H10l-5 4v-4H4z",
  chevright: "M9 6l6 6-6 6",
  backlog: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  next: "M5 12h14 M13 6l6 6-6 6",
  doing: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 4v16 M12 4a8 8 0 0 1 0 16",
  waiting: "M9 5v14 M15 5v14",
  done: "M5 12.5l4.5 4.5L19 7",
};
const icon = (n, cls = "") => `<svg class="ic-svg ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[n] || ""}"/></svg>`;
/* ---- warning levels: 0 no warning · 1 be aware · 2 be prepared · 3 take action ---- */
const LVL = ["No warning", "Be aware", "Be prepared", "Take action"];
function levelOf(al) {
  if (al.some((a) => a.s === "down")) return 3;
  if (al.some((a) => a.s === "warn" && (a.kind === "node" || a.kind === "svc"))) return 2;
  return al.length ? 1 : 0;
}
const alertLevel = (a) => (a.s === "down" ? 3 : a.kind === "node" || a.kind === "svc" ? 2 : 1);
const lvlChip = (l, label = LVL[l]) => `<span class="lvl l${l}" title="Level ${l} · ${LVL[l]}"><i>${l}</i>${label ? esc(label) : ""}</span>`;

/* user settings (sidebar → user → Settings): theme + time zone */
S_TZ = localStorage.getItem("tz") || Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { timeZone: S_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDT = (d) => new Date(d).toLocaleString(undefined, { timeZone: S_TZ, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: S_TZ });
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null || isNaN(v) ? "—" : `${Math.round(v * 100)}%`);
const gib = (b) => (b == null ? "—" : b >= 1024 ** 4 ? `${(b / 1024 ** 4).toFixed(2)} TiB` : `${(b / 1024 ** 3).toFixed(1)} GiB`);
const dur = (s) => { if (s == null) return "—"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d ? `${d}d ${h}h` : `${h}h ${Math.floor((s % 3600) / 60)}m`; };
const ms = (s) => (s == null ? "" : `${Math.round(s * 1000)} ms`);
const siteName = (id) => (S.invAll || S.inv).sites.find((s) => s.id === id)?.name || id;
/* ---- global site scope (sidebar selector): every page, KPI, alarm, task and change follows it ---- */
/* scope = a node of the hierarchy Region > Site > Building > Floor (or all) */
S.scope = (() => { try { return JSON.parse(localStorage.getItem("scope")) || { k: "all" }; } catch (_) { return { k: "all" }; } })();
S.site = "all"; S.siteSet = null;
const allSites = () => (S.invAll ? S.invAll.sites : []);
const allBuildings = () => allSites().flatMap((s) => (s.buildings || []).map((b) => ({ ...b, site: s.id })));
const bById = (id) => allBuildings().find((b) => b.id === id);
const firstBld = (site) => (allSites().find((s) => s.id === site)?.buildings || [])[0]?.id;
function nodeBld(n, depth = 0) {
  if (!n) return null;
  if (n.building) return n.building;
  if (n.floor) return n.floor.split("/")[0];
  const p = n.parent && depth < 8 ? S.invAll.nodes.find((x) => x.id === n.parent) : null;
  return (p && p.site === n.site && nodeBld(p, depth + 1)) || firstBld(n.site);
}
const svcBld = (x) => (x.building || (x.runs_on && nodeBld(S.invAll.nodes.find((n) => n.id === x.runs_on))) || firstBld(x.site));
const scopeLabel = (sc = S.scope) => {
  if (sc.k === "all") return "All sites";
  if (sc.k === "region") return (S.invAll.regions || []).find((r) => r.id === sc.id)?.name || sc.id;
  if (sc.k === "site") return siteName(sc.id);
  if (sc.k === "building") { const b = bById(sc.id); return b ? `${siteName(b.site)} › ${b.name}` : sc.id; }
  const [bid, fid] = sc.id.split("/"); const b = bById(bid); return b ? `${siteName(b.site)} › ${b.name} › ${(b.floors || []).find((f) => f.id === fid)?.name || fid}` : sc.id;
};
const inSite = (site) => !S.siteSet || !site || S.siteSet.has(site);       // untagged = shared / both sites
const inSiteStrict = (site) => !S.siteSet || S.siteSet.has(site);
function scopeInv() {
  const a = S.invAll; if (!a) return;
  const sc = S.scope; let sites = null, bld = null, floor = null;
  if (sc.k === "region") sites = a.sites.filter((s) => s.region === sc.id).map((s) => s.id);
  else if (sc.k === "site") sites = a.sites.some((s) => s.id === sc.id) ? [sc.id] : null;
  else if (sc.k === "building") { const b = bById(sc.id); if (b) { sites = [b.site]; bld = b.id; } }
  else if (sc.k === "floor") { const b = bById(sc.id.split("/")[0]); if (b) { sites = [b.site]; bld = b.id; floor = sc.id; } }
  if (sc.k !== "all" && !sites) { S.scope = { k: "all" }; }
  if (sites && sites.length === a.sites.length && !bld) sites = null; // region covering everything = all
  S.siteSet = sites ? new Set(sites) : null;
  S.site = sites && sites.length === 1 ? sites[0] : "all";
  S.f.site = S.site; if (S.site !== "all") S.gsite = S.site;
  if (!S.siteSet) { S.inv = a; return; }
  const nodeOk = (n) => S.siteSet.has(n.site) && (!bld || nodeBld(n) === bld) && (!floor || n.floor === floor);
  S.inv = { ...a, sites: a.sites.filter((s) => S.siteSet.has(s.id)), nodes: a.nodes.filter(nodeOk), services: a.services.filter((x) => S.siteSet.has(x.site) && (!bld || svcBld(x) === bld) && !floor) };
}
function setScope(k, id) { S.scope = k === "all" ? { k } : { k, id }; localStorage.setItem("scope", JSON.stringify(S.scope)); for (const x in SITE_RX) delete SITE_RX[x]; scopeInv(); $("#scope-pop")?.remove(); render(); }
function setSite(id) { setScope(id === "all" ? "all" : "site", id); }
const SITE_RX = {}; // site -> regexp of its site code + host short names (for changelog / docs tagging)
function siteRx() {
  if (Object.keys(SITE_RX).length || !S.invAll) return SITE_RX;
  for (const s of S.invAll.sites) {
    const names = S.invAll.nodes.filter((n) => n.site === s.id).flatMap((n) => [n.name, n.name.split("-")[0]]).filter((x) => x.length >= 4);
    const extra = s.keywords || [];
    SITE_RX[s.id] = new RegExp(`\\b(${[s.name, ...new Set(names), ...extra].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  }
  return SITE_RX;
}
const sitesOf = (text) => Object.entries(siteRx()).filter(([, rx]) => rx.test(text)).map(([id]) => id);
const scopeNote = () => (S.scope.k === "all" ? "" : ` <span class="scope-chip">${icon("pin")}${esc(scopeLabel())}</span>`);
const siteColor = (id) => ((S.invAll || S.inv).sites.find((s) => s.id === id) || {}).color || "#64748b";
const sitePill = (id) => `<span class="pill site" style="--sc:${esc(siteColor(id))}">${esc(siteName(id))}</span>`;
const barCls = (v) => (v >= 0.9 ? "b" : v >= 0.75 ? "w" : "");
const bar = (v) => `<span class="bar ${barCls(v)}"><i style="width:${Math.min(100, Math.max(0, (v || 0) * 100)).toFixed(0)}%"></i></span>`;
const typeName = (t) => ((S.inv.types || {})[t] || {}).name || t;
const iconSrc = (f) => (!f ? "" : f.startsWith("/") ? f : `icons/${f}`);
const logoImg = (f, cls = "lg", alt = "") => (f ? `<img class="${cls}" src="${esc(iconSrc(f))}" alt="${esc(alt)}" loading="lazy">` : "");
const docLink = (p, label = "Docs") => (p ? `<a href="${/^https?:/.test(p) ? esc(p) : DOCS + esc(p)}" target="_blank" rel="noopener">${label}${icon("external", "xs")}</a>` : "");

/* ---------------- data ---------------- */
async function promq(expr) {
  const r = await fetch(`/api/vm/api/v1/query?query=${encodeURIComponent(expr)}`);
  if (!r.ok) throw new Error(`${r.status} ${expr}`);
  return (await r.json()).data.result;
}
async function promr(expr, range = 6 * 3600, step = 300) {
  const end = Math.floor(Date.now() / 1000), start = end - range;
  const r = await fetch(`/api/vm/api/v1/query_range?query=${encodeURIComponent(expr)}&start=${start}&end=${end}&step=${step}`);
  if (!r.ok) return [];
  return (await r.json()).data.result;
}
// key -> PromQL; results are stored as arrays of {metric, v}
const QUERIES = {
  probe: "probe_success",
  probeDur: "probe_duration_seconds",
  probeTls: "probe_ssl_earliest_cert_expiry - time()",
  probeCode: "probe_http_status_code",
  pveUp: "pve_up",
  pveCpu: "pve_cpu_usage_ratio",
  pveMem: "pve_memory_usage_bytes",
  pveMemMax: "pve_memory_size_bytes",
  pveDisk: "pve_disk_usage_bytes",
  pveDiskMax: "pve_disk_size_bytes",
  pveUptime: "pve_uptime_seconds",
  pveGuest: "pve_guest_info",
  pveNoBackup: "pve_not_backed_up_total",
  k8sReady: 'kube_node_status_condition{condition="Ready",status="true"}',
  nodeCpu: '1 - avg by (node) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
  nodeMem: "1 - avg by (node) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
  nodeDisk: '1 - avg by (node) (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})',
  nodeUptime: "avg by (node) (time() - node_boot_time_seconds)",
  argo: "argocd_app_info",
  lh: "longhorn_volume_robustness",
  lhSize: "longhorn_volume_capacity_bytes",
  lhUsed: "longhorn_volume_actual_size_bytes",
  pods: "sum by (phase) (kube_pod_status_phase)",
  podsBad: 'sum by (namespace, pod) (kube_pod_status_phase{phase=~"Pending|Failed|Unknown"}) > 0',
  restarts: "topk(8, sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total[24h])) > 0)",
  up: "up",
  wifi: "count(unifi_client_uptime_seconds)",
  winUp: 'up{job="windows-exporter"}',
  winCpu: '1 - avg by (hostname) (rate(windows_cpu_time_seconds_total{mode="idle"}[5m]))',
  winMem: "1 - windows_memory_available_bytes / windows_memory_physical_total_bytes",
  winDisk: '1 - windows_logical_disk_free_bytes{volume="C:"} / windows_logical_disk_size_bytes{volume="C:"}',
  winUptime: "time() - windows_system_boot_time_timestamp",
};
async function loadMetrics() {
  const keys = Object.keys(QUERIES);
  const res = await Promise.allSettled(keys.map((k) => promq(QUERIES[k])));
  const m = {};
  res.forEach((r, i) => { m[keys[i]] = r.status === "fulfilled" ? r.value.map((x) => ({ metric: x.metric, v: parseFloat(x.value[1]) })) : []; });
  m.failed = res.filter((r) => r.status === "rejected").length;
  S.m = m; S.updated = new Date();
}
const mv = (key, pred) => { const x = (S.m[key] || []).find((r) => pred(r.metric)); return x ? x.v : null; };
const byId = (key, id) => mv(key, (m) => m.id === id);
const byProbe = (key, id) => mv(key, (m) => m.probe_id === id);
const byNode = (key, n) => mv(key, (m) => m.node === n);

/* links in changelog/planner Markdown: relative ones point into the docs site (if any) or the config repo */
function relLink(href, base = "planner.md") {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
  const R = ICC().repo || {}, f = repoFile(base).path || "";
  if (R.web) { const u = new URL(href, `https://x/${f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : ""}`); return `${R.web}/blob/${R.branch}${u.pathname}${u.hash}`; }
  if (DOCS) return DOCS + href.replace(/^\.?\//, "").replace(/\.md(#|$)/, "/$1");
  return "#";
}
async function loadDocs() {
  const parse = (html) => new DOMParser().parseFromString(html, "text/html");
  const inline = (el) => { // text + <code>, everything else flattened (safe)
    let out = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += esc(n.textContent);
      else if (n.nodeName === "CODE") out += `<code>${esc(n.textContent)}</code>`;
      else if (n.nodeName === "STRONG" || n.nodeName === "B") out += `<b>${inline(n)}</b>`;
      else if (n.nodeName === "DEL") out += `<s>${inline(n)}</s>`;
      else if (n.nodeName !== "LABEL") out += inline(n);
    });
    return out;
  };
  const [cl, si] = await Promise.allSettled([
    fetch("/papi/changelog", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ICC().features && ICC().features.docsSearch ? fetch("/api/docs/search/search_index.json").then((r) => r.json()) : Promise.reject("no docs"),
  ]);
  if (cl.status === "fulfilled") {
    S.changelog = cl.value.entries.map((e) => ({ ...e, summary: (window.md ? md(e.summary, "changelog.md") : esc(e.summary)), href: e.href ? relLink(e.href, "changelog.md") : null }))
      .filter((e) => /^\d{4}-\d\d-\d\d/.test(e.ts));
  }
  if (si.status === "fulfilled") S.docs = si.value.docs.filter((d) => !d.location.includes("#") || d.title);
}

/* ---------------- status model ---------------- */
// returns {s: up|down|warn|stopped|unknown, why: [..]}
function nodeStatus(n) {
  const why = []; let s = "unknown";
  const set = (v) => { const rank = { unknown: 0, stopped: 1, up: 2, warn: 3, down: 4 }; if (rank[v] > rank[s]) s = v; };
  if (n.pve) {
    const u = byId("pveUp", n.pve);
    if (u === null) { why.push("not seen in Proxmox"); set("warn"); }
    else if (u === 1) { set("up"); if (n.expect === "stopped") { why.push("running (expected stopped)"); } }
    else if (n.expect === "stopped") set("stopped");
    else { set("down"); why.push("Proxmox: not running"); }
  }
  if (n.k8s) {
    const r = byNode("k8sReady", n.k8s);
    if (r === 1) set("up"); else if (r === 0) { set("down"); why.push("K8s node NotReady"); }
  }
  if (n.win) { const w = mv("winUp", (m) => m.hostname === n.win); if (w === 1) set("up"); else if (w === 0) { set("warn"); why.push("windows_exporter not scraped"); } }
  const p = byProbe("probe", n.id);
  if (p === 1) set("up");
  else if (p === 0) { if (!(n.expect === "stopped")) { set("down"); why.push(`probe ${n.probe || "http"} failed`); } }
  return { s, why };
}
function svcStatus(x) {
  const why = []; let s = "unknown";
  const p = byProbe("probe", x.id);
  if (p === 1) s = "up"; else if (p === 0) { s = "down"; why.push("probe failed"); }
  if (x.argocd) {
    const a = argo(x.argocd);
    if (a) {
      if (a.health === "Healthy" && s === "unknown") s = "up";
      if (a.health === "Degraded" || a.health === "Missing") { s = "down"; why.push(`ArgoCD ${a.health}`); }
      else if (a.health !== "Healthy" || a.sync !== "Synced") { if (s !== "down") s = "warn"; why.push(`ArgoCD ${a.sync}/${a.health}`); }
    }
  }
  const tls = byProbe("probeTls", x.id);
  if (tls != null && tls < 14 * 86400 && x.tls !== "self-signed") { if (s === "up") s = "warn"; why.push(`TLS expires in ${Math.floor(tls / 86400)}d`); }
  return { s, why };
}
function argo(name) {
  const r = (S.m.argo || []).find((x) => x.metric.name === name);
  return r ? { name, sync: r.metric.sync_status, health: r.metric.health_status, ns: r.metric.dest_namespace, repo: r.metric.repo, project: r.metric.project } : null;
}
const byHost = (key, h) => mv(key, (m) => m.hostname === h);
function nodeLive(n) {
  if (n.win) { const w = { cpu: byHost("winCpu", n.win), mem: byHost("winMem", n.win), disk: byHost("winDisk", n.win), uptime: byHost("winUptime", n.win) }; if (w.cpu != null) { if (n.pve) { w.memB = byId("pveMem", n.pve); w.memMax = byId("pveMemMax", n.pve); } return w; } }
  if (n.k8s) { const k = { cpu: byNode("nodeCpu", n.k8s), mem: byNode("nodeMem", n.k8s), disk: byNode("nodeDisk", n.k8s), uptime: byNode("nodeUptime", n.k8s) }; if (k.cpu != null) return k; }
  if (n.pve) {
    const cpu = byId("pveCpu", n.pve), mem = byId("pveMem", n.pve), mmax = byId("pveMemMax", n.pve);
    const disk = byId("pveDisk", n.pve), dmax = byId("pveDiskMax", n.pve);
    return { cpu, mem: mem != null && mmax ? mem / mmax : null, memB: mem, memMax: mmax,
             disk: n.pve.startsWith("node/") && dmax ? disk / dmax : null, uptime: byId("pveUptime", n.pve) };
  }
  if (n.k8s) return { cpu: byNode("nodeCpu", n.k8s), mem: byNode("nodeMem", n.k8s), disk: byNode("nodeDisk", n.k8s), uptime: byNode("nodeUptime", n.k8s) };
  return {};
}
const dot = (s, title = "") => `<span class="dot ${s}" title="${esc(title || s)}"></span>`;
function alerts() {
  const out = [];
  for (const n of S.inv.nodes) { const st = nodeStatus(n); if (st.s === "down" || st.s === "warn") out.push({ s: st.s, name: n.name, site: n.site, why: st.why.join(", "), id: n.id, kind: "node" }); }
  for (const x of S.inv.services) { const st = svcStatus(x); if (st.s === "down" || st.s === "warn") out.push({ s: st.s, name: x.name, site: x.site, why: st.why.join(", "), id: x.id, kind: "svc" }); }
  for (const v of S.m.lh || []) if (v.v >= 2) out.push({ s: v.v === 3 ? "down" : "warn", name: `Longhorn ${v.metric.pvc || v.metric.volume}`, site: v.metric.site || k8sSite(), why: v.v === 3 ? "faulted" : "degraded" });
  for (const p of S.m.podsBad || []) out.push({ s: "warn", name: `Pod ${p.metric.namespace}/${p.metric.pod}`, site: p.metric.site || k8sSite(), why: "not running" });
  for (const g of drift().unknown) out.push({ s: "warn", name: g.name, site: g.site, why: `Proxmox ${g.id} not in inventory` });
  for (const a of out) a.key = `${a.kind || "other"}:${a.id || a.name}`;
  return out.filter((x) => inSiteStrict(x.site)).sort((a, b) => alertLevel(b) - alertLevel(a));
}
function drift() {
  const known = new Set((S.invAll || S.inv).nodes.map((n) => n.pve).filter(Boolean));
  const pveSite = (node) => ((S.invAll || S.inv).nodes.find((n) => n.pve === `node/${node}`) || {}).site || null;
  const unknown = (S.m.pveGuest || []).filter((g) => !known.has(g.metric.id)).map((g) => ({ id: g.metric.id, name: g.metric.name, node: g.metric.node, site: g.metric.site || pveSite(g.metric.node) }));
  return { unknown };
}
function counts(items, fn) { const c = { up: 0, down: 0, warn: 0, stopped: 0, unknown: 0 }; items.forEach((i) => c[fn(i).s]++); return c; }

/* ---------------- small charts ---------------- */
function spark(series, color = "var(--accent)", max = 1) {
  if (!series || !series.length) return `<div class="faint">no data</div>`;
  const W = 500, H = 56, pts = series[0].values.map(([t, v]) => [t, parseFloat(v)]);
  if (pts.length < 2) return `<div class="faint">no data</div>`;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0], mx = Math.max(max, ...pts.map((p) => p[1]));
  const xy = pts.map(([t, v]) => [((t - t0) / (t1 - t0 || 1)) * W, H - 2 - (v / (mx || 1)) * (H - 6)]);
  const d = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="a" d="${d}L${W},${H}L0,${H}Z" fill="${color}"/><path class="l" d="${d}" stroke="${color}"/></svg>`;
}

/* ---------------- pages ---------------- */
const PAGES = {};

PAGES.overview = () => {
  const inv = S.inv, al = alerts();
  const nc = counts(inv.nodes, nodeStatus), sc = counts(inv.services, svcStatus);
  const pveNodes = inv.nodes.filter((n) => n.pve && n.pve.startsWith("node/"));
  const cpu = pveNodes.map((n) => byId("pveCpu", n.pve)).filter((v) => v != null);
  const memU = pveNodes.reduce((a, n) => a + (byId("pveMem", n.pve) || 0), 0), memM = pveNodes.reduce((a, n) => a + (byId("pveMemMax", n.pve) || 0), 0);
  const apps = (S.m.argo || []).map((a) => argo(a.metric.name));
  const pods = Object.fromEntries((S.m.pods || []).map((p) => [p.metric.phase, p.v]));
  const siteCard = (s) => {
    const ns = inv.nodes.filter((n) => n.site === s.id), ss = inv.services.filter((x) => x.site === s.id);
    const a = counts(ns, nodeStatus), b = counts(ss, svcStatus);
    const sal = al.filter((x) => x.site === s.id), lv = levelOf(sal);
    const worst = [...sal].sort((x, y) => alertLevel(y) - alertLevel(x))[0];
    const blds = (s.buildings || []).map((bd) => {
      const bal = sal.filter((x) => { const n = x.id && S.invAll.nodes.find((m) => m.id === x.id); const sv = x.kind === "svc" && S.invAll.services.find((m) => m.id === x.id); return n ? nodeBld(n) === bd.id : sv ? svcBld(sv) === bd.id : false; });
      return `<button class="ghost sm" data-sk="building" data-sid="${esc(bd.id)}" title="Show only ${esc(bd.name)}">${lvlChip(levelOf(bal), bd.name)}</button>`;
    }).join("");
    return `<div class="wtile l${lv}">
      <div class="wt-head"><span class="swatch" style="background:${esc(s.color)}"></span><b>${esc(s.name)}</b><span class="faint">${esc(s.title)}</span><span class="sp"></span>${lvlChip(lv)}</div>
      <div class="wt-why">${worst ? `${esc(worst.name)} — ${esc(worst.why)}${sal.length > 1 ? ` <span class="faint">+${sal.length - 1} more</span>` : ""}` : esc(s.summary)}</div>
      <div class="wt-nums"><span><b>${a.up}</b>/${ns.length} nodes up</span><span><b>${b.up}</b>/${ss.length} services up</span>${a.stopped ? `<span><b>${a.stopped}</b> stopped</span>` : ""}<span class="sp"></span><a href="#/inventory?site=${s.id}">Inventory</a><a href="#/services?site=${s.id}">Services</a></div>
      ${(s.buildings || []).length ? `<div class="wt-blds">${blds}</div>` : ""}
    </div>`;
  };
  const meter = (label, v, extra = "") => `<div class="meter"><span>${label}</span><span class="muted">${pct(v)} ${extra}</span>${bar(v)}</div>`;
  const capStore = ((ICC().capacity || {}).storage || []).filter((x) => !x.site || inSiteStrict(x.site));
  const hostLive = inv.nodes.filter((n) => !(n.pve && n.pve.startsWith("node/")) && ["physical", "nas", "vm"].includes(n.type)).map((n) => [n, nodeLive(n)]).filter(([, l]) => l && l.cpu != null);
  const ovCap = () => (pveNodes.length || capStore.length || hostLive.length ? `    <div class="card">
      <div class="title"><h2>Capacity${S.site !== "all" ? ` · ${esc(siteName(S.site))}` : ""}</h2><a href="#/monitoring">Dashboards</a></div>
      ${pveNodes.length ? meter("Proxmox CPU (avg)", cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : null) + meter("Proxmox RAM", memM ? memU / memM : null, `· ${gib(memU)} / ${gib(memM)}`) : ""}
      ${capStore.map((x) => { const u = byId("pveDisk", x.id), m = byId("pveDiskMax", x.id); return meter(esc(x.label || x.id), m ? u / m : null, m ? `· ${gib(u)} / ${gib(m)}` : ""); }).join("")}
      ${pveNodes.map((n) => { const u = byId("pveDisk", `storage/${n.pve.slice(5)}/local-lvm`), m = byId("pveDiskMax", `storage/${n.pve.slice(5)}/local-lvm`); return m ? meter(`${esc(n.name.split("-")[0])} local-lvm`, u / m) : ""; }).join("")}
      ${hostLive.slice(0, 8).map(([n, l]) => meter(`${esc(n.name.split("-")[0])} CPU`, l.cpu) + meter(`${esc(n.name.split("-")[0])} RAM`, l.mem)).join("")}
    </div>
` : "");
  const hasK8s = (S.m.k8sReady || []).length || apps.length || (S.m.lh || []).length;
  const ovK8s = () => (hasK8s && (!k8sSite() || inSiteStrict(k8sSite())) ? `    <div class="card">
      <div class="title"><h2>Kubernetes</h2><a href="#/k8s">Details</a></div>
      <div class="grid g3">
        <div class="kpi"><b>${(S.m.k8sReady || []).filter((r) => r.v === 1).length}/${(S.m.k8sReady || []).length}</b><span>nodes ready</span></div>
        <div class="kpi"><b>${pods.Running ?? "—"}</b><span>pods running</span></div>
        <div class="kpi"><b>${(S.m.lh || []).filter((v) => v.v === 1).length}/${(S.m.lh || []).length}</b><span>volumes healthy</span></div>
      </div>
      ${apps.length ? `<h3 style="margin-top:14px">ArgoCD</h3>
      <div class="chips">${apps.map((a) => `<span class="pill ${a.health === "Healthy" && a.sync === "Synced" ? "ok" : a.health === "Degraded" ? "bad" : "warn"}" title="${esc(a.sync)} / ${esc(a.health)}">${esc(a.name)}</span>`).join("")}</div>` : ""}
    </div>
` : "");
  return `
  <div class="hero">
    <h1>${esc((ICC().instance || {}).name || "Infra Command Center")}${scopeNote()}</h1>
    <p>${S.site === "all" ? `${inv.sites.length} site${inv.sites.length === 1 ? "" : "s"}, one view: inventory, live health, monitoring, plans and changes.` : esc([inv.sites[0].title, inv.sites[0].summary].filter(Boolean).join(" — "))}</p>
    <div class="stats">
      <div><b>${inv.nodes.length}</b><span>nodes</span></div>
      <div><b>${inv.services.length}</b><span>services</span></div>
      <div><b>${nc.up + sc.up}</b><span>healthy</span></div>
      <div><b>${al.filter((a) => a.s === "down").length}</b><span>down</span></div>
      <div><b>${al.filter((a) => a.s === "warn").length}</b><span>warnings</span></div>
      ${apps.length && (!k8sSite() || inSiteStrict(k8sSite())) ? `<div><b>${apps.length}</b><span>ArgoCD apps</span></div>` : ""}
    </div>
  </div>
  <div class="wmap">${inv.sites.map(siteCard).join("")}</div>
  <div class="grid g2" style="margin-top:16px">
${ovCap()}${ovK8s()}
    <div class="card">
      <div class="title"><h2>Recent changes</h2><a href="#/changelog">All</a></div>
      ${S.changelog ? `<ul class="list">${S.changelog.slice(0, 5).map((e) => `<li><span class="when">${esc(e.ts.slice(0, 10))}</span><div>${trim(e.summary, 170)} ${e.href ? `<a href="${esc(e.href)}" target="_blank" rel="noopener" aria-label="Details">${icon("external", "xs")}</a>` : ""}</div></li>`).join("")}</ul>` : '<div class="faint">loading…</div>'}
    </div>
    <div class="card">
      <div class="title"><h2>Planner · top priorities</h2><a href="#/planner">Planner</a></div>
      ${S.todo ? `<ul class="list">${S.todo.filter((t) => !t.done && inSite(t.site)).sort(taskSort).slice(0, 6).map((t) => `<li data-task="${t.i}" style="cursor:pointer">${prioPill(t)}<div style="flex:1"><b>${t.title}</b> ${dueChip(t)}<div class="muted" style="font-size:12.5px">${esc(t.section)}${t.owner !== AGENT() ? ` · waiting on ${esc(t.owner)}` : ""}</div></div></li>`).join("")}</ul>` : '<div class="faint">loading…</div>'}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="title"><h2>Quick links</h2></div>
    <div class="chips">${(S.inv.links || []).length ? "" : '<span class="faint">Add quick links under <code>links:</code> in inventory.yaml.</span>'}${(S.inv.links || []).map((l) => `<a class="pill" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}${icon("external", "xs")}</a>`).join("")}</div></div>`;
};
function hero(title, sub, stats) {
  return `<div class="hero"><h1>${title}${scopeNote()}</h1><p>${sub}</p>
    <div class="stats">${stats.filter(Boolean).map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div></div>`;
}
function trim(html, n) { const d = document.createElement("div"); d.innerHTML = html; const t = d.textContent; return t.length <= n ? html : esc(t.slice(0, n)) + "…"; }

PAGES.inventory = (params) => {
  const f = S.f; f.site = S.site;
  const inv = S.inv, q = f.q.toLowerCase();
  const rows = inv.nodes.filter((n) => (f.site === "all" || n.site === f.site) && (f.type === "all" || n.type === f.type))
    .map((n) => ({ n, st: nodeStatus(n), live: nodeLive(n) }))
    .filter((r) => f.status === "all" || r.st.s === f.status || (f.status === "problem" && ["down", "warn"].includes(r.st.s)))
    .filter((r) => !q || [r.n.name, r.n.ip, r.n.role, r.n.os, r.n.type, r.n.parent, r.n.notes].join(" ").toLowerCase().includes(q));
  const types = (inv.typeOrder || Object.keys(inv.types)).filter((t) => inv.nodes.some((n) => n.type === t));
  const d = drift();
  const parentName = (id) => (inv.nodes.find((n) => n.id === id) || {}).name || "";
  const rowHtml = ({ n, st, live }) => `<tr data-node="${esc(n.id)}">
      <td>${dot(st.s, st.why.join(", ") || st.s)}</td>
      <td><div class="nmcell">${logoImg(n.logo, "lg sm")}<div><b>${esc(n.name)}</b>${n.inferred ? ' <span class="pill" title="not confirmed from inside the host">inferred</span>' : ""}<div class="sub">${esc(n.os || "")}</div></div></div></td>
      <td>${sitePill(n.site)}</td>
      <td class="mono">${esc(n.ip || "—")}</td><td>${esc(n.role || "")}</td><td class="sub">${esc(parentName(n.parent))}</td>
      <td class="num">${live.cpu != null ? pct(live.cpu) + bar(live.cpu) : "—"}</td>
      <td class="num">${live.mem != null ? pct(live.mem) + bar(live.mem) : "—"}</td>
      <td class="num">${live.disk != null ? pct(live.disk) + bar(live.disk) : "—"}</td>
      <td class="num sub">${live.uptime ? dur(live.uptime) : ""}</td></tr>`;
  const cols = `<colgroup><col style="width:34px"><col style="width:18%"><col style="width:9%"><col style="width:12%"><col style="width:19%"><col style="width:12%"><col style="width:7.5%"><col style="width:7.5%"><col style="width:7.5%"><col style="width:7.5%"></colgroup>`;
  const thead = cols + `<thead><tr><th></th><th>Name</th><th>Site</th><th>IP</th><th>Role</th><th>Runs on</th><th>CPU</th><th>RAM</th><th>Disk</th><th>Uptime</th></tr></thead>`;
  const groupCard = (t, rs) => {
    const c = counts(rs.map((r) => r.n), nodeStatus);
    return `<div class="card pad0 scroll grp"><div class="grp-head">${logoImg((inv.types[t] || {}).logo, "lg md")}<h2>${esc(typeName(t))}</h2><span class="pill">${rs.length}</span>${c.down ? `<span class="pill bad">${c.down} down</span>` : ""}${c.warn ? `<span class="pill warn">${c.warn} warn</span>` : ""}${c.stopped ? `<span class="pill idle">${c.stopped} stopped</span>` : ""}</div>
      <table class="tbl">${thead}<tbody>${rs.map(rowHtml).join("")}</tbody></table></div>`;
  };
  const groups = (inv.typeOrder || Object.keys(inv.types)).map((t) => [t, rows.filter((r) => r.n.type === t)]).filter(([, rs]) => rs.length);
  const table = rows.length ? groups.map(([t, rs]) => groupCard(t, rs)).join("") : '<div class="card"><div class="empty">No matches.</div></div>';
  const tree = () => {
    const kids = (pid) => rows.filter((r) => (r.n.parent || null) === pid);
    const ids = new Set(rows.map((r) => r.n.id));
    const roots = rows.filter((r) => !r.n.parent || !ids.has(r.n.parent));
    const li = (r) => { const k = kids(r.n.id); return `<li><span class="n" data-node="${esc(r.n.id)}">${dot(r.st.s)}${logoImg(r.n.logo, "lg xs")}<b>${esc(r.n.name)}</b><span class="faint">${esc(typeName(r.n.type))} · ${esc(r.n.role || "")}</span></span>${k.length ? `<ul class="tree">${k.map(li).join("")}</ul>` : ""}</li>`; };
    return inv.sites.filter((s) => f.site === "all" || s.id === f.site).map((s) => `<div class="card" style="margin-bottom:14px"><h2>${sitePill(s.id)} ${esc(s.title)}</h2><ul class="tree root">${roots.filter((r) => r.n.site === s.id).map(li).join("")}</ul></div>`).join("");
  };
  return `${(() => { const c = counts(inv.nodes, nodeStatus); return hero("Inventory", "Every host, guest and device — live state from Proxmox, Kubernetes, windows_exporter and probes.", [[inv.nodes.length, "nodes"], [c.up, "up"], [c.down + c.warn, "alarms"], [c.stopped, "stopped (expected)"], [inv.nodes.filter((n) => ["physical", "nas"].includes(n.type)).length, "physical / NAS"], [inv.nodes.filter((n) => ["vm", "k3s", "lxc", "container"].includes(n.type)).length, "VMs & containers"], [d.unknown.length, "not in inventory"]]); })()}
  ${d.unknown.length ? `<div class="banner">${lvlChip(1, "")} ${d.unknown.length} Proxmox guest(s) are not in the inventory: ${d.unknown.map((g) => `<code>${esc(g.name)}</code> (${esc(g.id)} on ${esc(g.node)})`).join(", ")}</div>` : ""}
  <div class="filters">
    <input type="search" id="q" placeholder="Search name, IP, role…" value="${esc(f.q)}">
    <select data-f="type"><option value="all">All types</option>${types.map((t) => `<option value="${t}" ${f.type === t ? "selected" : ""}>${esc(typeName(t))}</option>`).join("")}</select>
    ${seg("status", [["all", "Any state"], ["up", "Up"], ["problem", "Problems"], ["stopped", "Stopped"], ["unknown", "Unknown"]])}
    <span class="sp"></span><span class="faint">${rows.length} of ${inv.nodes.length}</span>

  </div>
  ${f.view === "tree" ? tree() : table}`;
};
function seg(key, opts) { return `<div class="seg">${opts.map(([v, l]) => `<button data-f="${key}" data-v="${esc(v)}" class="${S.f[key] === v ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`; }

PAGES.services = (params) => {
  const f = S.f; f.site = S.site;
  const q = f.q.toLowerCase(), inv = S.inv;
  const list = inv.services.filter((x) => (f.site === "all" || x.site === f.site) && (!q || [x.name, x.desc, x.url, x.category].join(" ").toLowerCase().includes(q)));
  const card = (x) => {
    const st = svcStatus(x), d = byProbe("probeDur", x.id), tls = byProbe("probeTls", x.id), code = byProbe("probeCode", x.id), a = x.argocd ? argo(x.argocd) : null;
    const tag = x.url ? "a" : "div";
    return `<${tag} class="svc" ${x.url ? `href="${esc(x.url)}" target="_blank" rel="noopener"` : ""}>
      ${dot(st.s, st.why.join(", ") || st.s)}
      <div class="ic">${x.logo ? logoImg(x.logo, "lg", x.name) : esc(x.icon || "•")}</div>
      <div class="bd"><div class="nm">${esc(x.name)}</div><div class="ds">${esc(x.desc || "")}</div>
      <div class="mt">${sitePill(x.site)}${d != null && st.s !== "down" ? `<span class="pill">${ms(d)}</span>` : ""}${code ? `<span class="pill">HTTP ${code}</span>` : ""}${x.tls === "self-signed" ? '<span class="pill" title="appliance certificate, expiry not monitored">self-signed</span>' : tls != null && tls > 0 ? `<span class="pill ${tls < 14 * 86400 ? "warn" : ""}">TLS ${Math.floor(tls / 86400)}d</span>` : ""}${a ? `<span class="pill ${a.health === "Healthy" && a.sync === "Synced" ? "ok" : "warn"}" title="ArgoCD ${esc(a.sync)}/${esc(a.health)}">⎈ ${esc(a.name)}</span>` : ""}${st.why.length ? `<span class="pill bad">${esc(st.why.join(", "))}</span>` : ""}</div></div></${tag}>`;
  };
  return `${(() => { const c = counts(inv.services, svcStatus); const lat = inv.services.map((x) => byProbe("probeDur", x.id)).filter((v) => v != null); const tlsWarn = inv.services.filter((x) => { const t = byProbe("probeTls", x.id); return t != null && t < 14 * 86400 && x.tls !== "self-signed"; }).length;
  return hero("Services", "Every web UI and app — probed every 60 s, plus ArgoCD sync and health.", [[inv.services.length, "services"], [c.up, "up"], [c.down, "down"], [c.warn, "warnings"], [lat.length ? ms(lat.reduce((a, b) => a + b, 0) / lat.length) : "—", "avg response"], [tlsWarn, "TLS expiring"], [inv.services.filter((x) => x.argocd).length, "GitOps-managed"]]); })()}
  <div class="filters"><input type="search" id="q" placeholder="Search services…" value="${esc(f.q)}"><span class="sp"></span><span class="faint">${list.length} services</span></div>
  ${inv.categories.map((c) => { const xs = list.filter((x) => x.category === c); return xs.length ? `<h3 class="cat">${esc(c)}</h3><div class="grid cards">${xs.map(card).join("")}</div>` : ""; }).join("")}`;
};

PAGES.monitoring = () => {
  const g = S.inv.grafana || {}, theme = document.documentElement.dataset.theme;
  const ranges = [["1h", "1 h"], ["6h", "6 h"], ["24h", "24 h"], ["7d", "7 d"]];
  const allPubs = g.public || [], dashes = g.dashboards || [];
  const pubSites = [...new Set(allPubs.map((p) => p.site || ""))];
  if (S.site !== "all") S.gsite = S.site; else if (!pubSites.includes(S.gsite)) S.gsite = pubSites[0] || "";
  const pubs = allPubs.filter((p) => (p.site || "") === S.gsite);
  if (!pubs.find((p) => p.id === S.gtab)) S.gtab = pubs[0] && pubs[0].id;
  const cur = pubs.find((p) => p.id === S.gtab);
  const siteSeg = pubSites.length > 1 ? `<div class="seg site-seg">${pubSites.map((v) => `<button data-gsite="${esc(v)}" class="${S.gsite === v ? "on" : ""}">${esc(v ? siteName(v) : "All")}</button>`).join("")}</div>` : "";
  const up = S.m.up || [], probes = S.m.probe || [], win = S.m.winUp || [];
  const metricsOn = (ICC().features || {}).metrics;
  const head = hero("Monitoring", g.url ? `Live Grafana dashboards without login. Open <a href="${esc(g.url)}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">Grafana</a> for everything else.`
    : metricsOn ? "Probe and scrape health from the metrics backend. Add Grafana under <code>grafana:</code> in inventory.yaml to embed dashboards here." : "No metrics backend is configured (ICC_METRICS_URL). Bring your own Prometheus / VictoriaMetrics or enable the bundled one.",
    [[allPubs.length, "live dashboards"], [`${up.filter((x) => x.v === 1).length}/${up.length}`, "scrape targets up"], [`${probes.filter((x) => x.v === 1).length}/${probes.length}`, "probes OK"], win.length ? [`${win.filter((x) => x.v === 1).length}/${win.length}`, "Windows hosts"] : null, [dashes.length + pubs.length, "Grafana links"]]);
  const probeList = () => { const inv = S.invAll, nm = (id) => (inv.nodes.find((n) => n.id === id) || inv.services.find((x) => x.id === id) || {}).name || id;
    const rows = probes.filter((x) => inSite(x.metric.site)).sort((a, b) => a.v - b.v || nm(a.metric.probe_id).localeCompare(nm(b.metric.probe_id)));
    return `<div class="card pad0 scroll"><div class="title" style="padding:14px 16px 0"><h2>Probes</h2><span class="faint">blackbox exporter · every 60 s</span></div><table class="tbl"><thead><tr><th></th><th>Target</th><th>Module</th><th>Site</th><th>Latency</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td>${dot(x.v === 1 ? "up" : "down")}</td><td><b>${esc(nm(x.metric.probe_id))}</b> <span class="sub mono">${esc(x.metric.instance || "")}</span></td><td class="mono sub">${esc(x.metric.module || "")}</td><td>${x.metric.site ? sitePill(x.metric.site) : ""}</td><td class="num">${ms(byProbe("probeDur", x.metric.probe_id))}</td></tr>`).join("") || '<tr><td colspan="5" class="faint">No probe results yet. Targets come from the inventory (<code>probe:</code>), served at :8081/sd/probes.json.</td></tr>'}
      </tbody></table></div>`; };
  return `${head}
    ${allPubs.length ? `<div class="filters">${S.site === "all" ? siteSeg : ""}<div class="seg">${pubs.map((p) => `<button data-gtab="${esc(p.id)}" class="${p.id === S.gtab ? "on" : ""}">${esc(p.title)}</button>`).join("")}</div>
    ${cur ? `<div class="seg">${ranges.map(([v, l]) => `<button data-range="${v}" class="${S.range === v ? "on" : ""}">${l}</button>`).join("")}</div>` : ""}</div>` : ""}
  ${cur ? `<div class="card pad0"><iframe class="gf" style="height:${Number(cur.height) || 1000}px" src="${esc(g.url)}/public-dashboards/${esc(cur.token)}?from=now-${S.range}&to=now&theme=${theme}&refresh=1m" title="${esc(cur.title)}"></iframe></div>` : probeList()}
  ${g.url && (pubs.length || dashes.length) ? `<h3 class="cat">More in Grafana</h3>
  <div class="grid cards">${pubs.map((p) => ({ uid: p.uid, title: `${p.site ? siteName(p.site) + " · " : ""}${p.title}`, desc: "Same dashboard, full Grafana" })).concat(dashes.filter((d) => !d.site || d.site === S.gsite || S.site === "all")).map((d) => `<a class="card dash" href="${esc(g.url)}/d/${esc(d.uid)}" target="_blank" rel="noopener"><div><b>${esc(d.title)}</b><div class="muted" style="font-size:12.5px">${esc(d.desc || "")}</div></div><span>${icon("external", "xs")}</span></a>`).join("")}</div>` : ""}`;
};

PAGES.k8s = () => {
  const ks = k8sSite(), K = ICC().kubernetes || {}, L = ICC().links || {};
  if (ks && !inSiteStrict(ks)) return hero("Kubernetes &amp; GitOps", `There is no Kubernetes cluster at ${esc(siteName(S.site))}.`, []) + `<div class="card"><div class="empty">Nothing to show for this scope. <a href="#" data-site="${esc(ks)}">Switch to ${esc(siteName(ks))}</a> or <a href="#/inventory">see the inventory</a>.</div></div>`;
  if (!(S.m.k8sReady || []).length && !(S.m.argo || []).length && !(S.m.lh || []).length) return hero("Kubernetes &amp; GitOps", "No Kubernetes metrics yet.", []) + `<div class="card"><div class="empty">ICC reads kube-state-metrics, node-exporter, ArgoCD and Longhorn metrics from the metrics backend. Scrape them (see docs/monitoring.md) and mark your cluster nodes with <code>k8s: &lt;node name&gt;</code> in inventory.yaml.</div></div>`;
  const nodes = S.inv.nodes.filter((n) => n.k8s);
  const apps = (S.m.argo || []).map((a) => argo(a.metric.name)).sort((a, b) => a.name.localeCompare(b.name));
  const lh = (S.m.lh || []).map((v) => ({ pvc: v.metric.pvc, ns: v.metric.pvc_namespace, vol: v.metric.volume, node: v.metric.node, r: v.v,
    size: mv("lhSize", (m) => m.volume === v.metric.volume), used: mv("lhUsed", (m) => m.volume === v.metric.volume) }));
  const lhName = ["unknown", "healthy", "degraded", "faulted"];
  const lhCls = ["", "ok", "warn", "bad"];
  return `${(() => { const rd = S.m.k8sReady || []; const pods = Object.fromEntries((S.m.pods || []).map((p) => [p.metric.phase, p.v])); const rs = (S.m.restarts || []).reduce((a, r) => a + r.v, 0);
  return hero("Kubernetes &amp; GitOps", esc(K.description || "Cluster nodes, GitOps applications and storage volumes, live from metrics."), [[`${rd.filter((r) => r.v === 1).length}/${rd.length}`, "nodes ready"], [pods.Running ?? "—", "pods running"], [`${apps.filter((a) => a.sync === "Synced").length}/${apps.length}`, "apps synced"], [`${apps.filter((a) => a.health === "Healthy").length}/${apps.length}`, "apps healthy"], [`${lh.filter((v) => v.r === 1).length}/${lh.length}`, "volumes healthy"], [Math.round(rs), "restarts (24 h)"]]); })()}
  <div class="grid g3">${nodes.map((n) => { const l = nodeLive(n), st = nodeStatus(n); return `<div class="card" data-node="${esc(n.id)}" style="cursor:pointer"><div class="title"><h2>${dot(st.s)} ${esc(n.name)}</h2><span class="mono faint">${esc(n.ip)}</span></div>
    <div class="meter"><span>CPU</span><span class="muted">${pct(l.cpu)}</span>${bar(l.cpu)}</div><div class="meter"><span>Memory</span><span class="muted">${pct(l.mem)}</span>${bar(l.mem)}</div><div class="meter"><span>Root disk</span><span class="muted">${pct(l.disk)}</span>${bar(l.disk)}</div><div class="faint" style="font-size:12px">up ${dur(l.uptime)}</div></div>`; }).join("")}</div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card pad0 scroll"><div class="title" style="padding:14px 16px 0"><h2>ArgoCD applications</h2>${L.argocd ? `<a href="${esc(L.argocd)}" target="_blank" rel="noopener">Argo CD${icon("external", "xs")}</a>` : ""}</div>
      <table class="tbl"><thead><tr><th>App</th><th>Namespace</th><th>Sync</th><th>Health</th></tr></thead><tbody>
      ${apps.map((a) => `<tr><td>${L.argocd ? `<a href="${esc(L.argocd.replace(/\/$/, ""))}/applications/argocd/${esc(a.name)}" target="_blank" rel="noopener"><b>${esc(a.name)}</b></a>` : `<b>${esc(a.name)}</b>`}</td><td class="mono sub">${esc(a.ns)}</td><td><span class="pill ${a.sync === "Synced" ? "ok" : "warn"}">${esc(a.sync)}</span></td><td><span class="pill ${a.health === "Healthy" ? "ok" : a.health === "Degraded" ? "bad" : "warn"}">${esc(a.health)}</span></td></tr>`).join("") || '<tr><td colspan="4" class="faint">No ArgoCD metrics yet (scrape job argocd).</td></tr>'}
      </tbody></table></div>
    <div class="card pad0 scroll"><div class="title" style="padding:14px 16px 0"><h2>Longhorn volumes</h2>${L.longhorn ? `<a href="${esc(L.longhorn)}" target="_blank" rel="noopener">Longhorn${icon("external", "xs")}</a>` : ""}</div>
      <table class="tbl"><thead><tr><th>PVC</th><th>Namespace</th><th>State</th><th>Used</th></tr></thead><tbody>
      ${lh.sort((a, b) => b.r - a.r).map((v) => `<tr><td><b>${esc(v.pvc || v.vol)}</b></td><td class="mono sub">${esc(v.ns || "")}</td><td><span class="pill ${lhCls[v.r] || ""}">${lhName[v.r] || v.r}</span></td><td class="num">${v.size ? bar(v.used / v.size) + gib(v.used) + " / " + gib(v.size) : "—"}</td></tr>`).join("") || '<tr><td colspan="4" class="faint">No Longhorn metrics yet (scrape job longhorn).</td></tr>'}
      </tbody></table></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="title"><h2>Pod restarts (24 h)</h2></div>
    ${(S.m.restarts || []).length ? `<ul class="list">${S.m.restarts.map((r) => `<li><span class="pill warn">${Math.round(r.v)}×</span><span class="mono">${esc(r.metric.namespace)}/${esc(r.metric.pod)}</span></li>`).join("")}</ul>` : '<div class="alert-ok">' + dot("up") + " No container restarts in the last 24 h.</div>"}</div>`;
};

const PRIO = { P1: ["bad", "P1 · urgent"], P2: ["warn", "P2 · important"], P3: ["idle", "P3 · nice to have"] };
const STATUS = [["backlog", "Backlog", icon("backlog")], ["next", "Next up", icon("next")], ["doing", "In progress", icon("doing")], ["waiting", "Waiting", icon("waiting")], ["done", "Done", icon("done")]];
const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (d) => Math.round((Date.parse(d) - Date.parse(today())) / 86400000);
function dueChip(t) {
  if (!t.due || t.done) return "";
  const n = daysTo(t.due), cls = n < 0 ? "bad" : n <= 7 ? "warn" : "";
  return `<span class="pill ${cls}" title="due ${esc(t.due)}">⏱ ${n < 0 ? `${-n} d overdue` : n === 0 ? "today" : n <= 60 ? `in ${n} d` : esc(t.due)}</span>`;
}
const prioPill = (t) => `<span class="pill ${PRIO[t.prio][0]}" title="${PRIO[t.prio][1]}">${t.prio}</span>`;
const ownerPill = (t) => (t.owner && t.owner !== AGENT() ? `<span class="pill owner" title="waiting on / owned by">${esc(t.owner)}</span>` : "");
const taskSort = (a, b) => a.prio.localeCompare(b.prio) || (a.due || "9999").localeCompare(b.due || "9999") || a.i - b.i;
function taskCard(t) {
  const n = t.due && !t.done ? daysTo(t.due) : null;
  return `<div class="task p${t.prio[1]} ${t.done ? "is-done" : ""}" data-task="${t.i}" tabindex="0" title="${esc(t.section)} · ${t.prio}${t.due ? ` · due ${esc(t.due)}` : ""}${t.owner !== AGENT() ? ` · ${esc(t.owner)}` : ""}"><span class="pmark p${t.prio[1]}">${t.prio}</span><span>${t.title}</span>${n !== null && n <= 7 ? `<span class="tdot ${n < 0 ? "bad" : "warn"}"></span>` : ""}${t.owner !== AGENT() && !t.done ? '<span class="tdot owner"></span>' : ""}</div>`;
}
PAGES.docs = () => {
  const q = S.f.q.trim().toLowerCase();
  let results = "";
  if (q) {
    const words = q.split(/\s+/);
    const hits = (S.docs || []).map((d) => { const t = (d.title + " " + d.text).toLowerCase(); const score = words.reduce((a, w) => a + (t.includes(w) ? 1 + (d.title.toLowerCase().includes(w) ? 2 : 0) : -99), 0); return { d, score }; })
      .filter((h) => h.score > 0 && (S.site === "all" || !/^sites\/[^/]+\//.test(h.d.location) || h.d.location.startsWith(`sites/${S.site}/`))).sort((a, b) => b.score - a.score).slice(0, 25);
    const inv = [...S.inv.nodes, ...S.inv.services].filter((x) => words.every((w) => JSON.stringify(x).toLowerCase().includes(w))).slice(0, 10);
    const snippet = (txt) => { const t = txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); const i = Math.max(0, t.toLowerCase().indexOf(words[0]) - 60); let s = esc(t.slice(i, i + 220)); words.forEach((w) => { if (w.length > 1) s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`); }); return (i ? "…" : "") + s + "…"; };
    results = `<div class="grid g2">
      ${S.docs ? "" : "<!--"}<div class="card"><h2>Docs (${hits.length})</h2>${hits.length ? `<ul class="list">${hits.map(({ d }) => `<li><div><a href="${DOCS}${esc(d.location)}" target="_blank" rel="noopener"><b>${esc(d.title)}</b></a> <span class="faint mono">${esc(d.location)}</span><div class="muted" style="font-size:12.5px">${snippet(d.text)}</div></div></li>`).join("")}</ul>` : '<div class="empty">No docs match.</div>'}</div>${S.docs ? "" : "-->"}
      <div class="card"><h2>Inventory (${inv.length})</h2>${inv.length ? `<ul class="list">${inv.map((x) => `<li>${x.category ? dot(svcStatus(x).s) : dot(nodeStatus(x).s)}<div><b ${x.category ? "" : `data-node="${esc(x.id)}" style="cursor:pointer"`}>${esc(x.name)}</b> ${sitePill(x.site)}<div class="muted">${esc(x.role || x.desc || "")}</div></div></li>`).join("")}</ul>` : '<div class="empty">No inventory match.</div>'}</div></div>`;
  }
  const sections = ((ICC().docs || {}).sections || []).map((x) => [x.name, x.path]);
  return `${hero("Docs", DOCS ? `Search the <a href="${DOCS}" target="_blank" rel="noopener">documentation</a> and the inventory together.` : "Search the inventory. Connect a MkDocs site (ICC_DOCS_URL) to search the documentation here too.", [[S.docs ? new Set(S.docs.map((d) => d.location.split("#")[0])).size : "—", "doc pages"], [(S.changelog || []).length, "changelog entries"], [S.inv.nodes.length + S.inv.services.length, "inventory items"]])}
  <div class="filters"><input type="search" id="q" placeholder="Search docs and inventory… (e.g. qnap nfs)" value="${esc(S.f.q)}" style="max-width:640px"></div>
  ${results || (!sections.length ? "" : `<div class="card" style="margin-bottom:16px"><h2>Sections</h2><div class="chips">${sections.map(([l, p]) => `<a class="pill" href="${DOCS}${p}" target="_blank" rel="noopener">${esc(l)}${icon("external", "xs")}</a>`).join("")}</div></div>`)}`;
};

PAGES.planner = () => {
  const f = S.f, all = S.todo && S.todo.filter((t) => inSite(t.site));
  if (!all) return `${hero("Planner", "Loading the plan from Git…", [])}<div class="card"><div class="faint">loading…</div></div>`;
  const areas = [...new Set(all.map((t) => t.section))];
  const q = f.q.trim().toLowerCase();
  const items = all.filter((t) => (f.area === "all" || t.section === f.area) && (f.prio === "all" || t.prio === f.prio) && (!q || q.split(/\s+/).every((w) => (t.text + " " + t.section + " " + t.owner).toLowerCase().includes(w))));
  const open = all.filter((t) => !t.done);
  const dueSoon = open.filter((t) => t.due && daysTo(t.due) <= 14);
  const overdue = open.filter((t) => t.due && daysTo(t.due) < 0);
  const doneWeek = all.filter((t) => t.done && t.doneAt && daysTo(t.doneAt) >= -7);
  const head = hero("Planner", `Everything that is planned, in progress or waiting — read live from ${repoLink("planner.md")} in Git.`, [
    [open.length, "open"], [open.filter((t) => t.prio === "P1").length, "P1 urgent"], [open.filter((t) => t.status === "doing").length, "in progress"],
    [open.filter((t) => t.owner !== AGENT()).length, "waiting on people"], [overdue.length ? overdue.length : dueSoon.length, overdue.length ? "overdue" : "due in 14 days"], [doneWeek.length, "done this week"]]);
  const areaCards = `<div class="areas">${areas.map((a) => { const ts = all.filter((t) => t.section === a), d = ts.filter((t) => t.done).length, p1 = ts.filter((t) => !t.done && t.prio === "P1").length;
    return `<button class="area-card ${f.area === a ? "on" : ""}" data-f="area" data-v="${f.area === a ? "all" : esc(a)}"><div class="row"><b>${esc(a)}</b><span class="sp"></span>${p1 ? `<span class="pill bad">${p1} P1</span>` : ""}</div>
      <div class="muted">${ts.length - d} open · ${d} done</div><div class="prog"><i style="width:${ts.length ? (100 * d) / ts.length : 0}%"></i></div></button>`; }).join("")}</div>`;
  const filters = `<div class="filters"><input type="search" id="q" placeholder="Filter tasks… (text, area, owner)" value="${esc(f.q)}">
    ${seg("prio", [["all", "All priorities"], ["P1", "P1"], ["P2", "P2"], ["P3", "P3"]])}
    <span class="sp"></span><span class="faint">${items.filter((t) => !t.done).length} open shown</span>
    ${seg("pview", [["board", "Board"], ["list", "List"], ["timeline", "Timeline"]])}
    ${repoFile("planner.md").url ? repoLink("planner.md", "Open in Git") : ""}</div>`;
  let body;
  if (f.pview === "list") {
    body = areas.filter((a) => items.some((t) => t.section === a)).map((a) => `<div class="card pad0 grp"><div class="grp-head"><h2>${esc(a)}</h2><span class="pill">${items.filter((t) => t.section === a && !t.done).length} open</span></div>
      <table class="tbl"><thead><tr><th></th><th>Pri</th><th>Task</th><th>Status</th><th>Due</th><th>Owner</th></tr></thead><tbody>
      ${items.filter((t) => t.section === a).sort((x, y) => x.done - y.done || taskSort(x, y)).map((t) => `<tr data-task="${t.i}" class="${t.done ? "faint" : ""}" style="cursor:pointer"><td>${t.done ? icon("done") : ""}</td><td>${prioPill(t)}</td><td><b>${t.title}</b><div class="sub">${esc(t.details.replace(/<[^>]+>/g, "").slice(0, 110))}${t.details.length > 110 ? "…" : ""}</div></td><td>${esc(STATUS.find((s) => s[0] === t.status)[1])}</td><td>${t.done ? esc(t.doneAt || "") : dueChip(t) || '<span class="faint">—</span>'}</td><td class="sub">${esc(t.owner)}</td></tr>`).join("")}
      </tbody></table></div>`).join("") || '<div class="card"><div class="empty">No tasks match.</div></div>';
  } else if (f.pview === "timeline") {
    const dated = items.filter((t) => !t.done && t.due).sort((a, b) => a.due.localeCompare(b.due));
    const months = [...new Set(dated.map((t) => t.due.slice(0, 7)))];
    const undated = items.filter((t) => !t.done && !t.due).sort(taskSort);
    body = `<div class="card"><h2>Scheduled</h2>${months.length ? `<ul class="tl">${months.map((m) => `<li><div class="tl-date">${new Date(m + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div><div class="board-col-list">${dated.filter((t) => t.due.startsWith(m)).map(taskCard).join("")}</div></li>`).join("")}</ul>` : '<div class="empty">Nothing has a due date.</div>'}</div>
      <div class="card" style="margin-top:16px"><div class="title"><h2>No date yet</h2><span class="muted">${undated.length} tasks — ordered by priority</span></div><div class="board-grid">${undated.map(taskCard).join("")}</div></div>`;
  } else {
    body = `<div class="board">${STATUS.map(([s, l, ic]) => { let ts = items.filter((t) => t.status === s).sort(s === "done" ? (a, b) => (b.doneAt || "").localeCompare(a.doneAt || "") : taskSort);
      const n = ts.length; if (s === "done") ts = ts.slice(0, 8);
      return `<div class="board-col col-${s}"><div class="board-head"><span class="bh-ic">${ic}</span><b>${l}</b><span class="pill">${n}</span></div><div class="board-col-list">${ts.map(taskCard).join("") || '<div class="faint" style="padding:8px 4px">—</div>'}${s === "done" && n > 8 ? `<div class="faint" style="padding:6px 4px">+ ${n - 8} more (List view)</div>` : ""}</div></div>`; }).join("")}</div>`;
  }
  return head + areaCards + filters + body;
};
function openTask(i) {
  const t = S.todo[i]; if (!t) return;
  const st = STATUS.find((s) => s[0] === t.status);
  $("#drawer").innerHTML = `<button class="x" aria-label="Close">×</button>
    <div class="row" style="gap:6px;margin-bottom:8px">${prioPill(t)}${t.site ? sitePill(t.site) : ""}<span class="pill area">${esc(t.section)}</span><span class="pill">${st[2]} ${esc(st[1])}</span>${dueChip(t)}</div>
    <h1 style="margin:0 0 10px">${t.title}</h1>
    <p style="line-height:1.6">${t.details || '<span class="faint">No details.</span>'}</p>
    <dl class="kv"><dt>Priority</dt><dd>${esc(PRIO[t.prio][1])}</dd><dt>Status</dt><dd>${esc(st[1])}</dd><dt>Due</dt><dd>${esc(t.due || "—")}</dd><dt>Owner</dt><dd>${esc(t.owner)}</dd>${t.doneAt ? `<dt>Done</dt><dd>${esc(t.doneAt)}</dd>` : ""}</dl>
    <p style="margin-top:16px">${repoLink("planner.md")}</p>`;
  $("#drawer").hidden = false;
}
const entrySites = (e) => (e._sites ??= sitesOf(e.summary.replace(/<[^>]+>/g, " ")));
const inSiteAny = (e) => S.site === "all" || !entrySites(e).length || entrySites(e).includes(S.site);
const siteTags = (e) => (entrySites(e).length ? entrySites(e).map(sitePill).join("") : '<span class="pill idle" title="not site-specific">all sites</span>');
PAGES.changelog = () => {
  const q = S.f.q.toLowerCase();
  const items = (S.changelog || []).filter((e) => inSiteAny(e) && (!q || (e.summary + e.author + e.ts).toLowerCase().includes(q)));
  let lastDay = "";
  return `${(() => { const all = S.changelog || []; const now = Date.now(); const ago = (d) => all.filter(inSiteAny).filter((e) => now - Date.parse(e.ts.replace(" ", "T")) < d * 86400000).length;
  const allS = all.filter(inSiteAny); return hero("Changelog", `Every infrastructure change, newest first — from ${repoLink("changelog.md")} in Git.`, [[allS.length, "changes"], [ago(1), "last 24 h"], [ago(7), "last 7 days"], [allS[0] ? allS[0].ts.slice(0, 10) : "—", "latest"], [new Set(allS.map((e) => e.author)).size, "authors"]]); })()}
  <div class="filters"><input type="search" id="q" placeholder="Filter changes…" value="${esc(S.f.q)}"><span class="sp"></span><span class="faint">${items.length} entries</span></div>
  <div class="card"><ul class="tl">${items.map((e) => { const dt = new Date(e.ts.replace(" ", "T")); const day = dayKey(dt); const h = day !== lastDay ? `<li class="day">${esc(dt.toLocaleDateString(undefined, { timeZone: S_TZ, weekday: "short", year: "numeric", month: "short", day: "numeric" }))}</li>` : ""; lastDay = day; return `${h}<li><div class="meta">${esc(fmtTime(dt))} · ${esc(e.author)} ${siteTags(e)}</div><div>${e.summary}</div>${e.href ? `<a href="${esc(e.href)}" target="_blank" rel="noopener">Details${icon("external", "xs")}</a>` : ""}</li>`; }).join("") || '<li class="faint">${S.changelog ? "No changes recorded yet. Add lines to changelog.md (or ask the AI to do it with every change)." : "loading…"}</li>'}</ul></div>`;
};

/* ---------------- drawer ---------------- */
async function openNode(id) {
  const I = S.invAll || S.inv;
  const n = I.nodes.find((x) => x.id === id); if (!n) return;
  const st = nodeStatus(n), live = nodeLive(n), dr = $("#drawer");
  const parent = I.nodes.find((x) => x.id === n.parent);
  const children = I.nodes.filter((x) => x.parent === n.id);
  const svcs = I.services.filter((x) => x.runs_on === n.id);
  const G = S.inv.grafana || {}, NL = G.nodeLinks || {};
  const tpl = (k) => (NL[k] && G.url ? G.url.replace(/\/$/, "") + NL[k].replace(/\{(\w+)\}/g, (_, f) => encodeURIComponent(n[f] || "")) : null);
  const gLink = (n.win && tpl("win")) || (n.k8s && tpl("k8s")) || (n.pve && tpl("pve")) || null;
  dr.innerHTML = `<button class="x" aria-label="Close">×</button>
    <div class="row">${logoImg(n.logo, "lg md")}${dot(st.s)}<h1 style="margin:0">${esc(n.name)}</h1></div>
    <div class="row" style="margin-top:6px">${sitePill(n.site)}<span class="pill">${esc(typeName(n.type))}</span>${n.inferred ? '<span class="pill">inferred</span>' : ""}${n.expect === "stopped" ? '<span class="pill idle">expected stopped</span>' : ""}</div>
    ${st.why.length ? `<div class="banner" style="margin-top:12px">${esc(st.why.join(" · "))}</div>` : ""}
    <dl class="kv">
      <dt>Role</dt><dd>${esc(n.role || "—")}</dd><dt>OS / model</dt><dd>${esc(n.os || "—")}</dd>
      <dt>IP</dt><dd class="mono">${esc(n.ip || "—")}</dd>${n.url ? `<dt>Web UI</dt><dd><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.url)}</a></dd>` : ""}
      <dt>Runs on</dt><dd>${parent ? `<a href="#" data-node="${esc(parent.id)}">${esc(parent.name)}</a>` : "—"}</dd>
      ${children.length ? `<dt>Hosts</dt><dd>${children.map((c) => `<a href="#" data-node="${esc(c.id)}">${esc(c.name)}</a>`).join(", ")}</dd>` : ""}
      ${svcs.length ? `<dt>Services</dt><dd>${svcs.map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)).join(", ")}</dd>` : ""}
      <dt>Probe</dt><dd>${esc(n.probe || "none")}${byProbe("probeDur", n.id) != null ? ` · ${ms(byProbe("probeDur", n.id))}` : ""}</dd>
      ${n.pve ? `<dt>Proxmox</dt><dd class="mono">${esc(n.pve)}</dd>` : ""}
      ${live.uptime ? `<dt>Uptime</dt><dd>${dur(live.uptime)}</dd>` : ""}
      ${live.memMax ? `<dt>Memory</dt><dd>${gib(live.memB)} / ${gib(live.memMax)}</dd>` : ""}
      ${n.notes ? `<dt>Notes</dt><dd>${esc(n.notes)}</dd>` : ""}
    </dl>
    <div class="row">${docLink(n.docs, "Documentation")}${gLink ? `<a href="${esc(gLink)}" target="_blank" rel="noopener">Grafana${icon("external", "xs")}</a>` : ""}</div>
    <div id="charts" style="margin-top:18px"></div>`;
  dr.hidden = false;
  const cpuQ = n.win ? `1 - avg(rate(windows_cpu_time_seconds_total{mode="idle",hostname="${n.win}"}[5m]))` : n.k8s ? `1 - avg(rate(node_cpu_seconds_total{mode="idle",node="${n.k8s}"}[5m]))` : n.pve ? `pve_cpu_usage_ratio{id="${n.pve}"}` : null;
  const memQ = n.win ? `1 - windows_memory_available_bytes{hostname="${n.win}"} / windows_memory_physical_total_bytes{hostname="${n.win}"}` : n.k8s ? `1 - avg(node_memory_MemAvailable_bytes{node="${n.k8s}"} / node_memory_MemTotal_bytes{node="${n.k8s}"})` : n.pve ? `pve_memory_usage_bytes{id="${n.pve}"} / pve_memory_size_bytes{id="${n.pve}"}` : null;
  const prQ = n.probe && n.probe !== "none" ? `probe_duration_seconds{probe_id="${n.id}"}` : null;
  const box = $("#charts");
  const parts = [];
  if (cpuQ) parts.push(["CPU · 6 h", promr(cpuQ), "#818cf8", 1]);
  if (memQ) parts.push(["Memory · 6 h", promr(memQ), "#14b8a6", 1]);
  if (prQ) parts.push(["Probe latency · 6 h", promr(prQ), "#f59e0b", 0]);
  if (!parts.length) { box.innerHTML = '<div class="faint">No time series for this item.</div>'; return; }
  const res = await Promise.all(parts.map((p) => p[1]));
  box.innerHTML = parts.map((p, i) => `<h3>${p[0]}</h3>${spark(res[i], p[2], p[3])}`).join("");
}
function openAttention() {
  const al = alerts(), dr = $("#drawer");
  dr.innerHTML = `<button class="x" aria-label="Close">×</button>
    <h1 style="margin:0 0 4px">Alarms</h1><p class="lead">${al.length ? `${al.length} active alarm${al.length === 1 ? "" : "s"}.` : "No active alarms — everything monitored is healthy."}</p>
    ${al.length ? `<ul class="list">${al.map((a) => `<li>${dot(a.s)}<div style="flex:1"><div class="row"><b ${a.kind === "node" ? `data-node="${esc(a.id)}" style="cursor:pointer"` : ""}>${esc(a.name)}</b>${sitePill(a.site)}<span class="sp"></span>${lvlChip(alertLevel(a))}${alarmAction(a)}</div><div class="muted">${esc(a.why)}</div>${a.kind === "svc" ? (() => { const x = S.inv.services.find((s) => s.id === a.id); return x && x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)} ${icon("external")}</a>` : ""; })() : ""}</div></li>`).join("")}</ul>` : `<div class="alert-ok">${dot("up")} All good.</div>`}
    <p class="faint" style="margin-top:18px;font-size:12px">Sources: blackbox probes, Proxmox, Kubernetes, ArgoCD, Longhorn, windows_exporter. Updated ${S.updated ? fmtTime(S.updated) : "—"}.</p>`;
  dr.hidden = false;
}
PAGES.alarms = () => {
  const al = alerts();
  return `${hero("Alarms", `Everything monitored that is down or degraded right now, worst first. Current level: ${LVL[levelOf(al)].toLowerCase()}.`, [[levelOf(al), "warning level"], [al.length, "active"], [al.filter((a) => alertLevel(a) === 3).length, "take action"], [al.filter((a) => alertLevel(a) === 2).length, "be prepared"], [al.filter((a) => alertLevel(a) === 1).length, "be aware"]])}
  <div class="card">${al.length ? `<ul class="list">${al.map((a) => `<li>${dot(a.s)}<div style="flex:1"><div class="row"><b ${a.kind === "node" ? `data-node="${esc(a.id)}" style="cursor:pointer"` : ""}>${esc(a.name)}</b>${sitePill(a.site)}<span class="sp"></span>${lvlChip(alertLevel(a))}${alarmAction(a)}</div><div class="muted">${esc(a.why)}</div></div></li>`).join("")}</ul>` : '<div class="empty">No active alarms — everything monitored is healthy.</div>'}</div>`;
};
const _invRaw = PAGES.inventory;
PAGES.topology = (p) => { S.f.view = "tree"; return _invRaw(p); };
PAGES.sites = () => (window.sitesPage ? window.sitesPage() : "");
PAGES.config = () => (window.configPage ? window.configPage() : "");
PAGES.activity = (p) => (window.activityPage ? window.activityPage(p) : "");
/* menu groups: Design = inventory/topology/services, Monitor = dashboards/kubernetes/alarms, Changelog = changes/admin activity */
const GROUPS = {
  design: [["sites", "Sites"], ["inventory", "Inventory"], ["topology", "Topology"], ["services", "Services"], ["config", "Config"]],
  monitor: [["monitoring", "Dashboards"], ["k8s", "Kubernetes"], ["alarms", "Alarms"]],
  changelog: [["changelog", "Changes"], ["activity", "Admin activity"]],
};
const GROUP_OF = {}; for (const [g, tabs] of Object.entries(GROUPS)) for (const [r] of tabs) GROUP_OF[r] = g;
for (const [g, tabs] of Object.entries(GROUPS)) {
  for (const [r] of tabs) {
    const inner = PAGES[r];
    PAGES[r] = (p) => {
      if (r === "inventory") S.f.view = "table";
      return `<div class="tabs">${tabs.map(([t, l]) => `<a href="#/${t}" class="${t === r ? "on" : ""}">${l}</a>`).join("")}</div>` + inner(p);
    };
  }
  if (!tabs.some(([t]) => t === g)) PAGES[g] = () => { location.replace(`#/${tabs[0][0]}`); return ""; }; // a group whose first tab is the group itself (changelog) keeps its page
}
function renderSiteSel() {
  const el = $("#site-sel"); if (!el || !S.invAll) return;
  const nAl = alerts().length;
  el.innerHTML = `<button class="ghost scope-btn" id="scope-btn" title="Choose region, site, building or floor" aria-haspopup="true">${icon(S.scope.k === "all" ? "all" : S.scope.k)}<span class="hb-main"><small>Scope</small><b>${esc(scopeLabel())}</b></span><span class="sp"></span>${icon("chevron")}</button>`;
  document.body.dataset.scope = S.site;
}
function openScope() {
  if ($("#scope-pop")) return $("#scope-pop").remove();
  const a = S.invAll, sc = S.scope;
  const cnt = (f) => a.nodes.filter(f).length;
  const item = (k, id, label, depth, n, sub = "") => `<button class="sc-item ${sc.k === k && (k === "all" || sc.id === id) ? "on" : ""}" data-sk="${k}" data-sid="${esc(id || "")}" style="padding-left:${10 + depth * 16}px"><span class="sc-ic">${icon(k)}</span><span>${esc(label)}${sub ? ` <span class="faint">${esc(sub)}</span>` : ""}</span><span class="sp"></span><span class="faint">${n}</span></button>`;
  let h = item("all", "", "All sites", 0, a.nodes.length);
  for (const r of a.regions || []) {
    const rs = a.sites.filter((s) => s.region === r.id);
    h += item("region", r.id, r.name, 0, cnt((n) => rs.some((s) => s.id === n.site)));
    for (const s of rs) {
      h += item("site", s.id, s.name, 1, cnt((n) => n.site === s.id), s.title);
      for (const b of s.buildings || []) {
        h += item("building", b.id, b.name, 2, cnt((n) => n.site === s.id && nodeBld(n) === b.id));
        for (const f of b.floors || []) h += item("floor", `${b.id}/${f.id}`, f.name, 3, cnt((n) => n.floor === `${b.id}/${f.id}`));
      }
    }
  }
  const pop = document.createElement("div"); pop.id = "scope-pop"; pop.className = "scope-pop";
  pop.innerHTML = h + `<a class="sc-edit" href="#/sites">${icon("building")}Site structure (Design › Sites)</a>`;
  $("#site-sel").appendChild(pop);
}
/* per-alarm action: Hermes checks the alarm and fixes it if safe (portal.js does the call) */
function alarmAction(a) {
  const job = (S.hermes || []).find((x) => x.kind === "alarm" && x.alarm && x.alarm.key === a.key && (x.status === "running" || x.status === "queued"));
  if (job) return `<button class="ghost sm busy" data-job="${esc(job.id)}">${icon("hermes")}Hermes ${esc(job.status)} · log</button>`;
  const last = (S.hermes || []).find((x) => x.kind === "alarm" && x.alarm && x.alarm.key === a.key);
  const down = S.hHealth && !S.hHealth.ok;
  return `${last ? `<button class="ghost sm" data-job="${esc(last.id)}" title="Last Hermes run on this alarm">${esc(last.status)}</button>` : ""}<button class="ghost sm" data-fix="${esc(a.key)}" ${down ? 'disabled title="Hermes is not reachable"' : 'title="Hermes checks the alarm, finds the cause and fixes it if safe; otherwise it adds a Planner task"'}>${icon("play")}Check &amp; fix</button>`;
}
function closeDrawer() { $("#drawer").hidden = true; }

/* ---------------- router & events ---------------- */
function route() {
  const [path, qs] = (location.hash.slice(2) || "").split("?");
  const name = PAGES[path] ? path : "overview";
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.r === (GROUP_OF[name] || name)));
  return { name, params };
}
let current = null;
function render(keepFocus = false) {
  if (!S.inv) return;
  const r = route();
  if (current !== r.name) { S.f.q = ""; current = r.name; }
  if (r.params.site && r.params.site !== S.site) { S.scope = { k: "site", id: r.params.site }; localStorage.setItem("scope", JSON.stringify(S.scope)); scopeInv(); history.replaceState(null, "", location.hash.split("?")[0]); }
  renderSiteSel();
  const focus = keepFocus && document.activeElement && document.activeElement.id === "q" ? document.activeElement.selectionStart : null;
  $("#app").innerHTML = PAGES[r.name](r.params);
  if (focus !== null) { const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(focus, focus); } }
  const al = alerts();
  { const lv = levelOf(al); $("#health-mini").innerHTML = `<button class="ghost health-btn" id="attn" title="Show alarms">${lvlChip(lv, "")}<span>${al.length ? `${al.length} alarm${al.length === 1 ? "" : "s"} · ${LVL[lv]}` : "No alarms"}</span><span class="sp"></span>${icon("bell")}</button>`; }
  $("#updated").textContent = S.updated ? `Updated ${fmtTime(S.updated)}${S.m.failed ? ` · ${S.m.failed} queries failed` : ""}` : "";
}
document.addEventListener("click", (e) => {
  if (e.target.closest("select, input")) return; // form controls are handled by change/input
  const sb = e.target.closest("button[data-site],a[data-site]"); if (sb) { e.preventDefault(); return setSite(sb.dataset.site); }
  const sk = e.target.closest("button[data-sk]"); if (sk) { e.preventDefault(); return setScope(sk.dataset.sk, sk.dataset.sid); }
  if (e.target.closest("#scope-btn")) { e.preventDefault(); return openScope(); }
  if ($("#scope-pop") && !e.target.closest("#scope-pop")) $("#scope-pop").remove();
  const t = e.target.closest("[data-node],[data-task],[data-f],[data-range],[data-gtab],[data-gsite],.x,#theme,#attn");
  if (!t) { if (!$("#drawer").hidden && !e.target.closest("#drawer")) closeDrawer(); return; }
  if (t.matches(".x")) return closeDrawer();
  if (t.id === "attn") { e.stopPropagation(); return openAttention(); }
  if (t.dataset.task !== undefined && !t.dataset.f) { e.stopPropagation(); return openTask(+t.dataset.task); }
  if (t.id === "theme") { const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; localStorage.setItem("theme", n); return render(); }
  if (t.dataset.node) { e.preventDefault(); return openNode(t.dataset.node); }
  if (t.dataset.f && t.tagName !== "SELECT" && t.dataset.v !== undefined) { S.f[t.dataset.f] = t.dataset.v; if (t.dataset.f === "site") history.replaceState(null, "", location.hash.split("?")[0]); return render(); }
  if (t.dataset.range) { S.range = t.dataset.range; return render(); }
  if (t.dataset.gtab) { S.gtab = t.dataset.gtab; return render(); }
  if (t.dataset.gsite) return setSite(t.dataset.gsite);
});
document.addEventListener("change", (e) => { if (e.target.dataset.f) { S.f[e.target.dataset.f] = e.target.value; render(); } });
document.addEventListener("input", (e) => { if (e.target.id === "q") { S.f.q = e.target.value; render(true); } });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) { const q = $("#q"); if (q) { e.preventDefault(); q.focus(); } }
});
window.addEventListener("hashchange", () => { closeDrawer(); render(); window.scrollTo(0, 0); });

async function boot() {
  const saved = localStorage.getItem("theme"); if (saved) document.documentElement.dataset.theme = saved;
  try {
    const r = await fetch("/papi/inventory.json", { cache: "no-cache", credentials: "same-origin" });
    if (r.status === 401) { location.href = "/login.html"; return; }
    S.invAll = await r.json(); S.f.site = S.site; scopeInv();
    DOCS = ((ICC().docs || {}).url || "").replace(/\/?$/, "/"); if (DOCS === "/") DOCS = "";
    const inst = ICC().instance || {};
    document.title = `${inst.name || "ICC"} · Infra Command Center`;
    const bn = $("#brand-name"), bs = $("#brand-sub"); if (bn) bn.textContent = inst.name || "ICC"; if (bs) bs.textContent = inst.subtitle || "Infra Command Center";
    if (!(ICC().features || {}).hermes) document.body.classList.add("no-agent");
  }
  catch (e) { $("#app").innerHTML = `<div class="card">Could not load the inventory: ${esc(e.message)}</div>`; return; }
  render();
  await Promise.allSettled([loadMetrics(), loadDocs()]);
  render();
  setInterval(async () => { await loadMetrics(); if (document.activeElement?.id !== "q" && current !== "monitoring") render(); }, 30000);
  setInterval(async () => { await loadDocs(); }, 10 * 60000);
}
boot();
