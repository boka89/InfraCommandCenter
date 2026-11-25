"use strict";
/* ICC sign-in: local users / LDAP (username + password) and/or OpenID Connect (SSO button) */
const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t;
const $id = (x) => document.getElementById(x);
fetch("/papi/me", { credentials: "same-origin" }).then((r) => r.json()).then((m) => { if (m.user) location.replace("/"); }).catch(() => {});
fetch("/papi/auth/methods").then((r) => r.json()).then((m) => {
  $id("l-name").textContent = m.name || "Infra Command Center";
  document.title = `Sign in · ${m.name || "Infra Command Center"}`;
  $id("l-ver").textContent = `Infra Command Center ${m.version || ""}`;
  if (m.oidc) { $id("sso").hidden = false; $id("sso-btn").textContent = m.oidc; $id("sso-btn").onclick = () => { location.href = "/papi/oidc/login"; }; }
  if (m.password) {
    $id("login").hidden = false;
    $id("msg").textContent = [m.local && "Local account", m.ldap].filter(Boolean).join(" or ");
  } else $id("sso-or").hidden = true;
  const e = new URLSearchParams(location.search).get("e");
  if (e) { const msg = $id("msg"); $id("login").hidden = false; msg.textContent = e; msg.className = "bad-text"; }
}).catch(() => { $id("login").hidden = false; });
$id("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), msg = $id("msg");
  msg.textContent = "Checking…"; msg.className = "faint";
  try {
    const r = await fetch("/papi/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: f.get("user"), password: f.get("password") }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    // login.html is also served in place of any protected URL: the same URL must be reloaded
    if (location.pathname === "/login.html") location.replace("/" + (location.hash || ""));
    else location.reload();
  } catch (err) { msg.textContent = err.message; msg.className = "bad-text"; }
});
