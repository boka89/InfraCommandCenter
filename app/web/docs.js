/* Infra Command Center — integrated docs. SPDX-License-Identifier: Apache-2.0
 * Markdown pages live in the config repository (<config path>/docs, ICC_DOCS_DIR) and are rendered by the API
 * (/papi/docs/*). Browse with the page tree, search across all pages, edit a page in place: saving commits to Git.
 * Mermaid diagrams are drawn in the browser (vendor/mermaid.min.js, loaded only when a page has one). */
(() => {
  const legacyDocs = PAGES.docs; // external MkDocs search (ICC_DOCS_URL), used when the repo has no docs/
  const D = { nav: null, pages: 0, css: [], cache: {}, hits: null, q: "", edit: null, err: null, web: "", loading: {} };
  const enc = encodeURIComponent;
  const hasDocs = () => !!(ICC().features || {}).docs;
  const docHref = (p, a) => `#/docs?p=${enc(p).replace(/%2F/g, "/")}${a ? `&a=${enc(a)}` : ""}`;

  async function loadNav(force) {
    if (D.nav && !force) return;
    try {
      const r = await fetch("/papi/docs/nav", { credentials: "same-origin" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      Object.assign(D, { nav: j.nav, pages: j.pages, css: j.css || [], web: j.web, err: null });
      D.css.forEach((href) => { if (!document.querySelector(`link[data-docs-css="${href}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.dataset.docsCss = href; document.head.appendChild(l); } });
    } catch (e) { D.err = String(e.message || e); D.nav = []; }
  }
  async function loadPage(p, force) {
    const key = p || "";
    if ((D.cache[key] && !force) || D.loading[key]) return;
    D.loading[key] = true;
    try {
      const r = await fetch(`/papi/docs/page?path=${enc(key)}`, { credentials: "same-origin" });
      D.cache[key] = await r.json();
      if (!r.ok) D.cache[key] = { error: D.cache[key].error || `HTTP ${r.status}`, path: key };
    } catch (e) { D.cache[key] = { error: String(e), path: key }; }
    D.loading[key] = false;
    if (current === "docs") rerender();
  }
  let searchT = null;
  function search(q) {
    D.q = q;
    clearTimeout(searchT);
    if (!q.trim()) { D.hits = null; return rerender(); }
    searchT = setTimeout(async () => {
      try { const r = await fetch(`/papi/docs/search?q=${enc(q)}`, { credentials: "same-origin" }); D.hits = (await r.json()).hits || []; }
      catch (e) { D.hits = []; }
      if (D.q === q) rerender();
    }, 180);
  }

  /* ---------- rendering ---------- */
  const navTree = (items, cur, depth = 0) => `<ul class="dnav-l${depth}">${items.map((it) => {
    const open = it.children && containsPath(it, cur);
    const self = it.path ? `<a href="${it.url ? esc(it.url) : docHref(it.path)}" class="${it.path === cur ? "on" : ""}" ${it.url ? 'target="_blank" rel="noopener"' : ""}>${esc(it.title)}</a>` : `<span>${esc(it.title)}</span>`;
    if (!it.children || !it.children.length) return `<li>${self}</li>`;
    return `<li class="grp"><details ${open || depth === 0 && items.length < 9 ? "open" : ""}><summary>${self}</summary>${navTree(it.children, cur, depth + 1)}</details></li>`;
  }).join("")}</ul>`;
  const containsPath = (it, cur) => it.path === cur || (it.children || []).some((c) => containsPath(c, cur));
  const findTitle = (items, p) => { for (const it of items || []) { if (it.path === p) return it.title; const t = findTitle(it.children, p); if (t) return t; } return null; };
  const crumbs = (items, p, trail = []) => { for (const it of items || []) { const t = [...trail, it]; if (it.path === p) return t; const r = crumbs(it.children, p, t); if (r) return r; } return null; };
  const mark = (txt, words) => { let s = esc(txt); words.forEach((w) => { if (w.length > 1) s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`); }); return s; };

  function results() {
    const words = D.q.toLowerCase().split(/\s+/).filter(Boolean);
    const inv = [...S.inv.nodes, ...S.inv.services].filter((x) => words.every((w) => JSON.stringify(x).toLowerCase().includes(w))).slice(0, 8);
    const hits = D.hits || [];
    return `<div class="card"><h2>Pages (${D.hits ? hits.length : "…"})</h2>${hits.length ? `<ul class="list dhits">${hits.map((h) => `<li><div><a href="${docHref(h.path, h.anchor)}"><b>${mark(h.section, words)}</b></a>${h.section !== h.page ? ` <span class="faint">· ${esc(h.page)}</span>` : ""} <span class="faint mono">${esc(h.path)}</span><div class="muted">${mark(h.snippet, words)}</div></div></li>`).join("")}</ul>` : `<div class="empty">${D.hits ? "No page matches." : "searching…"}</div>`}</div>
      ${inv.length ? `<div class="card"><h2>Inventory (${inv.length})</h2><ul class="list">${inv.map((x) => `<li>${x.category ? dot(svcStatus(x).s) : dot(nodeStatus(x).s)}<div><b ${x.category ? "" : `data-node="${esc(x.id)}" style="cursor:pointer"`}>${esc(x.name)}</b> ${sitePill(x.site)}<div class="muted">${esc(x.role || x.desc || "")}</div></div></li>`).join("")}</ul></div>` : ""}`;
  }

  function editor(pg) {
    const e = D.edit;
    return `<div class="card deditor"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div><b>${e.isNew ? "New page" : "Edit"}</b> ${e.isNew ? `<input id="dpath" value="${esc(e.path)}" placeholder="section/page-name.md" style="min-width:300px">` : `<span class="mono faint">${esc(e.path)}</span>`}</div>
        <div class="row" style="gap:6px"><button class="ghost sm" data-dact="cancel">Cancel</button><button class="primary sm" data-dact="save" ${e.busy ? "disabled" : ""}>${e.busy ? "Saving…" : "Save & commit"}</button></div></div>
      ${e.error ? `<div class="dnote bad">${esc(e.error)}</div>` : ""}
      <textarea id="dtext" spellcheck="false">${esc(e.text)}</textarea>
      <div class="faint" style="font-size:12px">Markdown with admonitions (<code>!!! note</code>), tabs (<code>=== "Tab"</code>), tables, task lists, <code>\`\`\`mermaid</code> diagrams and <code>:material-server:</code> icons. Saving commits to <code>${esc(D.web ? "Git" : "the config repo")}</code> as you.</div></div>`;
  }

  function pageView(p, a) {
    const key = p || "";
    const pg = D.cache[key];
    if (!pg) { loadPage(key); return `<div class="card"><div class="faint">loading…</div></div>`; }
    if (pg.error) return `<div class="card"><div class="empty">${esc(pg.error)} <span class="mono">${esc(pg.path || "")}</span></div></div>`;
    if (D.edit && D.edit.path === pg.path && !D.edit.isNew) return editor(pg);
    const up = pg.updated;
    const trail = crumbs(D.nav, pg.path) || [];
    const hideToc = (pg.hide || []).includes("toc") || !(pg.toc || []).length;
    const toc = hideToc ? "" : `<nav class="dtoc"><div class="lbl">On this page</div>${pg.toc.map((t) => `<a href="${docHref(pg.path, t.id)}">${esc(t.name)}</a>${(t.children || []).map((c) => `<a class="sub" href="${docHref(pg.path, c.id)}">${esc(c.name)}</a>`).join("")}`).join("")}</nav>`;
    return `<div class="dpage ${hideToc ? "notoc" : ""}"><div class="dmain">
      <div class="dbar"><span class="faint">${trail.slice(0, -1).map((t) => t.path ? `<a href="${docHref(t.path)}">${esc(t.title)}</a>` : esc(t.title)).join(" / ")}</span><span class="sp"></span>
        ${up ? `<a class="faint" href="${esc(up.url || "#")}" target="_blank" rel="noopener" title="${esc(up.subject || "")}">Updated ${esc(fmtDT(up.date))} · ${esc((up.requestedBy || up.author || "").replace(/ via ICC$/, ""))}</a>` : ""}
        ${pg.web ? `<a class="ghost sm" href="${esc(pg.web)}" target="_blank" rel="noopener">Git${icon("external", "xs")}</a>` : ""}
        <button class="ghost sm" data-dact="edit" data-p="${esc(pg.path)}">Edit</button></div>
      <article class="dcontent" id="dcontent">${pg.html}</article></div>${toc}</div>`;
  }

  PAGES.docs = (params) => {
    if (!hasDocs()) return legacyDocs ? legacyDocs(params) : "";
    if (!D.nav) { loadNav().then(rerender); return `${hero("Docs", "Loading the documentation from Git…", [])}`; }
    const p = params.p || "";
    const cur = (D.cache[p] && D.cache[p].path) || p || "index.md";
    const head = `<div class="dhead"><div><h1>Docs</h1><div class="muted">${D.pages} pages in <a href="${esc(D.web || "#")}" target="_blank" rel="noopener">Git</a> · searchable, editable, versioned</div></div>
      <div class="row" style="gap:8px"><input type="search" id="q" placeholder="Search the docs and inventory… ( / )" value="${esc(D.q)}"><button class="ghost sm" data-dact="new">New page</button></div></div>`;
    const body = D.edit && D.edit.isNew ? editor({}) : D.q.trim() ? results() : pageView(p, params.a);
    return `${head}${D.err ? `<div class="card"><div class="empty">${esc(D.err)}</div></div>` : ""}<div class="dlayout"><aside class="dside">${navTree(D.nav || [], cur)}</aside><div>${body}</div></div>`;
  };

  /* ---------- after-render: anchors, mermaid ---------- */
  let mermaidP = null;
  const loadMermaid = () => mermaidP || (mermaidP = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "vendor/mermaid.min.js"; s.onload = () => ok(window.mermaid); s.onerror = bad; document.head.appendChild(s); }));
  async function afterRender() {
    if (current !== "docs") return;
    const r = route(); const el = $("#dcontent");
    if (!el) return;
    if (el.querySelector("pre.mermaid:not([data-processed])")) {
      try {
        const m = await loadMermaid();
        m.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default", fontFamily: "Barlow, system-ui, sans-serif" });
        await m.run({ nodes: el.querySelectorAll("pre.mermaid:not([data-processed])") });
      } catch (e) { console.warn("mermaid", e); }
    }
    if (r.params.a && r.params.a !== afterRender.last) { const t = document.getElementById(r.params.a); if (t) t.scrollIntoView({ block: "start" }); afterRender.last = r.params.a; }
    else if (!r.params.a) afterRender.last = null;
  }
  function rerender() { if (current === "docs") render(); }

  /* ---------- events ---------- */
  document.addEventListener("input", (e) => { if (e.target.id === "q" && current === "docs") { search(e.target.value); } if (e.target.id === "dtext" && D.edit) D.edit.text = e.target.value; if (e.target.id === "dpath" && D.edit) D.edit.path = e.target.value; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "s" && (e.ctrlKey || e.metaKey) && D.edit) { e.preventDefault(); save(); }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-dact]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const act = b.dataset.dact;
    if (act === "cancel") { if (D.edit && D.edit.dirty !== false && D.edit.text !== D.edit.orig && !confirm("Discard your changes?")) return; D.edit = null; return rerender(); }
    if (act === "new") { D.q = ""; D.hits = null; D.edit = { isNew: true, path: "", text: "# New page\n\n", orig: "# New page\n\n", sha: "" }; return rerender(); }
    if (act === "edit") {
      const r = await fetch(`/papi/docs/raw?path=${enc(b.dataset.p)}`, { credentials: "same-origin" }); const j = await r.json();
      if (!r.ok) return alert(j.error || r.status);
      D.edit = { isNew: false, path: j.path, text: j.text, orig: j.text, sha: j.sha }; rerender(); const t = $("#dtext"); if (t) t.focus(); return;
    }
    if (act === "save") return save();
  });
  async function save() {
    const e = D.edit; if (!e || e.busy) return;
    if (e.isNew && !/\.md$/.test(e.path)) e.path = e.path.replace(/\/?$/, "") + ".md";
    e.busy = true; e.error = null; rerender();
    try {
      const r = await fetch("/papi/docs/page", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-ICC": "1" }, body: JSON.stringify({ path: e.path, text: e.text, sha: e.sha }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      D.edit = null; D.cache = {}; await loadNav(true);
      location.hash = docHref(j.path);
    } catch (err) { e.busy = false; e.error = String(err.message || err); }
    rerender();
  }
  window.addEventListener("hashchange", () => { if (route().name === "docs") setTimeout(afterRender, 0); });
  window.ICCDocs = { afterRender, reload: () => { D.cache = {}; D.nav = null; } };
  // first load straight onto a docs URL
  setTimeout(() => { if (current === "docs") afterRender(); }, 0);
})();
