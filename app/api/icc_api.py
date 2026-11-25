#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Infra Command Center (ICC) API — served under /papi/ behind nginx in the same container.

* Sign-in: local users (PBKDF2 hashes), LDAP / Active Directory, OpenID Connect -> signed cookie
* Config = a Git repository (inventory, site structure, planner, changelog, settings). Every
  edit made in the UI is a commit. Without a remote repo ICC keeps a local repo on its volume.
* Inventory / probe targets are generated from the repo at runtime (no database).
* AI operator: Hermes Agent (API server). ICC starts runs (chat, Planner tasks, alarm fixes),
  relays their events, and by default auto-approves tool approvals (AI-first, full access).

Everything is configured with ICC_* environment variables, see docs/configuration.md.
No third-party dependencies except PyYAML (+ ldap3 when LDAP is enabled).
"""
import base64, getpass, hashlib, hmac, json, os, re, secrets, shutil, ssl, subprocess, sys, threading, time, uuid
import urllib.error, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import yaml

VERSION = os.environ.get("ICC_VERSION", "0.1.0-alpha")
E = os.environ.get


def flag(name, default=False):
    v = E(name)
    return default if v is None or v == "" else v.strip().lower() in ("1", "true", "yes", "on")


PORT = int(E("ICC_API_PORT", "8090"))
DATA = E("ICC_DATA_DIR", "/data")
PUBLIC_URL = E("ICC_PUBLIC_URL", "").rstrip("/")
SESSION_SECRET = (E("ICC_SESSION_SECRET") or "").encode()
SESSION_TTL = int(E("ICC_SESSION_TTL", str(12 * 3600)))
COOKIE = "icc_s"
COOKIE_SECURE = flag("ICC_COOKIE_SECURE", True)

# ---- config repository
REPO = E("ICC_CONFIG_REPO", "")                      # empty = local-only repo on the data volume
BRANCH = E("ICC_CONFIG_BRANCH", "main")
CPATH = E("ICC_CONFIG_PATH", "").strip("/")          # sub-directory of the repo that holds the ICC config
SEED_DIR = E("ICC_SEED_DIR", "/app/example/config")   # copied into a new local repo
GIT_EMAIL = E("ICC_GIT_EMAIL", "icc@localhost")       # author e-mail of commits made in the UI
AGENT_EMAIL = E("ICC_AGENT_GIT_EMAIL", "")            # author e-mail the AI agent commits with (activity attribution)
GIT_WEB = E("ICC_GIT_WEB", "")                        # e.g. https://github.com/acme/infra (auto-derived for GitHub/GitLab/Gitea URLs)

# ---- auth
PROVIDERS = [p.strip() for p in E("ICC_AUTH_PROVIDERS", "local").lower().split(",") if p.strip()]
USERS_FILE = E("ICC_USERS_FILE", "/etc/icc/users.yaml")
LDAP_URLS = E("ICC_LDAP_URLS", "").split()
LDAP_MODE = E("ICC_LDAP_MODE", "ad")                  # ad (bind as user@domain) | search (service bind + search)
LDAP_DOMAIN = E("ICC_LDAP_DOMAIN", "")
LDAP_BASE = E("ICC_LDAP_BASE_DN", "")
LDAP_GROUP = E("ICC_LDAP_GROUP_DN", "")
LDAP_BIND_DN = E("ICC_LDAP_BIND_DN", "")
LDAP_BIND_PW = E("ICC_LDAP_BIND_PASSWORD", "")
LDAP_FILTER = E("ICC_LDAP_USER_FILTER", "(uid={user})")
LDAP_NAME_ATTR = E("ICC_LDAP_NAME_ATTR", "displayName")
LDAP_CA = E("ICC_LDAP_CA_FILE", "")
LDAP_TLS_NAMES = E("ICC_LDAP_TLS_NAMES", "").split()
LDAP_STARTTLS = flag("ICC_LDAP_STARTTLS")
LDAP_LABEL = E("ICC_LDAP_LABEL", "Directory account")
OIDC_ISSUER = E("ICC_OIDC_ISSUER", "").rstrip("/")
OIDC_CLIENT = E("ICC_OIDC_CLIENT_ID", "")
OIDC_SECRET = E("ICC_OIDC_CLIENT_SECRET", "")
OIDC_SCOPES = E("ICC_OIDC_SCOPES", "openid profile email")
OIDC_USER_CLAIM = E("ICC_OIDC_USER_CLAIM", "preferred_username")
OIDC_GROUPS_CLAIM = E("ICC_OIDC_GROUPS_CLAIM", "groups")
OIDC_GROUPS = [g.strip() for g in E("ICC_OIDC_ALLOWED_GROUPS", "").split(",") if g.strip()]
OIDC_LABEL = E("ICC_OIDC_LABEL", "Sign in with SSO")

# ---- AI (Hermes Agent API server) + notifications
HERMES = E("ICC_HERMES_URL", "").rstrip("/")
HERMES_KEY = E("ICC_HERMES_API_KEY", "")
AUTO_APPROVE = flag("ICC_HERMES_AUTO_APPROVE", True)
NOTIFY_URL = E("ICC_NOTIFY_URL", "")                  # Hermes webhook route (deliver-only), HMAC signed
NOTIFY_SECRET = E("ICC_NOTIFY_SECRET", "")
METRICS_URL = E("ICC_METRICS_URL", "")                # only reported as a feature flag; nginx does the proxying
DOCS_URL = E("ICC_DOCS_URL", "").rstrip("/")

REPO_DIR = os.path.join(DATA, "repo")
KEY_FILE = os.path.join(DATA, ".git_key")
KNOWN_HOSTS = os.path.join(DATA, ".known_hosts")
JOBS_FILE = os.path.join(DATA, "jobs.json")
AUDIT_FILE = os.path.join(DATA, "audit.jsonl")       # sign-in accounting: personal data stays on the volume, not in Git
CHAT_ROOT = os.path.join(DATA, "chats")
audit_lock = threading.Lock()
git_lock = threading.RLock()
jobs_lock = threading.Condition()
chat_lock = threading.RLock()
JOBS = {}
FAILS = {}
STATUS_RE = ("backlog", "next", "doing", "waiting", "done")
TERMINAL = {"completed", "failed", "cancelled", "interrupted"}


def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *a, flush=True)


# per-file overrides (repo-relative paths) for repositories that keep these files elsewhere
FILE_OVERRIDES = {"icc.yaml": E("ICC_INSTANCE_FILE", ""), "inventory.yaml": E("ICC_INVENTORY_FILE", ""), "structure.yaml": E("ICC_STRUCTURE_FILE", ""),
                  "planner.md": E("ICC_PLANNER_FILE", ""), "changelog.md": E("ICC_CHANGELOG_FILE", "")}
SETTINGS_DIR = E("ICC_SETTINGS_DIR", "").strip("/")
ICONS_DIR = E("ICC_ICONS_DIR", "").strip("/")   # extra service icons in the config repo (default: <config path>/icons)
ICON_TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon"}


def rp(name):
    """repo-relative path of a config file"""
    if FILE_OVERRIDES.get(name):
        return FILE_OVERRIDES[name].strip("/")
    if SETTINGS_DIR and (name == "settings" or name.startswith("settings/")):
        return SETTINGS_DIR + name[len("settings"):]
    return f"{CPATH}/{name}" if CPATH else name


def resolve_link(href, rel_to):
    """relative Markdown link in a repo file -> web URL of the target (absolute links unchanged)"""
    if not href or re.match(r"^[a-z]+:", href) or href.startswith("#"):
        return href
    path = os.path.normpath(os.path.join(os.path.dirname(rp(rel_to)), href.split("#")[0])).lstrip("./")
    return web_url(path) + (("#" + href.split("#", 1)[1]) if "#" in href else "") if git_web() else href


def fp(name):
    return os.path.join(REPO_DIR, rp(name))


def git_web():
    if GIT_WEB:
        return GIT_WEB.rstrip("/")
    m = re.match(r"^(?:git@|ssh://git@)([^:/]+)[:/](.+?)(?:\.git)?/?$", REPO) or re.match(r"^https?://(?:[^@/]+@)?([^/]+)/(.+?)(?:\.git)?/?$", REPO)
    return f"https://{m.group(1)}/{m.group(2)}" if m else ""


def web_url(path, tree=False):
    w = git_web()
    return f"{w}/{'tree' if tree else 'blob'}/{BRANCH}/{path}" if w else ""


def commit_url(sha):
    w = git_web()
    return f"{w}/commit/{sha}" if w else ""


# ------------------------------------------------------------------ instance settings (icc.yaml)
_cfg_cache = {}


def load_yaml(name, default=None):
    try:
        with open(fp(name), encoding="utf-8") as f:
            return yaml.safe_load(f) or (default if default is not None else {})
    except FileNotFoundError:
        return default if default is not None else {}


def icc_cfg():
    head = _git("rev-parse", "HEAD", check=False).strip()
    if _cfg_cache.get("head") != head:
        _cfg_cache.update(head=head, cfg=load_yaml("icc.yaml"))
    return _cfg_cache["cfg"]


def assistant_name():
    return ((icc_cfg().get("assistant") or {}).get("name") or "Hermes").strip()


def instance_name():
    return ((icc_cfg().get("instance") or {}).get("name") or "Infra Command Center").strip()


# ------------------------------------------------------------------ sessions
def _sig(b):
    return hmac.new(SESSION_SECRET, b, hashlib.sha256).hexdigest()


def sign(obj):
    body = base64.urlsafe_b64encode(json.dumps(obj).encode())
    return body.decode() + "." + _sig(body)


def unsign(v):
    if not v or "." not in v:
        return None
    body, sig = v.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sig(body.encode())):
        return None
    try:
        o = json.loads(base64.urlsafe_b64decode(body))
    except ValueError:
        return None
    return o if o.get("e", 0) > time.time() else None


def make_session(user, name, via):
    return sign({"u": user, "n": name, "v": via, "e": int(time.time()) + SESSION_TTL})


def cookies(header):
    out = {}
    for part in (header or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k:
            out[k] = v
    return out


def set_cookie(name, value, max_age, path="/"):
    return f"{name}={value}; Path={path}; Max-Age={max_age}; HttpOnly; SameSite=Lax" + ("; Secure" if COOKIE_SECURE else "")


# ------------------------------------------------------------------ local users
def hash_password(pw, iterations=310000):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def check_password(pw, stored):
    try:
        algo, it, salt, dk = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), base64.b64decode(salt), int(it))
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except Exception:
        return False


_BOOT_HASH = []


def local_users():
    """users.yaml (Secret / file mount, never Git): {users: [{login, name, password_hash, disabled}]}
    plus an optional bootstrap admin from ICC_ADMIN_USER + ICC_ADMIN_PASSWORD(_HASH)."""
    users = {}
    try:
        with open(USERS_FILE, encoding="utf-8") as f:
            for u in (yaml.safe_load(f) or {}).get("users") or []:
                if u.get("login") and u.get("password_hash") and not u.get("disabled"):
                    users[str(u["login"]).lower()] = u
    except FileNotFoundError:
        pass
    adm = (E("ICC_ADMIN_USER") or "").lower()
    if adm and adm not in users:
        h = E("ICC_ADMIN_PASSWORD_HASH") or (_BOOT_HASH[0] if _BOOT_HASH else "")
        if h:
            users[adm] = {"login": adm, "name": E("ICC_ADMIN_NAME", "Administrator"), "password_hash": h}
    return users


def local_login(user, password):
    u = local_users().get(user.lower())
    if not u:
        hashlib.pbkdf2_hmac("sha256", b"x", b"y" * 16, 100000)  # similar timing for unknown users
        return None, "unknown"
    return (str(u.get("name") or u["login"]), None) if check_password(password, u["password_hash"]) else (None, "invalid")


# ------------------------------------------------------------------ LDAP / Active Directory
def ldap_login(user, password):
    """-> (display_name, None) on success, (None, reason) otherwise."""
    from ldap3 import Connection, Server, Tls
    from ldap3.utils.conv import escape_filter_chars
    if not password or not LDAP_URLS:
        return None, "invalid"
    tls = Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=LDAP_CA or None, valid_names=LDAP_TLS_NAMES or None)
    last = "unreachable"

    def conn(srv, who, pw):
        c = Connection(srv, user=who, password=pw, receive_timeout=10)
        if LDAP_STARTTLS:
            c.open()
            c.start_tls()
        return c

    for url in LDAP_URLS:
        try:
            srv = Server(url, use_ssl=url.startswith("ldaps://"), tls=tls, connect_timeout=5)
            if LDAP_MODE == "ad":
                c = conn(srv, f"{user}@{LDAP_DOMAIN}" if LDAP_DOMAIN else user, password)
            else:
                c = conn(srv, LDAP_BIND_DN or None, LDAP_BIND_PW or None)
            if not c.bind():
                if c.result.get("description") == "invalidCredentials":
                    return None, "invalid"   # don't retry on another server (lockout counter)
                last = c.result.get("description") or "bind failed"
                continue
            uf = escape_filter_chars(user)
            if LDAP_MODE == "ad":
                flt = "(&(objectCategory=person)(objectClass=user)(sAMAccountName=%s)(!(userAccountControl:1.2.840.113556.1.4.803:=2))" % uf
                if LDAP_GROUP:
                    flt += "(memberOf:1.2.840.113556.1.4.1941:=%s)" % escape_filter_chars(LDAP_GROUP)
                flt += ")"
            else:
                flt = LDAP_FILTER.replace("{user}", uf)
                if LDAP_GROUP:
                    flt = "(&%s(memberOf=%s))" % (flt, escape_filter_chars(LDAP_GROUP))
            c.search(LDAP_BASE, flt, attributes=[LDAP_NAME_ATTR])
            ent = c.entries[0] if c.entries else None
            if not ent:
                c.unbind()
                return None, "not in group" if LDAP_GROUP else "unknown"
            dn = ent.entry_dn
            name = str(getattr(ent, LDAP_NAME_ATTR, "") or user)
            c.unbind()
            if LDAP_MODE != "ad":  # verify the password by binding as the user
                uc = conn(srv, dn, password)
                if not uc.bind():
                    return None, "invalid"
                uc.unbind()
            return name, None
        except Exception as ex:  # network/TLS -> try the next server
            last = f"{type(ex).__name__}: {ex}"
            log("ldap", url, last)
    return None, last


# ------------------------------------------------------------------ OpenID Connect (authorization code + PKCE)
_oidc_meta = {}


def oidc_meta():
    if not _oidc_meta.get("m") or time.time() - _oidc_meta.get("t", 0) > 3600:
        with urllib.request.urlopen(OIDC_ISSUER + "/.well-known/openid-configuration", timeout=10) as r:
            _oidc_meta.update(m=json.loads(r.read()), t=time.time())
    return _oidc_meta["m"]


def redirect_uri(handler):
    base = PUBLIC_URL or f"{handler.headers.get('X-Forwarded-Proto', 'https')}://{handler.headers.get('Host')}"
    return base + "/papi/oidc/callback"


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def jwt_claims(tok):
    try:
        p = tok.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    except Exception:
        return {}


def oidc_finish(handler, code, st):
    """Exchange the code. The ID token comes straight from the token endpoint over TLS, so per OIDC Core
    3.1.3.7 TLS server validation stands in for the signature check; iss/aud/exp/nonce are checked."""
    m = oidc_meta()
    data = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri(handler),
                                   "client_id": OIDC_CLIENT, "client_secret": OIDC_SECRET, "code_verifier": st["v"]}).encode()
    req = urllib.request.Request(m["token_endpoint"], data=data, headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        tok = json.loads(r.read())
    claims = jwt_claims(tok.get("id_token", ""))
    aud = claims.get("aud")
    if claims.get("iss", "").rstrip("/") != OIDC_ISSUER or (OIDC_CLIENT not in (aud if isinstance(aud, list) else [aud])) \
            or claims.get("exp", 0) < time.time() or claims.get("nonce") != st["n"]:
        raise PermissionError("ID token rejected (issuer, audience, expiry or nonce)")
    if m.get("userinfo_endpoint") and tok.get("access_token"):
        try:
            ureq = urllib.request.Request(m["userinfo_endpoint"], headers={"Authorization": f"Bearer {tok['access_token']}"})
            with urllib.request.urlopen(ureq, timeout=10) as r:
                ui = json.loads(r.read())
            if ui.get("sub") == claims.get("sub"):
                claims = {**claims, **ui}
        except Exception as ex:
            log("oidc userinfo", ex)
    groups = claims.get(OIDC_GROUPS_CLAIM) or []
    if isinstance(groups, str):
        groups = [groups]
    if OIDC_GROUPS and not set(groups) & set(OIDC_GROUPS):
        raise PermissionError("not in an allowed group")
    login = str(claims.get(OIDC_USER_CLAIM) or claims.get("email") or claims.get("sub") or "").lower()
    login = re.sub(r"[^a-z0-9._@-]", "_", login)[:64]
    if not login:
        raise PermissionError("no user name claim")
    return login, str(claims.get("name") or login)


# ------------------------------------------------------------------ Git
def _git(*args, check=True, cwd=None):
    ssh = f"ssh -i {KEY_FILE} -o IdentitiesOnly=yes -o UserKnownHostsFile={KNOWN_HOSTS} -o StrictHostKeyChecking=" \
          + ("yes" if os.path.exists(KNOWN_HOSTS) and os.path.getsize(KNOWN_HOSTS) else "accept-new")
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", **({"GIT_SSH_COMMAND": ssh} if os.path.exists(KEY_FILE) else {}))
    r = subprocess.run(["git", "-C", cwd or REPO_DIR, *args], capture_output=True, text=True, env=env, timeout=120)
    if check and r.returncode:
        raise RuntimeError(f"git {args[0]}: {r.stderr.strip()[-300:]}")
    return r.stdout


def remote_url():
    tok = E("ICC_GIT_TOKEN", "")
    if tok and REPO.startswith("https://"):
        return "https://" + urllib.parse.quote(E("ICC_GIT_USER", "x-access-token"), safe="") + ":" + urllib.parse.quote(tok, safe="") + "@" + REPO[8:]
    return REPO


_last_fetch = [0.0]


def repo_sync(force=False):
    if not os.path.isdir(os.path.join(REPO_DIR, ".git")):
        os.makedirs(REPO_DIR, exist_ok=True)
        _git("init", "-q", "-b", BRANCH)
        _git("config", "user.name", "ICC")
        _git("config", "user.email", GIT_EMAIL)
        if REPO:
            _git("remote", "add", "origin", remote_url())
            force = True
        else:  # local-only: seed with the example config
            dst = os.path.join(REPO_DIR, CPATH) if CPATH else REPO_DIR
            shutil.copytree(SEED_DIR, dst, dirs_exist_ok=True)
            _git("add", "-A")
            _git("-c", "user.name=ICC", "-c", f"user.email={GIT_EMAIL}", "commit", "-q", "-m", "Initial ICC configuration (example)")
            log("local config repo created from", SEED_DIR)
    if REPO and (force or time.time() - _last_fetch[0] > 20):
        _git("remote", "set-url", "origin", remote_url())
        _git("fetch", "-q", "origin", BRANCH)
        _git("reset", "-q", "--hard", "FETCH_HEAD")
        _last_fetch[0] = time.time()


def commit_push(sess, message, paths):
    """commit paths as '<name> via ICC' and push; -> True when the remote has the commit (or there is no remote)."""
    _git("add", "-A", "--", *paths)
    if not _git("status", "--porcelain", "--", *paths).strip():
        return True
    _git("-c", f"user.name={sess['n']} via ICC", "-c", f"user.email={GIT_EMAIL}", "commit", "-q", "-m", message)
    if not REPO:
        return True
    push = _git("push", "-q", "origin", f"HEAD:{BRANCH}", check=False)
    head = _git("rev-parse", "HEAD").strip()
    ok = _git("ls-remote", "origin", BRANCH, check=False).split()[:1] == [head]
    if not ok:
        log("push failed / race", push)
        _last_fetch[0] = 0
    return ok


# ------------------------------------------------------------------ inventory.json + probe targets
_inv_cache = {}


def inventory():
    head = _git("rev-parse", "HEAD", check=False).strip()
    if _inv_cache.get("head") == head:
        return _inv_cache["inv"]
    inv = {"regions": [], "sites": [], "types": {}, "typeOrder": [], "categories": [], "nodes": [], "services": []}
    inv.update(load_yaml("structure.yaml"))
    inv.update(load_yaml("inventory.yaml"))
    for k in ("nodes", "services", "categories", "sites", "regions"):
        inv[k] = inv.get(k) or []
    cats = list(inv["categories"])
    for s in inv["services"]:  # services may use a category that is not declared
        if s.get("category") and s["category"] not in cats:
            cats.append(s["category"])
    inv["categories"] = cats
    cfg = icc_cfg()
    inv["icc"] = {
        "version": VERSION,
        "instance": {"name": instance_name(), "subtitle": "Infra Command Center", **(cfg.get("instance") or {})},
        "assistant": {"name": assistant_name()},
        "links": cfg.get("links") or {},
        "kubernetes": cfg.get("kubernetes") or {},
        "capacity": cfg.get("capacity") or {},
        "docs": {"url": DOCS_URL or (cfg.get("links") or {}).get("docs", ""), "sections": (cfg.get("docs") or {}).get("sections") or []},
        "features": {"metrics": bool(METRICS_URL), "hermes": bool(HERMES), "docsSearch": bool(DOCS_URL), "auth": PROVIDERS},
        "repo": {"web": git_web(), "branch": BRANCH, "path": CPATH, "remote": bool(REPO),
                 "files": {n: {"path": rp(n), "url": web_url(rp(n))} for n in ("icc.yaml", "inventory.yaml", "structure.yaml", "planner.md", "changelog.md")},
                 "settings": rp("settings")},
    }
    _inv_cache.update(head=head, inv=inv)
    return inv


def probes():
    """Blackbox targets (Prometheus http_sd format). probe: http (uses url) | icmp (ip) | tcp:<port> (ip) | none.
    Services default to http when they have a url; nodes default to none."""
    inv = inventory()
    out = []
    for kind, items in (("node", inv["nodes"]), ("service", inv["services"])):
        for x in items:
            p = x.get("probe") or ("http" if x.get("url") and kind == "service" else "none")
            mod = tgt = ""
            if p == "http" and x.get("url"):
                mod, tgt = "http", x["url"]
            elif p == "icmp" and x.get("ip"):
                mod, tgt = "icmp", x["ip"]
            elif str(p).startswith("tcp:") and x.get("ip"):
                mod, tgt = "tcp", f"{x['ip']}:{str(p)[4:]}"
            if mod:
                out.append({"targets": [tgt], "labels": {"module": mod, "probe_id": x.get("id", ""), "probe_kind": kind, "site": x.get("site") or ""}})
    return out


# ------------------------------------------------------------------ changelog.md
CL_RE = re.compile(r"^- \*\*(.+?)\*\*\s*[—–-]\s*`(\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?Z?)`\s*[—–-]\s*(.*)$")


def read_changelog():
    try:
        with open(fp("changelog.md"), encoding="utf-8") as f:
            lines = f.read().split("\n")
    except FileNotFoundError:
        return []
    out = []
    for line in lines:
        m = CL_RE.match(line.strip())
        if not m:
            continue
        summary, href = m.group(3).strip(), None
        lm = re.search(r"\s*[—–-]\s*\[(?:Link|Details|More)\]\(([^)\s]+)\)\s*$", summary)
        if lm:
            href, summary = lm.group(1), summary[:lm.start()].strip()
        out.append({"author": m.group(1), "ts": m.group(2), "summary": summary, "href": resolve_link(href, "changelog.md") if href else None})
    return out


# ------------------------------------------------------------------ planner.md
TASK_RE = re.compile(r"^- \[( |x|X)\] (.*)$")
TAG_RE = re.compile(r"^`([^`]+)`\s*")


def parse_line(rest):
    t = {"prio": "P2", "status": "backlog", "due": None, "owner": assistant_name()}
    while True:
        m = TAG_RE.match(rest)
        if not m:
            break
        v = m.group(1).strip()
        if re.fullmatch(r"P[1-3]", v):
            t["prio"] = v
        elif v in ("next", "doing", "waiting", "backlog"):
            t["status"] = v
        elif re.fullmatch(r"due:\d{4}-\d\d-\d\d", v):
            t["due"] = v[4:]
        elif v.startswith("owner:") and len(v) > 6:
            t["owner"] = v[6:]
        else:
            break
        rest = rest[m.end():]
    m = re.match(r"^\*\*(.+?)\*\*\s*(?:[—–-]\s*)?(.*)$", rest)
    if m:
        t["title"], t["details"] = m.group(1).strip(), m.group(2).strip()
    else:
        t["title"], t["details"] = rest.strip(), ""
    return t


def read_todo():
    try:
        with open(fp("planner.md"), encoding="utf-8") as f:
            lines = f.read().split("\n")
    except FileNotFoundError:
        lines = ["# Planner", ""]
    tasks, sections, section = [], [], ""
    for n, line in enumerate(lines):
        if line.startswith("## "):
            section = line[3:].strip()
            sections.append(section)
            continue
        m = TASK_RE.match(line)
        if m and section:
            t = parse_line(m.group(2))
            t.update(i=len(tasks), line=n, section=section, done=m.group(1) != " ")
            if t["done"]:
                t["status"] = "done"
            dm = re.search(r"done (\d{4}-\d\d-\d\d)", t["details"])
            t["doneAt"] = dm.group(1) if dm else None
            tasks.append(t)
    return lines, tasks, sections


def clean(s, n):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


def build_line(t):
    done = t["status"] == "done"
    tags = [] if done else [t["prio"]]
    if not done and t["status"] != "backlog":
        tags.append(t["status"])
    if t.get("due"):
        tags.append("due:" + t["due"])
    if t.get("owner") and t["owner"] != assistant_name():
        tags.append("owner:" + t["owner"])
    det = t.get("details") or ""
    if done and not re.search(r"done \d{4}-\d\d-\d\d", det):
        det = (f"done {time.strftime('%Y-%m-%d')}" + (f": {det}" if det else ""))
    return f"- [{'x' if done else ' '}] " + "".join(f"`{x}` " for x in tags) + f"**{t['title']}**" + (f" — {det}" if det else "")


def validate(b, partial_from=None):
    t = dict(partial_from or {"prio": "P2", "status": "backlog", "due": None, "owner": assistant_name(), "details": ""})
    if "title" in b:
        t["title"] = clean(b["title"], 200).replace("**", "").replace("`", "'")
    if "details" in b:
        t["details"] = clean(b["details"], 2000)
    if "prio" in b:
        if b["prio"] not in ("P1", "P2", "P3"):
            raise ValueError("prio")
        t["prio"] = b["prio"]
    if "status" in b:
        if b["status"] not in STATUS_RE:
            raise ValueError("status")
        t["status"] = b["status"]
    if "due" in b:
        if b["due"] and not re.fullmatch(r"\d{4}-\d\d-\d\d", b["due"]):
            raise ValueError("due")
        t["due"] = b["due"] or None
    if "owner" in b:
        o = clean(b["owner"], 40) or assistant_name()
        if not re.fullmatch(r"[\w .-]{1,40}", o):
            raise ValueError("owner")
        t["owner"] = o
    if not t.get("title"):
        raise ValueError("title")
    return t


def edit_todo(sess, op, body):
    """op: create | update | delete. Re-applies once on a push race."""
    for attempt in (1, 2):
        with git_lock:
            repo_sync(force=True)
            lines, tasks, sections = read_todo()
            if op == "create":
                t = validate(body)
                sec = clean(body.get("section"), 60)
                if not re.fullmatch(r"[\w &/.,()+-]{1,60}", sec or ""):
                    raise ValueError("section")
                new = build_line(t)
                in_sec = [x for x in tasks if x["section"] == sec]
                if in_sec:
                    lines.insert(max(x["line"] for x in in_sec if not x["done"]) + 1 if any(not x["done"] for x in in_sec) else in_sec[0]["line"], new)
                else:
                    while lines and lines[-1] == "":
                        lines.pop()
                    lines += ["", f"## {sec}", "", new, ""]
                title, verb = t["title"], "add"
            else:
                i = int(body.get("i", -1))
                cur = tasks[i] if 0 <= i < len(tasks) else None
                if not cur or cur["title"] != body.get("expectTitle"):
                    raise LookupError("The task changed in Git meanwhile — reload the Planner.")
                if op == "delete":
                    del lines[cur["line"]]
                    title, verb = cur["title"], "remove"
                else:
                    t = validate(body, cur)
                    lines[cur["line"]] = build_line(t)
                    title, verb = t["title"], "done" if t["status"] == "done" and not cur["done"] else "update"
            os.makedirs(os.path.dirname(fp("planner.md")) or ".", exist_ok=True)
            with open(fp("planner.md"), "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            if commit_push(sess, f"planner: {verb} \"{title[:80]}\" (by {sess['u']} via ICC)", [rp("planner.md")]):
                log("planner", verb, title, "by", sess["u"])
                return read_todo()[1]
    raise RuntimeError("Git push failed twice, try again.")


# ------------------------------------------------------------------ config files + history (read-only in the UI)
def config_files():
    base = [("Instance settings", rp("icc.yaml"), "Name, links, AI house rules, Kubernetes/capacity hints"),
            ("Site structure", rp("structure.yaml"), "Regions, sites, buildings, floors"),
            ("Inventory", rp("inventory.yaml"), "Hosts, VMs, devices, services, probes, Grafana links"),
            ("Planner", rp("planner.md"), "Tasks (editable in the Planner)"),
            ("Changelog", rp("changelog.md"), "Infrastructure changes, newest first"),
            ("User settings", rp("settings/users"), "Per-user settings (theme, time zone)"),
            ("Hermes folders", rp("settings/hermes"), "Per-user chat folders/projects and their instructions")]
    for x in icc_cfg().get("configFiles") or []:  # extra repo paths to show (e.g. Helm values of the platform)
        if x.get("path"):
            base.append((str(x.get("name") or x["path"]), str(x["path"]).strip("/"), str(x.get("desc") or "")))
    return base


def git_history(path, n):
    sep = "\x1f"
    raw = _git("log", f"-{int(n)}", f"--format=%H{sep}%an{sep}%ae{sep}%aI{sep}%s{sep}%(trailers:key=Requested-by,valueonly,separator=%x2C)", "--", path, check=False)
    out = []
    for line in raw.splitlines():
        parts = line.split(sep)
        if len(parts) < 6:
            continue
        h, an, ae, at, subj, req = parts[:6]
        out.append({"sha": h[:10], "author": an, "email": ae, "date": at, "subject": subj, "requestedBy": req.strip(), "url": commit_url(h)})
    return out


# ------------------------------------------------------------------ audit (sign-ins) + admin activity
def audit(ev, login, name="", ip="", why=""):
    rec = {"t": time.time(), "ev": ev, "login": login, "name": name, "ip": ip, "why": why}
    try:
        with audit_lock:
            with open(AUDIT_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            if os.path.getsize(AUDIT_FILE) > 4 * 1024 * 1024:
                lines = open(AUDIT_FILE, encoding="utf-8").readlines()
                with open(AUDIT_FILE + ".tmp", "w", encoding="utf-8") as f:
                    f.writelines(lines[len(lines) // 2:])
                os.replace(AUDIT_FILE + ".tmp", AUDIT_FILE)
    except Exception as ex:
        log("audit", repr(ex))


def read_audit(n=3000):
    try:
        with audit_lock:
            lines = open(AUDIT_FILE, encoding="utf-8").readlines()[-n:]
    except FileNotFoundError:
        return []
    out = []
    for ln in lines:
        try:
            out.append(json.loads(ln))
        except ValueError:
            pass
    return out


PORTAL_LOGIN_RE = re.compile(r"\(by ([\w.@-]+) via ICC\)|^(?:settings|hermes folders): ([\w.@-]+) ")
REQ_RE = re.compile(r"^(.*?)\s*\(([\w.@-]+)\)\s*(?:via .*)?$")
_act_cache = {}


def commit_actor(an, ae, subj, req):
    if ae == GIT_EMAIL and an.endswith(" via ICC"):
        m = PORTAL_LOGIN_RE.search(subj)
        return {"name": an[:-8], "login": (m.group(1) or m.group(2)) if m else "", "via": "portal"}
    if req:
        r0 = req.split(",")[0].strip()
        m = REQ_RE.match(r0)
        return {"name": m.group(1) if m else r0, "login": m.group(2) if m else "", "via": "hermes"}
    if (AGENT_EMAIL and ae == AGENT_EMAIL) or an.lower().startswith(assistant_name().lower()):
        return {"name": f"{assistant_name()} (AI)", "login": "", "via": "agent"}
    return {"name": an, "login": "", "via": "git"}


def git_activity(n=600):
    head = _git("rev-parse", "HEAD", check=False).strip()
    if _act_cache.get("head") == head:
        return _act_cache["rows"]
    sep, rs = "\x1f", "\x1e"
    raw = _git("log", f"-{int(n)}", "--name-only", f"--format={rs}%H{sep}%an{sep}%ae{sep}%aI{sep}%s{sep}%(trailers:key=Requested-by,valueonly,separator=%x2C)", check=False)
    rows = []
    for rec in raw.split(rs)[1:]:
        head_line, _, files = rec.partition("\n")
        parts = head_line.split(sep)
        if len(parts) < 6:
            continue
        h, an, ae, at, subj, req = parts[:6]
        paths = [x for x in files.splitlines() if x.strip()]
        areas = sorted({x.split("/")[0] if "/" in x else x for x in paths})
        rows.append({"type": "change", "t": at, "sha": h[:10], "subject": subj, "author": an, "requestedBy": req.strip(),
                     "areas": areas[:6], "files": len(paths), "url": commit_url(h), **commit_actor(an, ae, subj, req.strip())})
    _act_cache.update(head=head, rows=rows)
    return rows


# ------------------------------------------------------------------ per-user settings (Git)
PREF_KEYS = {"theme": ("dark", "light"), "tz": None, "scope": None}
LOGIN_RE = re.compile(r"^[a-z0-9._@-]{1,64}$")


def user_file(user, kind):
    if not LOGIN_RE.fullmatch(user):
        raise ValueError("login")
    return rp(f"settings/{kind}/{user}.yaml")


def read_prefs(user):
    try:
        return yaml.safe_load(open(os.path.join(REPO_DIR, user_file(user, "users")), encoding="utf-8")) or {}
    except FileNotFoundError:
        return {}


def save_prefs(sess, body):
    new = {}
    for k, allowed in PREF_KEYS.items():
        if k not in body:
            continue
        v = body[k]
        if k == "theme" and v not in allowed:
            raise ValueError("theme")
        if k == "tz" and not re.fullmatch(r"[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}|UTC", str(v)):
            raise ValueError("tz")
        if k == "scope":
            if not isinstance(v, dict) or v.get("k") not in ("all", "region", "site", "building", "floor") or not re.fullmatch(r"[a-z0-9/-]{0,70}", str(v.get("id", ""))):
                raise ValueError("scope")
            v = {"k": v["k"], **({"id": v["id"]} if v.get("id") else {})}
        new[k] = v
    with git_lock:
        repo_sync(force=True)
        cur = read_prefs(sess["u"])
        merged = {**cur, **new}
        if merged == cur:
            return cur
        path = user_file(sess["u"], "users")
        os.makedirs(os.path.dirname(os.path.join(REPO_DIR, path)), exist_ok=True)
        with open(os.path.join(REPO_DIR, path), "w", encoding="utf-8") as f:
            f.write(f"# ICC settings of {sess['u']} — written by ICC (Settings drawer)\n" + yaml.safe_dump(merged, sort_keys=True))
        what = ", ".join(f"{k}={v if k != 'scope' else v.get('id', v['k'])}" for k, v in new.items() if cur.get(k) != v)
        commit_push(sess, f"settings: {sess['u']} — {what}", [path])
        return merged


# ------------------------------------------------------------------ Hermes chats: folders (Git) + conversations (volume)
CID_RE = re.compile(r"^[a-z0-9]{8,16}$")


def _udir(user):
    d = os.path.join(CHAT_ROOT, re.sub(r"[^a-z0-9._@-]", "_", user))
    os.makedirs(d, exist_ok=True)
    return d


def load_chat(user, cid):
    if not CID_RE.fullmatch(cid or ""):
        return None
    try:
        with open(os.path.join(_udir(user), cid + ".json"), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def save_chat(user, c):
    path = os.path.join(_udir(user), c["id"] + ".json")
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)
    os.replace(path + ".tmp", path)


def chat_meta(c):
    last = c["messages"][-1] if c.get("messages") else None
    running = bool(last and last.get("role") == "assistant" and last.get("status") in ("queued", "running"))
    return {k: c.get(k) for k in ("id", "title", "folder", "pinned", "archived", "created", "updated", "unread")} | {"running": running, "count": len(c.get("messages") or [])}


def list_chats(user, q=""):
    out, ql = [], q.lower().strip()
    with chat_lock:
        for fn in os.listdir(_udir(user)):
            if not fn.endswith(".json"):
                continue
            try:
                c = json.load(open(os.path.join(_udir(user), fn), encoding="utf-8"))
            except Exception:
                continue
            if ql and ql not in (c.get("title", "") + " " + " ".join(m.get("text", "") for m in c.get("messages") or [])).lower():
                continue
            out.append(chat_meta(c))
    return sorted(out, key=lambda x: x.get("updated") or 0, reverse=True)


def read_folders(user):
    try:
        d = yaml.safe_load(open(os.path.join(REPO_DIR, user_file(user, "hermes")), encoding="utf-8")) or {}
    except FileNotFoundError:
        d = {}
    return d.get("folders") or []


def validate_folders(fs):
    out, ids = [], set()
    for f in fs:
        fid = str(f.get("id") or "")
        if not CID_RE.fullmatch(fid) or fid in ids:
            raise ValueError("folder id")
        ids.add(fid)
        o = {"id": fid, "name": clean(f.get("name"), 80) or "Untitled"}
        if f.get("parent"):
            o["parent"] = str(f["parent"])
        ins = str(f.get("instructions") or "").strip()[:6000]
        if ins:
            o["instructions"] = ins
        out.append(o)
    byid = {f["id"]: f for f in out}
    for f in out:
        seen, cur, depth = set(), f, 0
        while cur.get("parent"):
            if cur["parent"] not in byid or cur["id"] in seen or depth > 8:
                raise ValueError("folder tree (a folder cannot move into itself)")
            seen.add(cur["id"])
            cur = byid[cur["parent"]]
            depth += 1
    return out


def save_folders(sess, fs, summary):
    with git_lock:
        repo_sync(force=True)
        new = validate_folders(fs)
        path = user_file(sess["u"], "hermes")
        os.makedirs(os.path.dirname(os.path.join(REPO_DIR, path)), exist_ok=True)
        with open(os.path.join(REPO_DIR, path), "w", encoding="utf-8") as f:
            f.write(f"# Hermes chat folders/projects of {sess['u']} - written by ICC (Hermes page)\n"
                    "# instructions = system prompt for every chat in the folder (inherited by subfolders)\n"
                    + yaml.safe_dump({"folders": new}, sort_keys=False, allow_unicode=True, width=200))
        commit_push(sess, f"hermes folders: {sess['u']} - {clean(summary, 100)}", [path])
        return new


def folder_instructions(user, fid):
    fs = {f["id"]: f for f in read_folders(user)}
    chain, cur = [], fs.get(fid)
    while cur and len(chain) < 10:
        chain.append(cur)
        cur = fs.get(cur.get("parent"))
    path = " / ".join(f["name"] for f in reversed(chain))
    ins = "\n\n".join(f"[{f['name']}] {f['instructions']}" for f in reversed(chain) if f.get("instructions"))
    return path, ins


def chat_finished(j):
    if j.get("kind") != "chat" or not j.get("chat"):
        return
    with chat_lock:
        c = load_chat(j["login"], j["chat"])
        if not c:
            return
        for m in c["messages"]:
            if m.get("job") == j["id"]:
                m["status"] = j["status"]
                m["text"] = j.get("output") or ""
                if j.get("error") and j["status"] != "completed":
                    m["error"] = j["error"][:500]
        c["updated"], c["unread"] = time.time(), True
        save_chat(j["login"], c)


# ------------------------------------------------------------------ Hermes runs
def hermes(method, path, body=None, headers=None, timeout=30):
    if not HERMES:
        raise RuntimeError("no AI agent configured (ICC_HERMES_URL)")
    req = urllib.request.Request(HERMES + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {HERMES_KEY}", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"null")


def notify(text):
    if not (NOTIFY_URL and NOTIFY_SECRET):
        return
    body = json.dumps({"event_type": "icc", "message": text[:1900]}).encode()
    ts = str(int(time.time()))
    req = urllib.request.Request(NOTIFY_URL, data=body, method="POST", headers={
        "Content-Type": "application/json", "X-Webhook-Timestamp": ts, "X-Request-ID": uuid.uuid4().hex,
        "X-Webhook-Signature-V2": hmac.new(NOTIFY_SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as ex:
        log("notify failed", ex)


def save_jobs():
    with open(JOBS_FILE + ".tmp", "w") as f:
        json.dump({k: {x: y for x, y in v.items() if x != "events"} for k, v in JOBS.items()}, f)
    os.replace(JOBS_FILE + ".tmp", JOBS_FILE)


def public_job(j, full=False):
    keys = ["id", "kind", "title", "user", "status", "created", "started", "finished", "task", "alarm", "run_id"]
    if full:
        keys += ["output", "error", "prompt", "conv"]
    out = {k: j.get(k) for k in keys}
    out["summary"] = (j.get("output") or j.get("error") or "")[:400] if j.get("status") in TERMINAL else ""
    return out


def repo_context(name, user):
    """the part of every prompt that tells the agent where the configuration lives and how to change it"""
    where = f"{REPO} (branch {BRANCH}" + (f", directory {CPATH}" if CPATH else "") + ")" if REPO else \
        "the local repository of this ICC instance (no remote configured, so you cannot change it directly: describe the change instead)"
    rules = ((icc_cfg().get("assistant") or {}).get("instructions") or "").strip()
    return (f"ICC instance \"{instance_name()}\" ({PUBLIC_URL or 'no public URL set'}). The configuration is a Git repository: {where}. "
            f"Files: {rp('inventory.yaml')} (hosts/services/probes), {rp('structure.yaml')} (regions/sites/buildings/floors), "
            f"{rp('planner.md')} (tasks), {rp('changelog.md')} (one line per infrastructure change, newest first: "
            "\"- **<who>** — `YYYY-MM-DD HH:MM:SSZ` — <summary> — [Link](<detail page>)\"). "
            f"When you change configuration, edit those files, commit with the trailer \"Requested-by: {name} ({user}) via ICC\" and push. "
            "Record every real infrastructure change in the changelog. Verify what you change."
            + (f"\n\n[House rules of this organisation]\n{rules}" if rules else ""))


TASK_PROMPT = """[ICC Planner — "Execute with {agent}", requested by {name} ({user})]

Execute this task from the Planner:

Area: {section}
Priority: {prio} · Status: {status} · Due: {due} · Owner: {owner}
Task: {title}
Details: {details}

{context}

When finished, update THIS task in the planner: tick it with "done YYYY-MM-DD" and a short result, or set it
to `waiting` with `owner:<person>` and the open question if a decision is needed. End with a short result:
what changed, what was verified, what is left."""

ALARM_PROMPT = """[ICC Alarms — "Check & fix with {agent}", requested by {name} ({user})]

An alarm is active in ICC. Investigate it and fix it.

Alarm: {title}
Level: {level} · Site: {site} · Kind: {kind}
Reason shown in ICC: {why}
Inventory entry: {entry}

1. Confirm the alarm is real (metrics, ping/HTTP, hypervisor/Kubernetes/GitOps state, logs). If it is a false
   alarm or an inventory/monitoring error, fix the inventory or monitoring instead.
2. Find the root cause before changing anything.
3. Fix it. For anything destructive, costly or needing physical access, add a Planner task (`waiting`,
   `owner:<person>`) with your findings and proposal instead.
4. Verify the alarm is cleared (or explain why it persists).

{context}

End with a short result: cause, what you did, verified state, what is left."""


def start_job(kind, sess, title, prompt, conv=None, task=None, alarm=None, chat=None):
    jid = uuid.uuid4().hex[:12]
    j = {"id": jid, "kind": kind, "title": title, "user": sess["n"], "login": sess["u"], "status": "queued",
         "created": time.time(), "started": None, "finished": None, "task": task, "alarm": alarm, "conv": conv, "chat": chat,
         "prompt": prompt, "output": "", "error": "", "events": [], "run_id": None}
    with jobs_lock:
        JOBS[jid] = j
        save_jobs()
    threading.Thread(target=run_job, args=(jid,), daemon=True).start()
    return j


def _push_event(j, ev):
    with jobs_lock:
        j["events"].append(ev)
        if len(j["events"]) > 3000:
            del j["events"][:500]
        jobs_lock.notify_all()


def run_job(jid):
    j = JOBS[jid]
    if j["kind"] in ("task", "alarm"):  # one unattended run at a time, FIFO
        while True:
            with jobs_lock:
                ahead = [x for x in JOBS.values() if x["kind"] in ("task", "alarm") and x["created"] < j["created"] and x["status"] in ("queued", "running")]
                if not ahead:
                    break
                jobs_lock.wait(10)
    skey = f"icc-chat-{j['login']}-{j.get('chat') or j['conv']}" if j["kind"] == "chat" else f"icc-task-{jid}"
    try:
        r = hermes("POST", "/v1/runs", {"input": j["prompt"]}, headers={"X-Hermes-Session-Key": skey})
        j["run_id"], j["status"], j["started"] = r.get("run_id"), "running", time.time()
        if j["kind"] == "chat" and j.get("chat"):
            with chat_lock:
                c = load_chat(j["login"], j["chat"])
                if c:
                    for m in c["messages"]:
                        if m.get("job") == j["id"]:
                            m["status"] = "running"
                    save_chat(j["login"], c)
    except Exception as ex:
        j.update(status="failed", error=f"AI agent not reachable: {ex}", finished=time.time())
        _push_event(j, {"event": "run.failed", "error": j["error"]})
        _push_event(j, {"event": "job.finished", "status": "failed"})
        with jobs_lock:
            save_jobs()
        chat_finished(j)
        return
    with jobs_lock:
        save_jobs()
    if j["kind"] in ("task", "alarm"):
        notify(f"▶️ **{assistant_name()} started {'fixing an alarm' if j['kind'] == 'alarm' else 'a Planner task'}** (ICC, by {j['user']}): **{j['title']}**")
    last_id, status = None, None
    for attempt in range(30):  # reconnect the SSE stream until the run is terminal
        try:
            h = {"Authorization": f"Bearer {HERMES_KEY}", "Accept": "text/event-stream"}
            if last_id is not None:
                h["Last-Event-ID"] = str(last_id)
            req = urllib.request.Request(f"{HERMES}/v1/runs/{j['run_id']}/events", headers=h)
            with urllib.request.urlopen(req, timeout=600) as resp:
                data = []
                for raw in resp:
                    line = raw.decode("utf-8", "replace").rstrip("\r\n")
                    if line.startswith("id:"):
                        last_id = line[3:].strip()
                    elif line.startswith("data:"):
                        data.append(line[5:].lstrip())
                    elif line == "" and data:
                        try:
                            ev = json.loads("\n".join(data))
                        except ValueError:
                            ev = None
                        data = []
                        if not isinstance(ev, dict):
                            continue
                        name = ev.get("event", "")
                        if name == "message.delta":
                            j["output"] += ev.get("delta", "")
                        if name == "approval.request" and AUTO_APPROVE:  # AI-first: runs started from ICC have full access
                            ch = ev.get("choices") or ["once"]
                            choice = "session" if "session" in ch else "once"
                            try:
                                hermes("POST", f"/v1/runs/{j['run_id']}/approval", {"choice": choice, **({"request_id": ev["request_id"]} if ev.get("request_id") else {})})
                                ev = dict(ev, auto_approved=choice)
                            except Exception as ex:
                                log("approve failed", ex)
                        _push_event(j, {k: v for k, v in ev.items() if k in ("event", "delta", "tool", "preview", "duration", "error", "text", "command", "description", "auto_approved", "output", "timestamp", "seq")})
                        if name.startswith("run.") and name[4:] in TERMINAL:
                            status = name[4:]
                            if ev.get("output"):
                                j["output"] = ev["output"]
                            if ev.get("error"):
                                j["error"] = str(ev["error"])
                            break
            if status:
                break
        except Exception as ex:
            log("stream", jid, ex)
            time.sleep(3)
        try:
            st = hermes("GET", f"/v1/runs/{j['run_id']}")
            if st.get("status") in TERMINAL:
                status = st["status"]
                j["output"] = st.get("output") or j["output"]
                j["error"] = str(st.get("error") or "")
                break
        except Exception:
            pass
    j["status"], j["finished"] = status or "failed", time.time()
    chat_finished(j)
    _push_event(j, {"event": "job.finished", "status": j["status"]})
    with jobs_lock:
        save_jobs()
        jobs_lock.notify_all()
    if j["kind"] in ("task", "alarm"):
        icon = {"completed": "✅", "cancelled": "⏹️"}.get(j["status"], "❌")
        mins = int((j["finished"] - (j["started"] or j["finished"])) / 60)
        notify(f"{icon} **{'Alarm fix' if j['kind'] == 'alarm' else 'Planner task'} {j['status']}** ({mins} min): **{j['title']}**\n\n{(j['output'] or j['error'])[:1500]}"
               + (f"\n\n<{PUBLIC_URL}/#/{'alarms' if j['kind'] == 'alarm' else 'planner'}>" if PUBLIC_URL else ""))


def alarm_entry(kind, item_id):
    if kind not in ("node", "svc") or not item_id:
        return "—"
    for x in inventory().get("nodes" if kind == "node" else "services") or []:
        if x.get("id") == item_id:
            return json.dumps(x, ensure_ascii=False)[:800]
    return "—"


# ------------------------------------------------------------------ HTTP
class H(BaseHTTPRequestHandler):
    server_version = "icc-api"
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):  # noqa: A002
        if not self.path.startswith(("/papi/health", "/papi/auth", "/papi/sd/")):
            log(self.headers.get("X-Forwarded-For", self.client_address[0]), format % args)

    def ip(self):
        return (self.headers.get("X-Real-IP") or self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()

    def send(self, code, obj=None, headers=None):
        b = b"" if code in (204, 302) else json.dumps(obj if obj is not None else {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        for k, v in (headers or {}).items():
            for x in (v if isinstance(v, list) else [v]):
                self.send_header(k, x)
        self.end_headers()
        self.wfile.write(b)

    def redirect(self, url, cookie=None):
        return self.send(302, None, {"Location": url, **({"Set-Cookie": cookie} if cookie else {})})

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 65536:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def sess(self):
        s = unsign(cookies(self.headers.get("Cookie")).get(COOKIE))
        return s if s and "u" in s else None

    def need(self):
        s = self.sess()
        if not s:
            self.send(401, {"error": "Sign in first."})
            return None
        if self.command != "GET" and self.headers.get("X-ICC") != "1":
            self.send(403, {"error": "missing X-ICC header"})
            return None
        return s

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        qs = parse_qs(u.query)
        try:
            if p == "/papi/health":
                return self.send(200, {"ok": True, "version": VERSION})
            if p == "/papi/auth":  # nginx auth_request: the whole UI needs a session
                return self.send(204 if self.sess() else 401)
            if p == "/papi/sd/probes":  # only reachable through the internal listener (nginx :8081)
                with git_lock:
                    repo_sync()
                    return self.send(200, probes())
            if p == "/papi/auth/methods":
                inst = {}
                with git_lock:
                    try:
                        repo_sync()
                        inst = icc_cfg().get("instance") or {}
                    except Exception:
                        pass
                return self.send(200, {"password": any(x in PROVIDERS for x in ("local", "ldap")), "local": "local" in PROVIDERS,
                                       "ldap": LDAP_LABEL if "ldap" in PROVIDERS else None, "oidc": OIDC_LABEL if "oidc" in PROVIDERS else None,
                                       "name": inst.get("name") or "Infra Command Center", "version": VERSION})
            if p == "/papi/oidc/login":
                if "oidc" not in PROVIDERS:
                    return self.send(404, {"error": "OIDC is not enabled"})
                m = oidc_meta()
                st = {"s": secrets.token_urlsafe(24), "n": secrets.token_urlsafe(24), "v": secrets.token_urlsafe(48), "e": int(time.time()) + 600}
                q = urllib.parse.urlencode({"response_type": "code", "client_id": OIDC_CLIENT, "redirect_uri": redirect_uri(self), "scope": OIDC_SCOPES,
                                            "state": st["s"], "nonce": st["n"], "code_challenge_method": "S256",
                                            "code_challenge": b64url(hashlib.sha256(st["v"].encode()).digest())})
                ep = m["authorization_endpoint"]
                return self.redirect(ep + ("&" if "?" in ep else "?") + q, set_cookie("icc_o", sign(st), 600, "/papi/oidc/"))
            if p == "/papi/oidc/callback":
                st = unsign(cookies(self.headers.get("Cookie")).get("icc_o"))
                clear = set_cookie("icc_o", "", 0, "/papi/oidc/")
                if not st or (qs.get("state") or [""])[0] != st.get("s") or not qs.get("code"):
                    return self.redirect("/login.html?e=" + urllib.parse.quote("Sign-in expired, try again."), clear)
                try:
                    login, name = oidc_finish(self, qs["code"][0], st)
                except Exception as ex:
                    log("oidc failed", repr(ex))
                    audit("signin-failed", "?", ip=self.ip(), why=f"oidc: {ex}"[:120])
                    return self.redirect("/login.html?e=" + urllib.parse.quote(f"SSO sign-in failed: {ex}"[:200]), clear)
                audit("signin", login, name, self.ip(), "oidc")
                return self.redirect("/", [clear, set_cookie(COOKIE, make_session(login, name, "oidc"), SESSION_TTL)])
            if p == "/papi/me":
                s = self.sess()
                return self.send(200, {"user": s["u"], "name": s["n"], "via": s.get("v", ""), "expires": s["e"]} if s else {"user": None})
            s = self.sess()
            if not s:
                return self.send(401, {"error": "Sign in first."})
            m = re.fullmatch(r"/papi/icons/([A-Za-z0-9._-]{1,100})", p)
            if m and os.path.splitext(m.group(1))[1].lower() in ICON_TYPES:  # icons from the config repo (nginx falls back here)
                f = os.path.join(REPO_DIR, ICONS_DIR or rp("icons"), m.group(1))
                if not os.path.isfile(f):
                    return self.send(404, {"error": "no such icon"})
                data = open(f, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", ICON_TYPES[os.path.splitext(f)[1].lower()])
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "private, max-age=3600")
                self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
                self.end_headers()
                self.wfile.write(data)
                return
            if p == "/papi/inventory.json":
                with git_lock:
                    repo_sync()
                    return self.send(200, inventory())
            if p == "/papi/changelog":
                with git_lock:
                    repo_sync()
                    return self.send(200, {"entries": read_changelog()})
            if p == "/papi/todo":
                with git_lock:
                    repo_sync()
                    _, tasks, sections = read_todo()
                return self.send(200, {"tasks": tasks, "sections": sections})
            if p == "/papi/structure":
                with git_lock:
                    repo_sync()
                    st = load_yaml("structure.yaml")
                return self.send(200, {"structure": st, "path": rp("structure.yaml")})
            if p == "/papi/config":
                with git_lock:
                    repo_sync()
                    out = []
                    for name, path, desc in config_files():
                        isdir = os.path.isdir(os.path.join(REPO_DIR, path))
                        out.append({"name": name, "path": path, "desc": desc, "url": web_url(path, tree=isdir), "history": git_history(path, 1)})
                return self.send(200, {"files": out, "repo": git_web(), "remote": re.sub(r"//[^@/]+@", "//", REPO) if REPO else ""})
            if p == "/papi/history":
                path = (qs.get("path") or [""])[0]
                with git_lock:
                    repo_sync()
                    if path not in {c[1] for c in config_files()}:
                        return self.send(400, {"error": "unknown config path"})
                    return self.send(200, {"path": path, "history": git_history(path, 100)})
            if p == "/papi/activity":
                with git_lock:
                    repo_sync()
                    changes = git_activity()
                with jobs_lock:
                    runs = [{"type": "run", "t": j["created"], "id": j["id"], "kind": j["kind"], "subject": j.get("title") or "", "status": j.get("status"),
                             "finished": j.get("finished"), "name": j.get("user") or "", "login": j.get("login") or "", "via": "portal"}
                            for j in JOBS.values()]
                auth = [{"type": "auth", "t": a["t"], "ev": a["ev"], "name": a.get("name") or a["login"], "login": a["login"], "ip": a.get("ip", ""),
                         "why": a.get("why", ""), "via": "portal"} for a in read_audit()]
                return self.send(200, {"changes": changes, "runs": runs, "auth": auth, "repo": git_web(), "authSince": auth[0]["t"] if auth else None})
            if p == "/papi/prefs":
                with git_lock:
                    repo_sync()
                    return self.send(200, {"prefs": read_prefs(s["u"])})
            if p == "/papi/hermes/health":
                if not HERMES:
                    return self.send(200, {"ok": False, "error": "No AI agent configured (ICC_HERMES_URL)"})
                try:
                    req = urllib.request.Request(HERMES + "/health", headers={"Authorization": f"Bearer {HERMES_KEY}"})
                    with urllib.request.urlopen(req, timeout=4) as r:
                        return self.send(200, {"ok": r.status == 200})
                except Exception as ex:
                    return self.send(200, {"ok": False, "error": f"{type(ex).__name__}: {getattr(ex, 'reason', ex)}"})
            if p == "/papi/hermes/activity":
                with jobs_lock:
                    js = sorted(JOBS.values(), key=lambda x: x["created"], reverse=True)[:20]
                    return self.send(200, {"jobs": [public_job(x) for x in js]})
            m = re.fullmatch(r"/papi/hermes/jobs/([0-9a-f]{12})(/events)?", p)
            if m:
                j = JOBS.get(m.group(1))
                if not j:
                    return self.send(404, {"error": "unknown job"})
                if not m.group(2):
                    return self.send(200, public_job(j, full=True))
                return self.stream(j, int((qs.get("from") or ["0"])[0]))
            if p == "/papi/hermes/chats":
                with git_lock:
                    repo_sync()
                    fs = read_folders(s["u"])
                return self.send(200, {"folders": fs, "chats": list_chats(s["u"], (qs.get("q") or [""])[0])})
            m = re.fullmatch(r"/papi/hermes/chats/([a-z0-9]{8,16})", p)
            if m:
                with chat_lock:
                    c = load_chat(s["u"], m.group(1))
                    if not c:
                        return self.send(404, {"error": "unknown chat"})
                    if c.get("unread"):
                        c["unread"] = False
                        save_chat(s["u"], c)
                return self.send(200, c)
            return self.send(404, {"error": "not found"})
        except Exception as ex:
            log("GET error", p, repr(ex))
            return self.send(500, {"error": str(ex)[:300]})

    def stream(self, j, start):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        i = max(0, start)
        try:
            while True:
                with jobs_lock:
                    if i >= len(j["events"]) and j["status"] not in TERMINAL:
                        jobs_lock.wait(15)
                    evs = j["events"][i:]
                    done = j["status"] in TERMINAL and i + len(evs) >= len(j["events"])
                if evs:
                    for ev in evs:
                        i += 1
                        self.wfile.write(f"id: {i}\ndata: {json.dumps(ev)}\n\n".encode())
                else:
                    self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
                if done:
                    if not any(e.get("event") == "job.finished" for e in j["events"]):
                        self.wfile.write(f"id: {i + 1}\ndata: {json.dumps({'event': 'job.finished', 'status': j['status'], 'error': j.get('error', '')})}\n\n".encode())
                        self.wfile.flush()
                    return
        except (BrokenPipeError, ConnectionResetError):
            return

    def do_POST(self):
        p = urlparse(self.path).path
        try:
            if p == "/papi/login":
                if not any(x in PROVIDERS for x in ("local", "ldap")):
                    return self.send(404, {"error": "Password sign-in is disabled."})
                ip = self.ip()
                recent = [t for t in FAILS.get(ip, []) if t > time.time() - 300]
                FAILS[ip] = recent
                if len(recent) >= 5:
                    return self.send(429, {"error": "Too many failed sign-ins, wait 5 minutes."})
                b = self.body()
                user = str(b.get("user", "")).strip().split("\\")[-1].lower()
                if not re.fullmatch(r"[a-z0-9._@-]{1,64}", user):
                    return self.send(401, {"error": "Wrong username or password."})
                pw = str(b.get("password", ""))
                name, why, via = None, "unknown", ""
                if "local" in PROVIDERS:
                    name, why = local_login(user, pw)
                    via = "local"
                if not name and why == "unknown" and "ldap" in PROVIDERS:
                    user = user.split("@")[0] if LDAP_MODE == "ad" else user
                    name, why = ldap_login(user, pw)
                    via = "ldap"
                if not name:
                    FAILS[ip].append(time.time())
                    log("login failed", user, ip, why)
                    reason = why if why in ("not in group", "invalid", "unknown") else "directory unreachable"
                    audit("signin-failed", user, ip=ip, why=reason)
                    msg = "You are not in the group allowed to use ICC." if why == "not in group" else \
                          "Wrong username or password." if why in ("invalid", "unknown") else "The directory server is not reachable."
                    return self.send(401, {"error": msg})
                log("login ok", user, via, ip)
                audit("signin", user, name, ip, via)
                return self.send(200, {"user": user, "name": name}, {"Set-Cookie": set_cookie(COOKIE, make_session(user, name, via), SESSION_TTL)})
            if p == "/papi/logout":
                so = self.sess()
                if so:
                    audit("signout", so["u"], so["n"], self.ip())
                return self.send(200, {}, {"Set-Cookie": set_cookie(COOKIE, "", 0)})
            s = self.need()
            if not s:
                return
            b = self.body()
            if p == "/papi/todo":
                return self.send(200, {"tasks": edit_todo(s, "create", b)})
            if p == "/papi/prefs":
                return self.send(200, {"prefs": save_prefs(s, b)})
            m = re.fullmatch(r"/papi/todo/(\d+)(/execute)?", p)
            if m and not m.group(2):
                return self.send(200, {"tasks": edit_todo(s, "update", dict(b, i=int(m.group(1))))})
            if m:
                with git_lock:
                    repo_sync(force=True)
                    _, tasks, _ = read_todo()
                    ctx = repo_context(s["n"], s["u"])
                i = int(m.group(1))
                t = tasks[i] if i < len(tasks) else None
                if not t or t["title"] != b.get("expectTitle"):
                    return self.send(409, {"error": "The task changed in Git meanwhile — reload the Planner."})
                prompt = TASK_PROMPT.format(agent=assistant_name(), name=s["n"], user=s["u"], context=ctx,
                                            **{k: (t.get(k) or "—") for k in ("section", "prio", "status", "due", "owner", "title", "details")})
                j = start_job("task", s, t["title"], prompt, task={"i": i, "title": t["title"], "section": t["section"]})
                return self.send(202, public_job(j))
            m = re.fullmatch(r"/papi/hermes/jobs/([0-9a-f]{12})/stop", p)
            if m:
                j = JOBS.get(m.group(1))
                if not j or not j.get("run_id"):
                    return self.send(404, {"error": "unknown or not started"})
                hermes("POST", f"/v1/runs/{j['run_id']}/stop", {})
                return self.send(200, {"ok": True})
            if p == "/papi/hermes/chats":
                fid = str(b.get("folder") or "") or None
                c = {"id": secrets.token_hex(6), "title": clean(b.get("title"), 120) or "New chat", "folder": fid, "pinned": False,
                     "archived": False, "created": time.time(), "updated": time.time(), "unread": False, "messages": []}
                with chat_lock:
                    save_chat(s["u"], c)
                return self.send(200, c)
            m = re.fullmatch(r"/papi/hermes/chats/([a-z0-9]{8,16})(/messages)?", p)
            if m:
                with chat_lock:
                    c = load_chat(s["u"], m.group(1))
                    if not c:
                        return self.send(404, {"error": "unknown chat"})
                    if not m.group(2):
                        if "title" in b:
                            c["title"] = clean(b["title"], 120) or c["title"]
                        if "folder" in b:
                            c["folder"] = str(b["folder"] or "") or None
                        for k in ("pinned", "archived"):
                            if k in b:
                                c[k] = bool(b[k])
                        save_chat(s["u"], c)
                        return self.send(200, chat_meta(c))
                    msg = str(b.get("message", "")).strip()[:12000]
                    if not msg:
                        return self.send(400, {"error": "empty message"})
                    last = c["messages"][-1] if c["messages"] else None
                    if last and last.get("role") == "assistant" and last.get("status") in ("queued", "running"):
                        return self.send(409, {"error": f"{assistant_name()} is still answering in this chat."})
                with git_lock:
                    repo_sync()
                    fpath, ins = folder_instructions(s["u"], c.get("folder")) if c.get("folder") else ("", "")
                    ctx = repo_context(s["n"], s["u"])
                head = f"[ICC chat - {s['n']} ({s['u']}) - chat \"{c['title']}\"" + (f" - folder {fpath}" if fpath else "") + f". {ctx}]"
                if ins:
                    head += f"\n[Folder instructions - follow them in this chat]\n{ins}"
                title = c["title"] if c["messages"] or c["title"] != "New chat" else clean(msg, 70)
                j = start_job("chat", s, title[:80], head + "\n\n" + msg, conv=c["id"], chat=c["id"])
                with chat_lock:
                    c = load_chat(s["u"], m.group(1))
                    c["title"] = title
                    c["messages"] += [{"role": "user", "text": msg, "ts": time.time()},
                                      {"role": "assistant", "text": "", "ts": time.time(), "job": j["id"], "status": j["status"]}]
                    if j["status"] in TERMINAL:
                        c["messages"][-1].update(text="", error=j.get("error", ""))
                    c["updated"] = time.time()
                    save_chat(s["u"], c)
                return self.send(202, {"job": public_job(j), "chat": c})
            if p == "/papi/hermes/folders":
                with git_lock:
                    repo_sync()
                    fs = read_folders(s["u"])
                op = b.get("op")
                if op == "create":
                    fs.append({"id": secrets.token_hex(6), "name": clean(b.get("name"), 80) or "New folder", **({"parent": b["parent"]} if b.get("parent") else {})})
                    what = f"add {fs[-1]['name']}"
                else:
                    f = next((x for x in fs if x["id"] == b.get("id")), None)
                    if not f:
                        return self.send(404, {"error": "unknown folder"})
                    if op == "update":
                        if "name" in b:
                            f["name"] = clean(b["name"], 80) or f["name"]
                        if "instructions" in b:
                            f["instructions"] = str(b["instructions"] or "")
                        if "parent" in b:
                            if b["parent"]:
                                f["parent"] = str(b["parent"])
                            else:
                                f.pop("parent", None)
                        what = f"edit {f['name']}"
                    elif op == "delete":
                        for x in fs:
                            if x.get("parent") == f["id"]:
                                if f.get("parent"):
                                    x["parent"] = f["parent"]
                                else:
                                    x.pop("parent", None)
                        fs = [x for x in fs if x["id"] != f["id"]]
                        with chat_lock:
                            for meta in list_chats(s["u"]):
                                if meta.get("folder") == f["id"]:
                                    c = load_chat(s["u"], meta["id"])
                                    c["folder"] = f.get("parent")
                                    save_chat(s["u"], c)
                        what = f"delete {f['name']}"
                    else:
                        return self.send(400, {"error": "op"})
                return self.send(200, {"folders": save_folders(s, fs, what)})
            if p == "/papi/alarm/fix":
                a = {k: clean(b.get(k), 300) for k in ("key", "title", "why", "site", "kind", "id")}
                lv = str(b.get("level") or "0")
                a["level"] = min(int(lv), 3) if lv.isdigit() else 0
                if not a["key"] or not a["title"]:
                    return self.send(400, {"error": "invalid alarm"})
                with jobs_lock:
                    dup = next((x for x in JOBS.values() if x["kind"] == "alarm" and (x.get("alarm") or {}).get("key") == a["key"] and x["status"] in ("queued", "running")), None)
                if dup:
                    return self.send(200, public_job(dup))
                with git_lock:
                    repo_sync()
                    entry = alarm_entry(a["kind"], a["id"])
                    ctx = repo_context(s["n"], s["u"])
                levels = ["0 no warning", "1 be aware", "2 be prepared", "3 take action"]
                prompt = ALARM_PROMPT.format(agent=assistant_name(), name=s["n"], user=s["u"], title=a["title"], level=levels[a["level"]], site=a["site"] or "—",
                                             kind=a["kind"] or "other", why=a["why"] or "—", entry=entry, context=ctx)
                j = start_job("alarm", s, f"Alarm: {a['title']}", prompt, alarm=a)
                return self.send(202, public_job(j))
            return self.send(404, {"error": "not found"})
        except LookupError as ex:
            return self.send(409, {"error": str(ex)})
        except ValueError as ex:
            return self.send(400, {"error": f"invalid {ex}"})
        except Exception as ex:
            log("POST error", p, repr(ex))
            return self.send(500, {"error": str(ex)[:300]})

    def do_DELETE(self):
        p = urlparse(self.path).path
        try:
            s = self.need()
            if not s:
                return
            mc = re.fullmatch(r"/papi/hermes/chats/([a-z0-9]{8,16})", p)
            if mc:
                with chat_lock:
                    f = os.path.join(_udir(s["u"]), mc.group(1) + ".json")
                    if os.path.exists(f):
                        os.remove(f)
                return self.send(200, {"ok": True})
            m = re.fullmatch(r"/papi/todo/(\d+)", p)
            if not m:
                return self.send(404, {"error": "not found"})
            b = self.body()
            return self.send(200, {"tasks": edit_todo(s, "delete", dict(b, i=int(m.group(1))))})
        except LookupError as ex:
            return self.send(409, {"error": str(ex)})
        except Exception as ex:
            log("DELETE error", p, repr(ex))
            return self.send(500, {"error": str(ex)[:300]})


def main():
    global SESSION_SECRET
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(CHAT_ROOT, exist_ok=True)
    if not SESSION_SECRET:  # persist a generated secret so sessions survive restarts
        sf = os.path.join(DATA, ".session_secret")
        if not os.path.exists(sf):
            with open(sf, "w") as f:
                f.write(secrets.token_hex(32))
            os.chmod(sf, 0o600)
        SESSION_SECRET = open(sf).read().strip().encode()
    if E("ICC_ADMIN_PASSWORD") and not E("ICC_ADMIN_PASSWORD_HASH"):
        _BOOT_HASH.append(hash_password(E("ICC_ADMIN_PASSWORD"), 100000))
    key = E("ICC_GIT_SSH_KEY", "")
    if key:
        with open(KEY_FILE, "w") as f:
            f.write(key.replace("\\n", "\n").strip() + "\n")  # .env files often carry the key on one line with \n
        os.chmod(KEY_FILE, 0o600)
    kh = E("ICC_GIT_KNOWN_HOSTS", "")
    if kh:
        with open(KNOWN_HOSTS, "w") as f:
            f.write(kh.strip() + "\n")
    if "ldap" in PROVIDERS:
        try:
            import ldap3  # noqa: F401
        except ImportError:
            log("WARNING: ldap provider enabled but ldap3 is not installed")
    if os.path.exists(JOBS_FILE):
        try:
            for k, v in json.load(open(JOBS_FILE)).items():
                v["events"] = []
                if v.get("status") not in TERMINAL:
                    v["status"], v["error"] = "interrupted", "ICC restarted"
                JOBS[k] = v
        except Exception as ex:
            log("jobs.json unreadable", ex)
    try:
        with git_lock:
            repo_sync(force=True)
            log("config repo ready:", REPO or "(local)", BRANCH, CPATH or "/", "·", len(read_todo()[1]), "tasks,", len(inventory()["nodes"]), "nodes")
    except Exception as ex:
        log("config repo init failed (will retry on request):", ex)
    log(f"ICC {VERSION} · auth: {','.join(PROVIDERS)} · agent: {HERMES or 'none'} · metrics: {METRICS_URL or 'none'}")
    if "local" in PROVIDERS and not local_users():
        log("WARNING: local sign-in is enabled but there are no users (set ICC_ADMIN_USER + ICC_ADMIN_PASSWORD or mount ICC_USERS_FILE)")
    srv = ThreadingHTTPServer((E("ICC_API_BIND", "127.0.0.1"), PORT), H)
    srv.daemon_threads = True
    log("icc-api listening on", PORT)
    srv.serve_forever()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "hash-password":
        pw = sys.stdin.readline().rstrip("\n") if not sys.stdin.isatty() else getpass.getpass("Password: ")
        print(hash_password(pw))
    else:
        main()
