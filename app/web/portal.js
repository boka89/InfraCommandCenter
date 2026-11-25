/* ICC — signed-in features (/papi/): session, Planner editing, "Execute with <agent>",
   agent activity box and settings. Loaded after app.js and shares its globals
   (S, $, esc, PAGES, render, openTask, closeDrawer, ...). SPDX-License-Identifier: Apache-2.0 */
"use strict";

const API = "/papi";
S.me = null; S.hermes = []; S.chatConv = localStorage.getItem("hermesConv") || "main";
let liveES = null; // the EventSource of the open job drawer / chat

async function papi(method, path, body) {
  const r = await fetch(API + path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-ICC": "1" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {}; try { data = await r.json(); } catch (_) { /* empty */ }
  if (r.status === 401 && path !== "/login") { location.href = "/login.html"; throw new Error("Session expired"); }
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

/* ---------- tiny markdown (inline only, safe) ---------- */
function mdLink(href) { return relLink(href); }
function md(s) {
  let h = esc(s || "");
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(mdLink(u.replace(/&amp;/g, "&")))}" target="_blank" rel="noopener">${t}</a>`);
  return h;
}
function mdBlock(s) { // multi-line output from Hermes: paragraphs, lists, code fences
  const parts = String(s || "").split(/```/);
  return parts.map((p, i) => (i % 2 ? `<pre class="code">${esc(p.replace(/^\w*\n/, ""))}</pre>` :
    p.split(/\n{2,}/).map((para) => {
      const lines = para.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) return "";
      if (lines.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l))) return `<ul>${lines.map((l) => `<li>${md(l.replace(/^\s*([-*•]|\d+\.)\s/, ""))}</li>`).join("")}</ul>`;
      if (/^#{1,4}\s/.test(lines[0])) return `<h3>${md(lines[0].replace(/^#+\s/, ""))}</h3>${lines.slice(1).map(md).join("<br>")}`;
      return `<p>${lines.map(md).join("<br>")}</p>`;
    }).join(""))).join("");
}

/* ---------- Planner data (live from Git) ---------- */
/* a task belongs to the site named in its area heading, else to the single site its text mentions */
function siteOf(section, text) {
  const a = sitesOf(section); if (a.length === 1) return a[0];
  const b = sitesOf(text); return b.length === 1 ? b[0] : null;
}
async function loadTodoApi() {
  try {
    const d = await papi("GET", "/todo");
    S.sections = d.sections;
    S.todo = d.tasks.map((t) => {
      const text = (t.title + " " + t.details).replace(/[`*]/g, "");
      return { ...t, rawTitle: t.title, rawDetails: t.details, title: md(t.title), details: md(t.details), html: md(t.title) + (t.details ? " — " + md(t.details) : ""), text, site: siteOf(t.section, text) };
    });
    return true;
  } catch (_) { return false; }
}
const _loadDocs = loadDocs;
loadDocs = async function () { // eslint-disable-line no-global-assign
  const keep = S.todo;
  await _loadDocs();
  if (!(await loadTodoApi()) && !S.todo) S.todo = keep;
};

/* ---------- session ---------- */
async function loadMe() { try { const m = await papi("GET", "/me"); S.me = m.user ? m : null; } catch (_) { S.me = null; } renderSide(); }
/* personal settings live in Git (settings/users/<login>.yaml); localStorage is only a cache */
async function loadPrefs() {
  try {
    const p = (await papi("GET", "/prefs")).prefs || {};
    let changed = false;
    if (p.theme && p.theme !== document.documentElement.dataset.theme) { document.documentElement.dataset.theme = p.theme; localStorage.setItem("theme", p.theme); changed = true; }
    if (p.tz && p.tz !== S_TZ) { S_TZ = p.tz; localStorage.setItem("tz", p.tz); changed = true; }
    if (changed) { S.forceRender = true; render(); }
  } catch (_) { /* keep cached */ }
}
async function savePref(obj) {
  try { await papi("POST", "/prefs", obj); S.prefMsg = "Saved to Git."; } catch (e) { S.prefMsg = `Not saved: ${e.message}`; }
  const m = $("#pref-msg"); if (m) m.textContent = S.prefMsg;
}
function openLogin() { location.href = "/login.html"; }
async function logout() { try { await papi("POST", "/logout", {}); } catch (_) { /* ignore */ } location.href = "/login.html"; }
function openSettings() {
  const zones = [...new Set(["UTC", S_TZ, ...(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [])])];
  const theme = document.documentElement.dataset.theme;
  $("#drawer").innerHTML = `<button class="x" aria-label="Close">×</button>
    <div class="row" style="gap:12px;margin-bottom:14px"><div class="avatar">${esc((S.me?.name || "?").replace(/^Admin-/i, "").slice(0, 1).toUpperCase())}</div><div><h1 style="margin:0">${esc(S.me?.name || "")}</h1><div class="muted mono">${esc(S.me?.user || "")} · ${esc({ local: "local account", ldap: "directory account", oidc: "single sign-on" }[S.me?.via] || "")}</div></div></div>
    <h2>Settings</h2>
    <form class="form" id="settings-form">
      <label>Theme<div class="seg">${[["dark", "Dark"], ["light", "Light"]].map(([v, l]) => `<button type="button" data-theme-set="${v}" class="${theme === v ? "on" : ""}">${l}</button>`).join("")}</div></label>
      <label>Time zone<select name="tz">${zones.map((z) => `<option ${z === S_TZ ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label>
      <div class="faint">Now: ${esc(fmtDT(Date.now()))}. Times in ICC (changelog, updates, AI runs) use this zone. Settings are stored in Git (<span class="mono">${esc((ICC().repo || {}).settings || "settings")}/users/${esc(S.me?.user || "")}.yaml</span>), versioned. <span id="pref-msg">${esc(S.prefMsg || "")}</span></div>
    </form>
    <div class="actions"><span class="faint">Signed in until ${S.me ? esc(fmtDT(S.me.expires * 1000)) : "—"}</span><span class="sp"></span><button class="ghost" id="logout">⎋ Sign out</button></div>`;
  $("#drawer").hidden = false;
  $("#settings-form select[name=tz]").onchange = (e) => { S_TZ = e.target.value; localStorage.setItem("tz", S_TZ); savePref({ tz: S_TZ }); S.forceRender = true; render(); openSettings(); };
}
const needLogin = (fn) => (S.me ? fn() : openLogin());

/* ---------- sidebar: Hermes box + user ---------- */
const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
function renderSide() {
  const box = $("#hermes-mini"); if (!box) return;
  const act = S.hermes.filter((j) => j.status === "running" || j.status === "queued");
  const last = S.hermes.find((j) => !act.includes(j));
  box.innerHTML = `<button class="ghost hermes-btn ${act.length ? "busy" : ""}" id="hermes-box" title="What ${esc(AGENT())} is executing">
      <span class="hdot ${act.length ? "on" : ""}"></span><span class="hb-main"><b>${esc(AGENT())}</b>
      <small>${act.length ? act.map((j) => `${j.status === "queued" ? "Queued" : "Running"}: ${esc(j.kind === "chat" ? `chat with ${j.user}` : j.title)} · ${ago(j.started || j.created)}`).join("<br>") : last ? `Idle · last: ${esc(last.kind === "chat" ? "chat" : last.title).slice(0, 38)} (${esc(last.status)})` : "Idle"}</small></span></button>`;
  const me = $("#me-mini");
  if (me) me.innerHTML = S.me ? `<button class="ghost user-btn" id="user-btn" title="Settings"><span class="avatar sm">${esc(S.me.name.replace(/^Admin-/i, "").slice(0, 1))}</span><span class="hb-main"><b>${esc(S.me.name)}</b><small>${esc(S.me.user)}</small></span><span class="sp"></span><span class="faint">${icon("gear")}</span></button>` : "";
}
S.hHealth = null;
async function loadHermesHealth() { try { S.hHealth = await papi("GET", "/hermes/health"); } catch (e) { S.hHealth = { ok: false, error: e.message }; } }
async function loadHermes() {
  const before = JSON.stringify(S.hermes.map((x) => [x.id, x.status]));
  try { S.hermes = (await papi("GET", "/hermes/activity")).jobs; } catch (_) { /* portal-api down */ }
  renderSide();
  if (current === "alarms" && before !== JSON.stringify(S.hermes.map((x) => [x.id, x.status])) && $("#drawer").hidden) render();
}
function openActivity() {
  const dr = $("#drawer");
  dr.innerHTML = `<button class="x" aria-label="Close">×</button><h1 style="margin:0 0 4px">${esc(AGENT())} activity</h1>
    <p class="lead">Runs started from ICC (Planner tasks, alarm fixes and chat).</p>
    ${S.hermes.length ? `<ul class="list">${S.hermes.map((j) => `<li data-job="${j.id}" style="cursor:pointer">${dot(j.status === "completed" ? "up" : j.status === "running" || j.status === "queued" ? "warn" : j.status === "cancelled" ? "stopped" : "down")}<div style="flex:1"><b>${esc(j.kind === "chat" ? `Chat · ${j.title}` : j.title)}</b><div class="muted" style="font-size:12.5px">${esc(j.status)} · ${esc(j.user)} · ${ago(j.created)} ago</div>${j.summary ? `<div class="faint" style="font-size:12px">${esc(j.summary.slice(0, 160))}</div>` : ""}</div></li>`).join("")}</ul>` : '<div class="empty">Nothing yet.</div>'}`;
  dr.hidden = false;
}

/* ---------- job drawer (live log) ---------- */
function evLine(ev) {
  if (ev.event === "tool.started") return `<div class="ev tool">${icon("gear", "xs")} ${esc(ev.tool)} <span class="faint">${esc((ev.preview || "").slice(0, 160))}</span></div>`;
  if (ev.event === "tool.completed" && ev.error) return `<div class="ev err">${esc(ev.tool)} failed</div>`;
  if (ev.event === "approval.request") return `<div class="ev warn">Approval needed: <code>${esc((ev.command || ev.description || "").slice(0, 200))}</code>${ev.auto_approved ? `, auto-approved (${esc(ev.auto_approved)})` : ""}</div>`;
  if (ev.event === "message.interim" && ev.text) return `<div class="ev note">${md(ev.text.slice(0, 400))}</div>`;
  if (/^run\.(failed|cancelled|interrupted)/.test(ev.event)) return `<div class="ev err">Run ${esc(ev.event.slice(4))}${ev.error ? ": " + esc(String(ev.error).slice(0, 300)) : ""}</div>`;
  return "";
}
function streamJob(id, onEv, onDone) {
  if (liveES) liveES.close();
  const es = (liveES = new EventSource(`${API}/hermes/jobs/${id}/events`));
  es.onmessage = (m) => { let ev; try { ev = JSON.parse(m.data); } catch (_) { return; } onEv(ev); if (ev.event === "job.finished") { es.close(); onDone && onDone(ev.status); loadHermes(); } };
  es.onerror = () => { if (es.readyState === 2) onDone && onDone(); };
  return es;
}
async function openJob(id) {
  if (!S.me) return openLogin(() => openJob(id));
  let j; try { j = await papi("GET", `/hermes/jobs/${id}`); } catch (e) { return alert(e.message); }
  const dr = $("#drawer");
  dr.innerHTML = `<button class="x" aria-label="Close">×</button>
    <div class="row" style="gap:6px"><span class="pill" id="job-st">${esc(j.status)}</span><span class="faint">${esc(j.user)} · started ${j.started ? fmtTime(j.started * 1000) : "—"}</span><span class="sp"></span>${j.status === "running" ? '<button class="ghost sm" id="job-stop">${icon("stop")}Stop</button>' : ""}</div>
    <h1 style="margin:8px 0 10px">${esc(j.kind === "chat" ? "Chat" : j.title)}</h1>${j.alarm ? `<p class="muted" style="margin:-4px 0 10px">${esc(j.alarm.why || "")}</p>` : ""}
    <h3>Steps</h3><div class="evlog" id="job-ev"></div>
    <h3 style="margin-top:14px">Result</h3><div class="mdout" id="job-out">${j.output ? mdBlock(j.output) : '<span class="faint">…</span>'}</div>`;
  dr.hidden = false;
  let out = "";
  const evBox = $("#job-ev"), outBox = $("#job-out");
  const stop = $("#job-stop"); if (stop) stop.onclick = async () => { try { await papi("POST", `/hermes/jobs/${id}/stop`, {}); stop.disabled = true; } catch (e) { alert(e.message); } };
  streamJob(id, (ev) => {
    if (!document.body.contains(evBox)) return;
    if (ev.event === "message.delta") { out += ev.delta || ""; outBox.innerHTML = mdBlock(out); }
    else if (ev.event?.startsWith("run.") && ev.output) { out = ev.output; outBox.innerHTML = mdBlock(out); }
    const l = evLine(ev); if (l) { evBox.insertAdjacentHTML("beforeend", l); evBox.scrollTop = evBox.scrollHeight; }
  }, (st) => { const e = $("#job-st"); if (e) e.textContent = st || "finished"; $("#job-stop")?.remove(); });
}

/* ---------- Planner: task drawer with edit / execute / delete ---------- */
const STATUS_OPTS = [["backlog", "Backlog"], ["next", "Next up"], ["doing", "In progress"], ["waiting", "Waiting"], ["done", "Done"]];
openTask = function (i) { // eslint-disable-line no-global-assign
  const t = S.todo[i]; if (!t) return;
  const st = STATUS.find((s) => s[0] === t.status) || STATUS[0];
  const running = S.hermes.find((j) => j.kind === "task" && j.task && j.task.title === t.rawTitle && (j.status === "running" || j.status === "queued"));
  $("#drawer").innerHTML = `<button class="x" aria-label="Close">×</button>
    <div class="row" style="gap:6px;margin-bottom:8px">${prioPill(t)}${t.site ? sitePill(t.site) : ""}<span class="pill area">${esc(t.section)}</span><span class="pill">${st[2]} ${esc(st[1])}</span>${dueChip(t)}</div>
    <h1 style="margin:0 0 10px">${t.title}</h1>
    <p style="line-height:1.6">${t.details || '<span class="faint">No details.</span>'}</p>
    <dl class="kv"><dt>Priority</dt><dd>${esc(PRIO[t.prio][1])}</dd><dt>Status</dt><dd>${esc(st[1])}</dd><dt>Due</dt><dd>${esc(t.due || "—")}</dd><dt>Owner</dt><dd>${esc(t.owner)}</dd>${t.doneAt ? `<dt>Done</dt><dd>${esc(t.doneAt)}</dd>` : ""}</dl>
    <div class="actions">
      ${t.rawTitle !== undefined ? `<button class="primary" id="t-exec" ${t.done || running ? "disabled" : ""}>${icon("play")}Execute with ${esc(AGENT())}</button>
      <button class="ghost" id="t-edit">${icon("edit")}Edit</button><button class="ghost" id="t-del">${icon("trash")}Delete</button>` : '<span class="faint">Editing needs the ICC API.</span>'}
      <span class="sp"></span>${repoFile("planner.md").url ? repoLink("planner.md", "In Git") : ""}</div>
    ${running ? `<p class="faint">${esc(AGENT())} is ${esc(running.status)} on this task — <a href="#" data-job="${running.id}">open the live log</a>.</p>` : ""}
`;
  $("#drawer").hidden = false;
  const ex = $("#t-exec"); if (ex) ex.onclick = () => needLogin(() => executeTask(t));
  const ed = $("#t-edit"); if (ed) ed.onclick = () => needLogin(() => editTask(t));
  const de = $("#t-del"); if (de) de.onclick = () => needLogin(async () => {
    if (!confirm(`Delete "${t.rawTitle}" from the Planner?\n(It is removed from planner.md in Git.)`)) return;
    try { await papi("DELETE", `/todo/${t.i}`, { expectTitle: t.rawTitle }); closeDrawer(); await loadTodoApi(); render(); } catch (e) { alert(e.message); }
  });
};
function taskForm(t, isNew) {
  const secs = S.sections || [...new Set((S.todo || []).map((x) => x.section))];
  const sel = (name, opts, v) => `<select name="${name}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  return `<form id="task-form" class="form">
    <label>Title<input name="title" required maxlength="200" value="${esc(t.rawTitle || "")}"></label>
    <label>Details <span class="faint">(Markdown: \`code\`, **bold**, [link](url))</span><textarea name="details" rows="6" maxlength="2000">${esc(t.rawDetails || "")}</textarea></label>
    <div class="grid g2">
      ${isNew ? `<label>Area${sel("section", secs.map((s) => [s, s]).concat([["__new", "+ new area…"]]), t.section || secs[0])}</label>` : `<label>Area<input value="${esc(t.section)}" disabled></label>`}
      <label>Priority${sel("prio", [["P1", "P1 · urgent"], ["P2", "P2 · important"], ["P3", "P3 · nice to have"]], t.prio || "P2")}</label>
      <label>Status${sel("status", STATUS_OPTS, t.status || "backlog")}</label>
      <label>Due date<input type="date" name="due" value="${esc(t.due || "")}"></label>
      <label>Owner<input name="owner" maxlength="40" value="${esc(t.owner || AGENT())}"></label>
      ${isNew ? '<label class="newsec" hidden>New area name<input name="newsection" maxlength="60"></label>' : ""}
    </div>
    <div class="row"><button class="primary" type="submit">${isNew ? "Add task" : "Save"}</button><button class="ghost" type="button" id="t-cancel">Cancel</button><span class="sp"></span><span class="faint" id="t-msg">Saved straight to Git (planner.md).</span></div>
  </form>`;
}
function bindForm(onSubmit) {
  const f = $("#task-form");
  const secSel = f.querySelector("select[name=section]");
  if (secSel) secSel.onchange = () => { f.querySelector(".newsec").hidden = secSel.value !== "__new"; };
  $("#t-cancel").onclick = closeDrawer;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (d.section === "__new") d.section = d.newsection; delete d.newsection;
    $("#t-msg").textContent = "saving to Git…";
    try { await onSubmit(d); closeDrawer(); await loadTodoApi(); render(); } catch (err) { $("#t-msg").textContent = err.message; $("#t-msg").className = "bad-text"; }
  };
}
function editTask(t) {
  $("#drawer").innerHTML = `<button class="x" aria-label="Close">×</button><h1 style="margin:0 0 12px">Edit task</h1>${taskForm(t, false)}`;
  $("#drawer").hidden = false;
  bindForm((d) => papi("POST", `/todo/${t.i}`, { ...d, expectTitle: t.rawTitle }));
}
function newTask() {
  const sec = S.f.area !== "all" ? S.f.area : undefined;
  $("#drawer").innerHTML = `<button class="x" aria-label="Close">×</button><h1 style="margin:0 0 12px">New task</h1>${taskForm({ section: sec, status: "backlog", prio: "P2", owner: AGENT() }, true)}`;
  $("#drawer").hidden = false;
  bindForm((d) => papi("POST", "/todo", d));
}
async function executeTask(t) {
  if (!confirm(`Execute with ${AGENT()}?\n\n"${t.rawTitle}"\n\n${AGENT()} works on it unattended with full access (approvals are given automatically), then updates the task and the changelog.`)) return;
  try { const j = await papi("POST", `/todo/${t.i}/execute`, { expectTitle: t.rawTitle }); await loadHermes(); openJob(j.id); } catch (e) { alert(e.message); }
}
// "+ New task" button on the Planner page
const _planner = PAGES.planner;
PAGES.planner = (...a) => _planner(...a).replace('<div class="filters">', `<div class="filters"><button class="primary" id="t-new">${icon("plus")}New task</button>`);

/* ---------- alarms: Check & fix with Hermes ---------- */
async function fixAlarm(key) {
  const a = alerts().find((x) => x.key === key); if (!a) return;
  if (!confirm(`Let ${AGENT()} check and fix this alarm?\n\n${a.name} — ${a.why}\n\n${AGENT()} investigates and fixes it; anything destructive or needing hands on site becomes a Planner task for you instead.`)) return;
  try {
    const job = await papi("POST", "/alarm/fix", { key: a.key, title: a.name, why: a.why, site: a.site, kind: a.kind || "other", id: a.id || "", level: alertLevel(a) });
    await loadHermes(); render(); openJob(job.id);
  } catch (e) { alert(e.message); }
}

/* ---------- wiring ---------- */
document.addEventListener("click", (e) => {
  const fx = e.target.closest("[data-fix]"); if (fx) { e.preventDefault(); e.stopPropagation(); if (!fx.disabled) fixAlarm(fx.dataset.fix); return; }
  const el = e.target.closest("#hermes-box,#user-btn,[data-theme-set],#logout,#t-new,[data-job]");
  if (!el) return;
  e.preventDefault(); e.stopPropagation();
  if (el.id === "hermes-box") return openActivity();
  if (el.id === "user-btn") return openSettings();
  if (el.dataset.themeSet) { document.documentElement.dataset.theme = el.dataset.themeSet; localStorage.setItem("theme", el.dataset.themeSet); savePref({ theme: el.dataset.themeSet }); S.forceRender = true; render(); return openSettings(); }
  if (el.id === "logout") return logout();
  if (el.id === "t-new") return needLogin(newTask);
  if (el.dataset.job) return openJob(el.dataset.job);
}, true);
// render hook: chat page needs its history after each (re)render; don't auto-refresh it
const _render = render;
render = function (keep) { // eslint-disable-line no-global-assign
  // the Hermes workspace repaints itself; skip the periodic full re-render while it is open on the same URL
  if (current === "hermes" && route().name === "hermes" && $("#hx") && !keep && !S.forceRender && S.hxHash === location.hash) { renderSide(); return; }
  S.forceRender = false;
  _render(keep); renderSide();
  if (route().name === "hermes") { S.hxHash = location.hash; if (window.hermesAfterRender) window.hermesAfterRender(); }
};
(async () => {
  await loadMe(); await Promise.all([loadHermes(), loadHermesHealth(), loadPrefs()]);
  if (await loadTodoApi()) render();
  setInterval(loadHermes, 10000);
  setInterval(async () => { const was = S.hHealth && S.hHealth.ok; await loadHermesHealth(); if (current === "hermes" && was !== S.hHealth.ok && window.paintMain) paintMain(); }, 30000);
  setInterval(async () => { if (await loadTodoApi() && current === "planner" && $("#drawer").hidden) render(); }, 60000);
})();
