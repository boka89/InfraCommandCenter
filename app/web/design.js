/* ICC — Design › Sites (read-only structure) and Design › Config (config files in Git:
   version history, who changed what). Configuration is edited through the Hermes chat or straight in
   the repository, never in this UI. Loaded after app.js + portal.js. */
"use strict";

S.struct = null; S.structErr = null; S.cfg = null; S.cfgErr = null; S.hist = {};
async function loadStruct() {
  try { const d = await papi("GET", "/structure"); S.struct = d.structure; S.structErr = null; } catch (e) { S.structErr = e.message; }
}
async function loadCfg() {
  try { S.cfg = await papi("GET", "/config"); S.cfgErr = null; } catch (e) { S.cfgErr = e.message; }
}
const KIND = { region: [icon("region"), "Region / country"], site: [icon("site"), "Site"], building: [icon("building"), "Building"], floor: [icon("floor"), "Floor"] };
const STRUCT_PATH_ = () => repoFile("structure.yaml").path;
const who = (h) => `<b>${esc(h.author.replace(/ via ICC$/, ""))}</b>${/ via ICC$/.test(h.author) ? ' <span class="pill">ICC</span>' : ""}${h.requestedBy ? ` <span class="faint">for ${esc(h.requestedBy.replace(/ via ICC$/, ""))}</span>` : ""}`;
const histList = (rows) => (rows && rows.length ? `<ul class="list hist">${rows.map((h) => `<li><span class="when">${esc(fmtDT(h.date))}</span><div style="flex:1;min-width:0"><div>${esc(h.subject)}</div><div class="faint" style="font-size:12.5px">${who(h)} · <a href="${esc(h.url)}" target="_blank" rel="noopener" class="mono">${esc(h.sha)}${icon("external", "xs")}</a></div></div></li>`).join("")}</ul>` : '<div class="empty">No history.</div>');
const editHint = (what) => `<div class="banner hint">${icon("hermes")}<span>${esc(what)} is configuration and is not edited here. Ask ${esc(AGENT())} in <a href="#/hermes">chat</a> (for example <i>“add a floor ‘1st floor’ to the main building”</i>) or change the file in the ${(S.cfg && S.cfg.repo) || (ICC().repo || {}).web ? `<a href="${esc((S.cfg && S.cfg.repo) || ICC().repo.web)}" target="_blank" rel="noopener">repository</a>` : "repository"}. Every change is a Git commit with its author.</span></div>`;

async function loadHist(path) {
  try { S.hist[path] = (await papi("GET", `/history?path=${encodeURIComponent(path)}`)).history; } catch (e) { S.hist[path] = { err: e.message }; }
}

window.sitesPage = () => {
  if (!S.struct) {
    if (!S.structErr) loadStruct().then(() => { if (current === "sites") render(); });
    return hero("Sites", "Region / country › Site › Building › Floor.", []) + `<div class="card">${S.structErr ? `<span class="bad-text">${esc(S.structErr)}</span>` : '<span class="faint">loading…</span>'}</div>`;
  }
  const STRUCT_PATH = STRUCT_PATH_();
  if (!S.hist[STRUCT_PATH]) loadHist(STRUCT_PATH).then(() => { if (current === "sites") render(); });
  const st = { regions: [], sites: [], ...S.struct }, inv = S.invAll;
  st.sites = st.sites.map((s) => ({ ...s, buildings: (s.buildings || []).map((b) => ({ ...b, floors: b.floors || [] })) }));
  const nB = (bid) => inv.nodes.filter((n) => nodeBld(n) === bid).length;
  const nF = (ref) => inv.nodes.filter((n) => n.floor === ref).length;
  const nS = (sid) => inv.nodes.filter((n) => n.site === sid).length;
  const row = (k, label, sub, count, depth, sk, sid) => `<div class="st-row d${depth}"><span class="sc-ic">${KIND[k][0]}</span><b>${esc(label)}</b>${sub ? `<span class="faint">${sub}</span>` : ""}<span class="sp"></span><span class="pill">${count} nodes</span><button class="ghost sm" data-sk="${sk}" data-sid="${esc(sid)}">Show</button></div>`;
  let tree = "";
  for (const r of st.regions) {
    const rs = st.sites.filter((s) => s.region === r.id);
    tree += `<div class="st-region">${row("region", r.name, esc(r.notes || ""), rs.reduce((a, s) => a + nS(s.id), 0), 0, "region", r.id)}`;
    for (const s of rs) {
      tree += row("site", s.name, `<span class="sw" style="background:${esc(s.color)}"></span>${esc(s.title || "")} · <span class="mono">${esc((s.subnets || []).join(", "))}</span>`, nS(s.id), 1, "site", s.id);
      for (const b of s.buildings) {
        tree += row("building", b.name, esc(b.address || ""), nB(b.id), 2, "building", b.id);
        for (const f of b.floors) tree += row("floor", f.name, `<span class="mono">${esc(f.id)}</span>`, nF(`${b.id}/${f.id}`), 3, "floor", `${b.id}/${f.id}`);
      }
    }
    tree += "</div>";
  }
  const h = S.hist[STRUCT_PATH];
  const nb = st.sites.reduce((a, s) => a + s.buildings.length, 0), nf = st.sites.reduce((a, s) => a + s.buildings.reduce((x, b) => x + b.floors.length, 0), 0);
  return hero("Sites", `Region / country › Site › Building › Floor, from <span class="mono">${esc(STRUCT_PATH)}</span>. Servers, VMs and services attach to a building; switches, APs and cameras to a floor.`,
    [[st.regions.length, "regions"], [st.sites.length, "sites"], [nb, "buildings"], [nf, "floors"], [Array.isArray(h) ? h.length : "—", "versions"]]) +
    editHint("The site structure") +
    `<div class="grid g2"><div class="card st-tree">${tree}</div>
     <div class="card"><div class="title"><h2>History</h2><a href="#/config">All config</a></div>${Array.isArray(h) ? histList(h.slice(0, 15)) : h && h.err ? `<span class="bad-text">${esc(h.err)}</span>` : '<span class="faint">loading…</span>'}</div></div>`;
};

window.configPage = () => {
  if (!S.cfg) {
    if (!S.cfgErr) loadCfg().then(() => { if (current === "config") render(); });
    return hero("Config", "Configuration files in Git.", []) + `<div class="card">${S.cfgErr ? `<span class="bad-text">${esc(S.cfgErr)}</span>` : '<span class="faint">loading…</span>'}</div>`;
  }
  const files = S.cfg.files, open = S.cfgOpen;
  if (open && !S.hist[open]) loadHist(open).then(() => { if (current === "config") render(); });
  const last = (f) => f.history[0];
  const people = new Set(files.flatMap((f) => f.history.map((x) => x.author)));
  return hero("Config", `All configuration and settings live as text files in ${S.cfg.repo ? `<a href="${esc(S.cfg.repo)}" target="_blank" rel="noopener">${esc(S.cfg.repo.replace(/^https?:\/\/[^/]+\//, ""))}</a>` : "the local Git repository of this instance"}, versioned, with the author of every change. Read-only here.`,
    [[files.length, "config sources"], [files.filter((f) => last(f) && Date.now() - Date.parse(last(f).date) < 7 * 864e5).length, "changed this week"], [people.size, "latest authors"]]) +
    editHint("Configuration") +
    `<div class="card pad0 scroll"><table class="tbl cfg"><thead><tr><th>Config</th><th>File</th><th>Last change</th><th>By</th><th></th></tr></thead><tbody>
    ${files.map((f) => { const l = last(f); return `<tr data-cfg="${esc(f.path)}" class="${open === f.path ? "on" : ""}"><td><b>${esc(f.name)}</b><div class="sub">${esc(f.desc)}</div></td><td class="mono">${esc(f.path)}</td><td>${l ? `${esc(fmtDT(l.date))}<div class="sub">${esc(l.subject.slice(0, 90))}</div>` : '<span class="faint">no commits yet</span>'}</td><td>${l ? who(l) : ""}</td><td class="num"><a href="${esc(f.url)}" target="_blank" rel="noopener" data-stop="1">Open${icon("external", "xs")}</a></td></tr>`; }).join("")}
    </tbody></table></div>
    ${open ? `<div class="card" style="margin-top:14px"><div class="title"><h2>History · ${esc(files.find((f) => f.path === open)?.name || open)}</h2><span class="faint mono">${esc(open)}</span></div>${Array.isArray(S.hist[open]) ? histList(S.hist[open]) : S.hist[open]?.err ? `<span class="bad-text">${esc(S.hist[open].err)}</span>` : '<span class="faint">loading…</span>'}</div>` : '<p class="faint" style="margin-top:10px">Click a row for its full history.</p>'}`;
};

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-stop]")) return;
  const tr = e.target.closest("tr[data-cfg]"); if (!tr) return;
  e.preventDefault(); e.stopPropagation();
  S.cfgOpen = S.cfgOpen === tr.dataset.cfg ? null : tr.dataset.cfg; render();
}, true);
