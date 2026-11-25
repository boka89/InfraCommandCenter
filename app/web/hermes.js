/* ICC — AI chat workspace (Hermes Agent), modelled on Open WebUI "Folders & Projects":
   nested folders (a folder = project: its instructions act as system prompt for its chats, inherited by
   subfolders), chats grouped by date, pin / archive / rename / move (menu or drag & drop) / delete,
   full-text search, unread markers, live streaming answers with tool steps, stop.
   Folders + instructions: Git (settings/hermes/<login>.yaml). Transcripts: ICC data volume.
   Loaded after app.js + portal.js (uses S, $, esc, icon, md, mdBlock, papi, streamJob, fmtDT, render …). */
"use strict";

S.hx = { folders: [], chats: [], loaded: false, chat: null, q: "", qIds: null, draft: "", liveJob: null,
  open: (() => { try { return JSON.parse(localStorage.getItem("hxOpen")) || {}; } catch (_) { return {}; } })() };
const hxR = () => route().params;
const go = (h) => { S.forceRender = true; location.hash = h; };
const fById = (id) => S.hx.folders.find((f) => f.id === id);
const fKids = (id) => S.hx.folders.filter((f) => (f.parent || null) === (id || null)).sort((a, b) => a.name.localeCompare(b.name));
const fPath = (id) => { const out = []; let f = fById(id); while (f && out.length < 10) { out.unshift(f); f = fById(f.parent); } return out; };
const fSub = (id) => [id, ...fKids(id).flatMap((k) => fSub(k.id))];
const visible = (c) => !S.hx.q || c.title.toLowerCase().includes(S.hx.q.toLowerCase()) || !!(S.hx.qIds && S.hx.qIds.has(c.id));

async function hxLoad() {
  try { const d = await papi("GET", "/hermes/chats"); S.hx.folders = d.folders; S.hx.chats = d.chats; S.hx.loaded = true; S.hx.err = null; }
  catch (e) { S.hx.err = e.message; S.hx.loaded = true; }
}
async function hxLoadChat(id) {
  try { S.hx.chat = await papi("GET", `/hermes/chats/${id}`); const m = S.hx.chats.find((c) => c.id === id); if (m) m.unread = false; }
  catch (e) { S.hx.chat = { id, missing: e.message }; }
}

/* ---------------- sidebar ---------------- */
function chatItem(c, depth = 0) {
  const on = hxR().c === c.id;
  return `<div class="hx-item ${on ? "on" : ""}" draggable="true" data-drag-chat="${c.id}" style="padding-left:${10 + depth * 14}px">
    <a href="#/hermes?c=${c.id}" class="hx-t" title="${esc(c.title)}">${c.pinned ? icon("pin", "xs0") : ""}${esc(c.title)}</a>
    ${c.running ? '<span class="hdot on" title="${esc(AGENT())} is answering"></span>' : c.unread ? '<span class="hx-unread" title="New answer"></span>' : ""}
    <button class="hx-dots" data-menu-chat="${c.id}" aria-label="Chat actions">${icon("dots")}</button></div>`;
}
function folderNode(f, depth) {
  const open = !!S.hx.open[f.id], sub = fSub(f.id);
  const chats = S.hx.chats.filter((c) => c.folder === f.id && !c.archived && visible(c));
  const unread = S.hx.chats.filter((c) => sub.includes(c.folder) && c.unread && !c.archived).length;
  const on = hxR().f === f.id;
  return `<div class="hx-folder ${on ? "on" : ""}" draggable="true" data-drag-folder="${f.id}" data-drop-folder="${f.id}" style="padding-left:${6 + depth * 14}px">
      <button class="hx-tw" data-toggle="${f.id}" aria-label="${open ? "Collapse" : "Expand"}">${icon(open ? "chevron" : "chevright")}</button>
      <a href="#/hermes?f=${f.id}" class="hx-t">${icon("folder")}<span>${esc(f.name)}</span>${f.instructions ? '<span class="hx-proj" title="Has instructions (project)">P</span>' : ""}</a>
      ${unread ? `<span class="hx-badge">${unread}</span>` : ""}
      <button class="hx-dots" data-menu-folder="${f.id}" aria-label="Folder actions">${icon("dots")}</button></div>
    ${open ? fKids(f.id).map((k) => folderNode(k, depth + 1)).join("") + chats.map((c) => chatItem(c, depth + 1)).join("") : ""}`;
}
function dateGroups(list) {
  const today = dayKey(Date.now()), yest = dayKey(Date.now() - 864e5), g = {};
  for (const c of list) {
    const d = dayKey((c.updated || 0) * 1000), age = Date.now() / 1000 - (c.updated || 0);
    const k = d === today ? "Today" : d === yest ? "Yesterday" : age < 7 * 86400 ? "Previous 7 days" : age < 30 * 86400 ? "Previous 30 days" : "Older";
    (g[k] ||= []).push(c);
  }
  return ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"].filter((k) => g[k]).map((k) => [k, g[k]]);
}
function sideHtml() {
  if (!S.hx.loaded) return '<div class="faint" style="padding:12px">loading…</div>';
  const live = S.hx.chats.filter((c) => !c.archived && visible(c));
  const pinned = live.filter((c) => c.pinned), loose = live.filter((c) => !c.folder && !c.pinned);
  const arch = S.hx.chats.filter((c) => c.archived && visible(c));
  return `<div class="hx-top"><button class="primary" id="hx-new">${icon("plus")}New chat</button><button class="ghost" id="hx-newfolder" title="New folder">${icon("folderplus")}</button></div>
    <label class="hx-search">${icon("search")}<input type="search" id="hx-q" placeholder="Search chats…" value="${esc(S.hx.q)}"></label>
    <div class="hx-list" id="hx-list">
      ${pinned.length ? `<div class="hx-h">Pinned</div>${pinned.map((c) => chatItem(c)).join("")}` : ""}
      <div class="hx-h" data-drop-folder="">Folders</div>
      ${fKids(null).map((f) => folderNode(f, 0)).join("") || '<div class="hx-empty">No folders yet. A folder with instructions works as a project.</div>'}
      ${dateGroups(loose).map(([k, cs]) => `<div class="hx-h" data-drop-folder="">${k}</div>${cs.map((c) => chatItem(c)).join("")}`).join("") || (S.hx.q ? '<div class="hx-empty">No chats match.</div>' : "")}
      ${arch.length ? `<button class="hx-h hx-arch" id="hx-arch">${icon(S.hx.showArch ? "chevron" : "chevright")}Archived (${arch.length})</button>${S.hx.showArch ? arch.map((c) => chatItem(c)).join("") : ""}` : ""}
    </div>`;
}

/* ---------------- main pane ---------------- */
function downBanner() {
  return S.hHealth && !S.hHealth.ok ? `<div class="banner bad">${dot("down")}<span><b>${esc(AGENT())} is not reachable</b> (${esc(S.hHealth.error || "no answer")}). ICC talks to the Hermes Agent API server (ICC_HERMES_URL); messages can't be sent until it answers. See docs/ai-hermes.md.</span></div>` : "";
}
function composer(ph) {
  const busy = hxR().c && S.hx.chat && S.hx.chat.messages && S.hx.chat.messages.length && ["queued", "running"].includes(S.hx.chat.messages[S.hx.chat.messages.length - 1].status);
  const down = S.hHealth && !S.hHealth.ok;
  return `<form id="hx-form" class="hx-composer"><textarea id="hx-in" rows="1" placeholder="${esc(ph)}">${esc(S.hx.draft)}</textarea>
    ${busy ? `<button type="button" class="ghost" id="hx-stop">${icon("stop")}Stop</button>` : `<button class="primary" type="submit" id="hx-send" ${down ? "disabled" : ""} aria-label="Send">${icon("send")}</button>`}</form>
    <div class="hx-foot faint">Enter to send · Shift+Enter new line · ${esc(AGENT())} has full infrastructure access; config changes are committed to Git under your name.</div>`;
}
function crumbs(fid) {
  const p = fPath(fid);
  return p.length ? `<span class="hx-crumbs">${icon("folder")}${p.map((f) => `<a href="#/hermes?f=${f.id}">${esc(f.name)}</a>`).join('<span class="faint">/</span>')}</span>` : '<span class="faint">No folder</span>';
}
function msgHtml(m, i) {
  if (m.role === "user") return `<div class="msg me"><div class="bubble">${md(m.text)}</div></div>`;
  const live = ["queued", "running"].includes(m.status);
  const body = m.text ? mdBlock(m.text) : live ? `<span class="faint">${m.status === "queued" ? "Queued…" : "Thinking…"}</span>` : "";
  return `<div class="msg bot" ${live ? `id="hx-live" data-job="${esc(m.job || "")}"` : ""}><div class="steps" ${live ? 'id="hx-steps"' : ""}></div><div class="bubble">${body}${m.error ? `<div class="bad-text">${esc(m.error)}</div>` : ""}</div>
    <div class="hx-meta faint">${m.status && m.status !== "completed" ? `${esc(m.status)} · ` : ""}${m.job ? `<a href="#" data-joblog="${esc(m.job)}">log</a>` : ""}</div></div>`;
}
function mainHtml() {
  const r = hxR();
  if (r.c) {
    const c = S.hx.chat;
    if (!c || c.id !== r.c) return '<div class="hx-center faint">loading…</div>';
    if (c.missing) return `<div class="hx-center"><span class="bad-text">${esc(c.missing)}</span></div>`;
    return `<header class="hx-head"><button class="hx-title" id="hx-rename" title="Rename">${esc(c.title)}</button>${crumbs(c.folder)}<span class="sp"></span>
        <button class="ghost sm" data-chat-act="pin">${icon("pin")}${c.pinned ? "Unpin" : "Pin"}</button>
        <button class="ghost sm" data-menu-chat="${c.id}" data-move-only="1">${icon("folder")}Move</button>
        <button class="ghost sm" data-chat-act="archive">${icon("archive")}${c.archived ? "Unarchive" : "Archive"}</button>
        <button class="ghost sm danger" data-chat-act="delete" aria-label="Delete chat">${icon("trash")}</button></header>
      ${downBanner()}
      <div class="hx-msgs" id="hx-msgs">${c.messages.length ? c.messages.map(msgHtml).join("") : `<div class="hx-center faint">Ask ${esc(AGENT())} anything about the infrastructure.${c.folder && fPath(c.folder).some((f) => f.instructions) ? " This folder's instructions apply." : ""}</div>`}</div>
      ${composer(`Message ${AGENT()}…`)}`;
  }
  if (r.f) {
    const f = fById(r.f);
    if (!f) return '<div class="hx-center faint">Folder not found.</div>';
    const sub = fSub(f.id), chats = S.hx.chats.filter((c) => sub.includes(c.folder) && !c.archived).sort((a, b) => b.updated - a.updated);
    return `<header class="hx-head"><span class="hx-title">${icon("folder")} ${esc(f.name)}</span>${fPath(f.parent).length ? crumbs(f.parent) : ""}<span class="sp"></span>
        <button class="ghost sm" data-folder-act="newchat">${icon("plus")}New chat here</button><button class="ghost sm" data-folder-act="sub">${icon("folderplus")}Subfolder</button>
        <button class="ghost sm" data-folder-act="rename">${icon("edit")}Rename</button><button class="ghost sm danger" data-folder-act="delete" aria-label="Delete folder">${icon("trash")}</button></header>
      <div class="hx-folderpage">
        <section class="card"><div class="title"><h2>Instructions</h2><span class="faint">system prompt for every chat in this folder and its subfolders</span></div>
          <textarea id="hx-ins" rows="7" placeholder="e.g. You are working on the branch office. Always check the firewall first. Answer in German.">${esc(f.instructions || "")}</textarea>
          <div class="row" style="margin-top:8px"><button class="primary" id="hx-ins-save">Save</button><span class="faint" id="hx-ins-msg">Stored in Git: ${esc((ICC().repo || {}).settings || "settings")}/hermes/${esc(S.me?.user || "")}.yaml</span></div></section>
        <section class="card"><div class="title"><h2>Chats (${chats.length})</h2></div>
          ${chats.length ? `<ul class="list">${chats.map((c) => `<li><a href="#/hermes?c=${c.id}" style="flex:1"><b>${esc(c.title)}</b></a><span class="faint">${fPath(c.folder).slice(fPath(f.id).length).map((x) => esc(x.name)).join(" / ")}</span><span class="when">${esc(fmtDT(c.updated * 1000))}</span></li>`).join("")}</ul>` : '<div class="empty">No chats in this folder yet.</div>'}</section>
      </div>`;
  }
  const n = S.hx.chats.length;
  return `${downBanner()}<div class="hx-hello"><h1>What should ${esc(AGENT())} do?</h1>
      <p class="muted">An AI operator with memory, skills and full access to your infrastructure. ${n ? `${n} chat${n === 1 ? "" : "s"} so far.` : ""}</p>
      ${S.hx.newFolder ? `<p>New chat in ${crumbs(S.hx.newFolder)} <a href="#" id="hx-nofolder">(no folder)</a></p>` : ""}
      <div class="hx-sugg">${["What needs attention right now?", "Summarise what changed this week", "Check backups on all sites", "What is waiting on people in the Planner?"].map((t) => `<button class="ghost" data-sugg="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>
    ${composer(`Message ${AGENT()}…`)}`;
}

PAGES.hermes = () => {
  if (!S.hx.loaded) hxLoad().then(() => { if (current === "hermes") { S.forceRender = true; render(); } });
  return `<div class="hx" id="hx"><aside class="hx-side" id="hx-side">${sideHtml()}</aside><section class="hx-main" id="hx-main">${mainHtml()}</section></div>`;
};
window.hermesAfterRender = () => {
  const r = hxR();
  if (r.c && (!S.hx.chat || S.hx.chat.id !== r.c)) { hxLoadChat(r.c).then(() => { paintMain(); hxRefreshSide(); }); return; }
  afterMain();
};
window.paintMain = paintMain;
function paintMain() { const m = $("#hx-main"); if (m) { m.innerHTML = mainHtml(); afterMain(); } }
function paintSide() { const s = $("#hx-side"); if (!s) return; const q = document.activeElement?.id === "hx-q"; s.innerHTML = sideHtml(); if (q) { const i = $("#hx-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
async function hxRefreshSide() { await hxLoad(); paintSide(); }
function afterMain() {
  const box = $("#hx-msgs"); if (box) box.scrollTop = box.scrollHeight;
  const inp = $("#hx-in"); if (inp) { autosize(inp); if (!S.hx.noFocus) inp.focus({ preventScroll: true }); }
  const live = $("#hx-live");
  if (live && live.dataset.job && S.hx.liveJob !== live.dataset.job) follow(live.dataset.job);
}
function autosize(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 260) + "px"; }

function follow(jobId) {
  S.hx.liveJob = jobId; let out = "";
  streamJob(jobId, (ev) => {
    const b = $("#hx-live .bubble"), st = $("#hx-steps"), box = $("#hx-msgs");
    if (!b) return;
    if (ev.event === "message.delta") { out += ev.delta || ""; b.innerHTML = mdBlock(out); }
    else if (ev.event?.startsWith("run.") && ev.output) { out = ev.output; b.innerHTML = mdBlock(out); }
    else if (ev.event === "tool.started" && st) st.insertAdjacentHTML("beforeend", `<span class="step" title="${esc(ev.preview || "")}">${esc(ev.tool)}</span>`);
    else if (ev.event === "approval.request" && st) st.insertAdjacentHTML("beforeend", `<span class="step warn">approval${ev.auto_approved ? " (auto)" : ""}</span>`);
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
  }, async () => {
    S.hx.liveJob = null;
    const id = S.hx.chat && S.hx.chat.id;
    setTimeout(async () => { if (id) await hxLoadChat(id); if (current === "hermes") { paintMain(); hxRefreshSide(); } }, 700);
  });
}

/* ---------------- actions ---------------- */
async function hxSend(text) {
  const msg = (text ?? $("#hx-in")?.value ?? "").trim(); if (!msg) return;
  S.hx.draft = "";
  try {
    let id = hxR().c;
    if (!id) { const c = await papi("POST", "/hermes/chats", { folder: S.hx.newFolder || null }); id = c.id; S.hx.newFolder = null; }
    const d = await papi("POST", `/hermes/chats/${id}/messages`, { message: msg });
    S.hx.chat = d.chat; loadHermes();
    if (hxR().c !== id) { await hxLoad(); go(`#/hermes?c=${id}`); } else { paintMain(); hxRefreshSide(); }
  } catch (e) { alert(e.message); }
}
async function chatPatch(id, body) { await papi("POST", `/hermes/chats/${id}`, body); if (S.hx.chat && S.hx.chat.id === id) Object.assign(S.hx.chat, body); await hxLoad(); paintSide(); if (hxR().c === id) paintMain(); }
async function chatDelete(id) {
  const c = S.hx.chats.find((x) => x.id === id); if (!confirm(`Delete the chat "${c ? c.title : id}"? This cannot be undone.`)) return;
  await papi("DELETE", `/hermes/chats/${id}`, {}); await hxLoad();
  if (hxR().c === id) go("#/hermes"); else paintSide();
}
async function folderOp(body) {
  try { const d = await papi("POST", "/hermes/folders", body); S.hx.folders = d.folders; await hxLoad(); return true; } catch (e) { alert(e.message); return false; }
}
async function newFolder(parent) {
  const name = prompt(parent ? "Subfolder name" : "Folder name (a folder with instructions works as a project)"); if (!name) return;
  if (await folderOp({ op: "create", name, parent: parent || null })) { if (parent) S.hx.open[parent] = true; saveOpen(); S.forceRender = true; render(); }
}
const saveOpen = () => localStorage.setItem("hxOpen", JSON.stringify(S.hx.open));

/* popover menu */
function closeMenu() { $("#hx-menu")?.remove(); }
function openMenu(btn, items) {
  closeMenu();
  const r = btn.getBoundingClientRect(), m = document.createElement("div");
  m.id = "hx-menu"; m.className = "scope-pop hx-menu";
  m.innerHTML = items.map((it, i) => (it.sep ? `<div class="hx-sep">${esc(it.sep)}</div>` : `<button class="sc-item ${it.danger ? "danger" : ""}" data-mi="${i}" style="padding-left:${10 + (it.depth || 0) * 14}px">${it.icon ? `<span class="sc-ic">${icon(it.icon)}</span>` : ""}<span>${esc(it.label)}</span></button>`)).join("");
  document.body.appendChild(m);
  m.style.position = "fixed"; m.style.width = "240px"; m.style.right = "auto";
  m.style.left = Math.min(r.left, innerWidth - 250) + "px";
  m.style.top = (r.bottom + 4 + m.offsetHeight > innerHeight ? Math.max(8, r.top - m.offsetHeight - 4) : r.bottom + 4) + "px";
  m.onclick = (e) => { const b = e.target.closest("[data-mi]"); if (!b) return; e.stopPropagation(); const it = items[+b.dataset.mi]; closeMenu(); it.act && it.act(); };
}
function moveItems(chatId) {
  const tree = (pid, depth) => fKids(pid).flatMap((f) => [{ label: f.name, icon: "folder", depth, act: () => chatPatch(chatId, { folder: f.id }) }, ...tree(f.id, depth + 1)]);
  return [{ sep: "Move to" }, { label: "No folder", icon: "chat", act: () => chatPatch(chatId, { folder: null }) }, ...tree(null, 0),
    { label: "New folder…", icon: "folderplus", act: async () => { const n = prompt("Folder name"); if (n && await folderOp({ op: "create", name: n })) { const f = S.hx.folders[S.hx.folders.length - 1]; chatPatch(chatId, { folder: f.id }); } } }];
}
function chatMenu(btn, id) {
  const c = S.hx.chats.find((x) => x.id === id) || S.hx.chat; if (!c) return;
  if (btn.dataset.moveOnly) return openMenu(btn, moveItems(id));
  openMenu(btn, [
    { label: "Rename", icon: "edit", act: async () => { const t = prompt("Chat title", c.title); if (t) chatPatch(id, { title: t }); } },
    { label: c.pinned ? "Unpin" : "Pin", icon: "pin", act: () => chatPatch(id, { pinned: !c.pinned }) },
    { label: c.archived ? "Unarchive" : "Archive", icon: "archive", act: () => chatPatch(id, { archived: !c.archived }) },
    ...moveItems(id),
    { sep: "" }, { label: "Delete", icon: "trash", danger: true, act: () => chatDelete(id) }]);
}
function folderMenu(btn, id) {
  const f = fById(id); if (!f) return;
  openMenu(btn, [
    { label: "New chat here", icon: "plus", act: () => { S.hx.newFolder = id; go("#/hermes"); } },
    { label: "New subfolder", icon: "folderplus", act: () => newFolder(id) },
    { label: "Open / instructions", icon: "edit", act: () => go(`#/hermes?f=${id}`) },
    { label: "Rename", icon: "edit", act: async () => { const n = prompt("Folder name", f.name); if (n && await folderOp({ op: "update", id, name: n })) paintSide(); } },
    { label: "Move to top level", icon: "folder", act: async () => { if (await folderOp({ op: "update", id, parent: null })) paintSide(); } },
    { sep: "" }, { label: "Delete folder", icon: "trash", danger: true, act: () => folderDelete(id) }]);
}
async function folderDelete(id) {
  const f = fById(id); if (!confirm(`Delete folder "${f.name}"? Its chats and subfolders move up one level; nothing is deleted.`)) return;
  if (await folderOp({ op: "delete", id })) { if (hxR().f === id) go("#/hermes"); else paintSide(); }
}

/* ---------------- events ---------------- */
document.addEventListener("click", async (e) => {
  if (!$("#hx")) return;
  if ($("#hx-menu") && !e.target.closest("#hx-menu")) closeMenu();
  const t = e.target.closest("#hx-new,#hx-newfolder,#hx-arch,#hx-nofolder,#hx-rename,#hx-stop,#hx-ins-save,[data-toggle],[data-menu-chat],[data-menu-folder],[data-chat-act],[data-folder-act],[data-sugg],[data-joblog]");
  if (!t) return;
  e.preventDefault(); e.stopPropagation();
  const c = S.hx.chat, fid = hxR().f;
  if (t.id === "hx-new") { S.hx.newFolder = fid || (c && c.folder) || null; S.hx.chat = null; return go("#/hermes"); }
  if (t.id === "hx-newfolder") return newFolder(null);
  if (t.id === "hx-arch") { S.hx.showArch = !S.hx.showArch; return paintSide(); }
  if (t.id === "hx-nofolder") { S.hx.newFolder = null; return paintMain(); }
  if (t.id === "hx-rename") { const n = prompt("Chat title", c.title); if (n) chatPatch(c.id, { title: n }); return; }
  if (t.id === "hx-stop") { const last = c.messages[c.messages.length - 1]; try { await papi("POST", `/hermes/jobs/${last.job}/stop`, {}); t.disabled = true; } catch (err) { alert(err.message); } return; }
  if (t.id === "hx-ins-save") { const msg = $("#hx-ins-msg"); msg.textContent = "saving to Git…"; if (await folderOp({ op: "update", id: fid, instructions: $("#hx-ins").value })) msg.textContent = "Saved to Git."; paintSide(); return; }
  if (t.dataset.toggle) { S.hx.open[t.dataset.toggle] = !S.hx.open[t.dataset.toggle]; saveOpen(); return paintSide(); }
  if (t.dataset.menuChat) return chatMenu(t, t.dataset.menuChat);
  if (t.dataset.menuFolder) return folderMenu(t, t.dataset.menuFolder);
  if (t.dataset.chatAct === "pin") return chatPatch(c.id, { pinned: !c.pinned });
  if (t.dataset.chatAct === "archive") return chatPatch(c.id, { archived: !c.archived });
  if (t.dataset.chatAct === "delete") return chatDelete(c.id);
  if (t.dataset.folderAct === "newchat") { S.hx.newFolder = fid; return go("#/hermes"); }
  if (t.dataset.folderAct === "sub") return newFolder(fid);
  if (t.dataset.folderAct === "rename") { const f = fById(fid); const n = prompt("Folder name", f.name); if (n && await folderOp({ op: "update", id: fid, name: n })) { S.forceRender = true; render(); } return; }
  if (t.dataset.folderAct === "delete") return folderDelete(fid);
  if (t.dataset.sugg) return hxSend(t.dataset.sugg);
  if (t.dataset.joblog) return openJob(t.dataset.joblog);
}, true);
document.addEventListener("submit", (e) => { if (e.target.id === "hx-form") { e.preventDefault(); hxSend(); } });
document.addEventListener("keydown", (e) => { if (e.target.id === "hx-in" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); hxSend(); } });
let qTimer = null;
document.addEventListener("input", (e) => {
  if (e.target.id === "hx-in") { S.hx.draft = e.target.value; autosize(e.target); }
  if (e.target.id === "hx-q") {
    S.hx.q = e.target.value; S.hx.qIds = null; paintSide(); clearTimeout(qTimer);
    if (S.hx.q.length >= 3) qTimer = setTimeout(async () => { try { const d = await papi("GET", `/hermes/chats?q=${encodeURIComponent(S.hx.q)}`); S.hx.qIds = new Set(d.chats.map((c) => c.id)); paintSide(); } catch (_) { /* ignore */ } }, 300);
  }
});
/* drag & drop: chats onto folders (or a section header = no folder), folders onto folders */
document.addEventListener("dragstart", (e) => {
  const c = e.target.closest?.("[data-drag-chat]"), f = e.target.closest?.("[data-drag-folder]");
  if (c) e.dataTransfer.setData("text/hx", "chat:" + c.dataset.dragChat); else if (f) e.dataTransfer.setData("text/hx", "folder:" + f.dataset.dragFolder); else return;
  e.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragover", (e) => { const d = e.target.closest?.("[data-drop-folder]"); if (d && $("#hx")) { e.preventDefault(); document.querySelectorAll(".hx-drop").forEach((x) => x.classList.remove("hx-drop")); d.classList.add("hx-drop"); } });
document.addEventListener("dragleave", (e) => { e.target.closest?.("[data-drop-folder]")?.classList.remove("hx-drop"); });
document.addEventListener("drop", async (e) => {
  const d = e.target.closest?.("[data-drop-folder]"); if (!d || !$("#hx")) return;
  e.preventDefault(); d.classList.remove("hx-drop");
  const [kind, id] = (e.dataTransfer.getData("text/hx") || ":").split(":"), target = d.dataset.dropFolder || null;
  if (kind === "chat") return chatPatch(id, { folder: target });
  if (kind === "folder" && id !== target) { if (target && fSub(id).includes(target)) return alert("A folder cannot move into its own subfolder."); if (await folderOp({ op: "update", id, parent: target })) { if (target) { S.hx.open[target] = true; saveOpen(); } paintSide(); } }
});
setInterval(() => { if (current === "hermes" && $("#hx") && document.visibilityState === "visible" && !$("#hx-menu")) hxRefreshSide(); }, 20000);
