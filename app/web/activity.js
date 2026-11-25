/* ICC — Changelog › Admin activity: which admin did what.
   Sources (/papi/activity): every Git commit in the config repository attributed to the accountable
   person (portal user, the admin Hermes acted for via the Requested-by trailer, Hermes on its own, or a
   direct Git author), Hermes runs started from the portal, and sign-in / sign-out events.
   Loaded after app.js + portal.js. */
"use strict";

S.act = null; S.actErr = null; S.actAt = 0;
Object.assign(S.f, { aWho: "all", aType: "all", aVia: "all", aPer: "30", aLim: "150" });
async function loadAct() {
  try { S.act = await papi("GET", "/activity"); S.actErr = null; } catch (e) { S.actErr = e.message; }
  S.actAt = Date.now(); // also on failure: the re-render after a failed load must not start another load (request loop)
}
const VIA = { portal: "ICC", hermes: "Via Hermes", agent: "Hermes (own)", git: "Direct Git" };
const VIA_HINT = { portal: "Done in ICC (Planner, settings, chat folders)", hermes: "The AI made the change on this admin's request (Requested-by trailer)", agent: "The AI committed without a requester (chat platform or autonomous work)", git: "Committed straight to the repository" };
const RUN_KIND = { chat: "Hermes chat", task: "Planner task run", alarm: "Check & fix" };
const AUTH_TXT = { signin: "Signed in", signout: "Signed out", "signin-failed": "Sign-in failed" };
/* sign-in IPs: pod-network addresses (10.42/10.43) mean the client address was lost at the K3s load balancer, so they are not shown */
const actKey = (e) => (e.login || e.name || "unknown").toLowerCase();
const actMs = (e) => (typeof e.t === "number" ? e.t * 1000 : Date.parse(e.t));

function actRows() {
  const a = S.act; if (!a) return [];
  return [...a.changes, ...a.runs, ...a.auth].map((e) => ({ ...e, ms: actMs(e), key: actKey(e) })).sort((x, y) => y.ms - x.ms);
}
function actPeople(rows) {
  const P = {};
  for (const e of rows) {
    const p = P[e.key] || (P[e.key] = { key: e.key, name: e.name, login: e.login, via: new Set(), change: 0, run: 0, signin: 0, failed: 0, last: 0 });
    if (e.login && !p.login) p.login = e.login;
    if (e.type === "change") { p.change++; p.via.add(e.via); }
    if (e.type === "run") p.run++;
    if (e.type === "auth" && e.ev === "signin") p.signin++;
    if (e.type === "auth" && e.ev === "signin-failed") p.failed++;
    if (e.ev !== "signin-failed") p.last = Math.max(p.last, e.ms);
    if (e.type !== "auth" || e.ev === "signin") p.name = p.name && p.name !== p.login ? p.name : e.name; // prefer a display name over a bare login
  }
  return Object.values(P).sort((x, y) => y.last - x.last);
}
function actItem(e) {
  const t = `<span>${esc(fmtTime(e.ms))}</span>`;
  const who = `<b>${esc(e.name || e.login || "unknown")}</b>${e.login && e.login !== e.name ? ` <span class="mono">${esc(e.login)}</span>` : ""}`;
  if (e.type === "change") {
    const via = `<span class="pill" title="${esc(VIA_HINT[e.via])}">${esc(VIA[e.via])}</span>`;
    return `<li class="act-${e.type}"><div class="meta">${t} · ${who} ${via}${e.areas.map((x) => `<span class="pill idle">${esc(x)}</span>`).join("")}</div>
      <div>${icon("edit", "xs")} ${esc(e.subject)}</div>
      <div class="faint" style="font-size:12.5px">${e.via === "hermes" ? `committed by ${esc(e.author)} · ` : ""}${e.files} file${e.files === 1 ? "" : "s"} · <a href="${esc(e.url)}" target="_blank" rel="noopener" class="mono">${esc(e.sha)}${icon("external", "xs")}</a></div></li>`;
  }
  if (e.type === "run") {
    const st = e.status === "completed" ? "ok" : e.status === "failed" || e.status === "interrupted" ? "bad" : e.status === "running" || e.status === "queued" ? "warn" : "idle";
    return `<li class="act-run"><div class="meta">${t} · ${who} <span class="pill">${esc(RUN_KIND[e.kind] || e.kind)}</span><span class="pill ${st}">${esc(e.status)}</span></div>
      <div>${icon("hermes", "xs")} ${esc(e.subject || "(untitled)")}</div>
      <div class="faint" style="font-size:12.5px">${e.finished ? `took ${esc(dur(Math.max(60, e.finished - e.t)))} · ` : ""}<a href="#" data-job="${esc(e.id)}">Open log</a></div></li>`;
  }
  return `<li class="act-auth"><div class="meta">${t} · ${who}${e.ev === "signin-failed" ? ' <span class="pill warn">failed</span>' : ""}</div>
    <div>${icon(e.ev === "signout" ? "logout" : "chevright", "xs")} ${esc(AUTH_TXT[e.ev] || e.ev)}${e.why ? ` — ${esc(e.why === "invalid" ? "wrong username or password" : e.why)}` : ""}${e.ip && !/^10\.4[23]\./.test(e.ip) ? ` <span class="faint">from <span class="mono">${esc(e.ip)}</span></span>` : ""}</div></li>`;
}

window.activityPage = () => {
  if (!S.act || Date.now() - S.actAt > 60000) {
    if (!S.actBusy) { S.actBusy = true; loadAct().then(() => { S.actBusy = false; if (current === "activity") render(); }); }
    if (!S.act) return hero("Admin activity", "Who changed what, ran what and signed in when.", []) + `<div class="card">${S.actErr ? `<span class="bad-text">${esc(S.actErr)}</span>` : '<span class="faint">loading…</span>'}</div>`;
  }
  const f = S.f, q = f.q.toLowerCase();
  const all = actRows();
  const since = f.aPer === "all" ? 0 : Date.now() - +f.aPer * 864e5;
  const inPer = all.filter((e) => e.ms >= since);
  const people = actPeople(inPer);
  const rows = inPer.filter((e) => (f.aWho === "all" || e.key === f.aWho) && (f.aType === "all" || e.type === f.aType)
    && (f.aVia === "all" || (e.type === "change" ? e.via === f.aVia : f.aVia === "portal"))
    && (!q || [e.subject, e.name, e.login, e.author, e.requestedBy, e.ip, e.sha, (e.areas || []).join(" ")].join(" ").toLowerCase().includes(q)));
  const lim = +f.aLim, shown = rows.slice(0, lim);
  const n = (t) => inPer.filter((e) => e.type === t && (t !== "auth" || e.ev === "signin")).length;
  const per = [["1", "24 h"], ["7", "7 days"], ["30", "30 days"], ["all", "All"]];
  const types = [["all", "All"], ["change", "Changes"], ["run", "Hermes runs"], ["auth", "Sign-ins"]];
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-f="${k}" data-v="${v}" class="${f[k] === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const authSince = S.act.authSince ? fmtDT(S.act.authSince * 1000) : null;
  let lastDay = "";
  return hero("Admin activity", `Who changed what, ran what and signed in when. Changes come from every commit in ${S.act.repo ? `<a href="${esc(S.act.repo)}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">${esc(S.act.repo.replace(/^https?:\/\/[^/]+\//, ""))}</a>` : "the config repository"}, attributed to the admin who asked for them.`,
    [[inPer.length, "events"], [people.filter((p) => p.change + p.run + p.signin).length, "people"], [n("change"), "changes"], [n("run"), "Hermes runs"], [n("auth"), "sign-ins"]]) +
    `<div class="filters">${seg("aPer", per)}${seg("aType", types)}
      <select data-f="aWho" aria-label="Admin"><option value="all">Everyone</option>${actPeople(all).map((p) => `<option value="${esc(p.key)}" ${f.aWho === p.key ? "selected" : ""}>${esc(p.name || p.key)}${p.login && p.login !== p.name ? ` (${esc(p.login)})` : ""}</option>`).join("")}</select>
      <select data-f="aVia" aria-label="Channel"><option value="all">Any channel</option>${Object.entries(VIA).map(([k, l]) => `<option value="${k}" ${f.aVia === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input type="search" id="q" placeholder="Filter activity…" value="${esc(f.q)}"><span class="sp"></span>
      <button class="ghost sm" id="act-refresh" title="Reload">${icon("refresh")}Refresh</button></div>
    <div class="grid act-grid">
      <div class="card pad0 scroll"><table class="tbl act-people"><thead><tr><th>Person</th><th class="num">Changes</th><th class="num">Hermes runs</th><th class="num">Sign-ins</th><th>Last active</th></tr></thead><tbody>
        ${people.map((p) => `<tr data-f="aWho" data-v="${esc(f.aWho === p.key ? "all" : p.key)}" class="${f.aWho === p.key ? "on" : ""}"><td><b>${esc(p.name || p.key)}</b><div class="sub">${p.login ? `<span class="mono">${esc(p.login)}</span>` : "no ICC login"}${p.via.size ? ` · ${[...p.via].map((v) => esc(VIA[v])).join(", ")}` : ""}</div></td>
          <td class="num">${p.change || "—"}</td><td class="num">${p.run || "—"}</td><td class="num">${p.signin || "—"}${p.failed ? ` <span class="pill warn" title="failed sign-ins">${p.failed} failed</span>` : ""}</td><td>${p.last ? esc(fmtDT(p.last)) : "—"}</td></tr>`).join("") || '<tr><td colspan="5" class="faint">No activity in this period.</td></tr>'}
      </tbody></table>
      <p class="faint act-note">${authSince ? `Sign-ins recorded since ${esc(authSince)}.` : "Sign-ins are recorded from now on."} AI runs: runs started from ICC only. Click a person to filter.</p></div>
      <div class="card"><div class="title"><h2>Timeline</h2><span class="faint">${rows.length} of ${inPer.length} events</span></div>
        <ul class="tl">${shown.map((e) => { const day = dayKey(e.ms); const h = day !== lastDay ? `<li class="day">${esc(new Date(e.ms).toLocaleDateString(undefined, { timeZone: S_TZ, weekday: "short", year: "numeric", month: "short", day: "numeric" }))}</li>` : ""; lastDay = day; return h + actItem(e); }).join("") || '<li class="faint">Nothing matches these filters.</li>'}</ul>
        ${rows.length > lim ? `<button class="ghost sm" data-f="aLim" data-v="${lim + 300}">Show ${Math.min(300, rows.length - lim)} more</button>` : ""}</div>
    </div>`;
};

document.addEventListener("click", (e) => {
  if (!e.target.closest("#act-refresh")) return;
  e.preventDefault(); S.actAt = 0; loadAct().then(() => { if (current === "activity") render(); });
});
