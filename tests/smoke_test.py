#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""API smoke test: starts icc_api.py (local config repo seeded from example/config) and a mock OIDC
provider, then exercises sign-in (local + OIDC), inventory, probes, planner edits, settings, chat
folders, config history and activity. Needs PyYAML. Exit code 0 = all good.

    python3 tests/smoke_test.py
"""
import http.cookiejar, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_PORT, OIDC_PORT = 18190, 18999
B = f"http://127.0.0.1:{API_PORT}"
FAILS = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  ({info})" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def opener(jar, follow=True):
    hs = [urllib.request.HTTPCookieProcessor(jar)] + ([] if follow else [NoRedirect()])
    return urllib.request.build_opener(*hs)


def call(op, method, path, body=None, icc=True):
    h = {"Content-Type": "application/json"}
    if icc:
        h["X-ICC"] = "1"
    req = urllib.request.Request(B + path if path.startswith("/") else path, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with op.open(req, timeout=20) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw and r.headers.get("Content-Type", "").startswith("application/json") else raw), r.headers
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw), e.headers
        except ValueError:
            return e.code, raw, e.headers


def main():
    data = tempfile.mkdtemp(prefix="icc-smoke-")
    env = dict(os.environ, ICC_DATA_DIR=data, ICC_SEED_DIR=os.path.join(ROOT, "example", "config"), ICC_API_PORT=str(API_PORT),
               ICC_COOKIE_SECURE="false", ICC_ADMIN_USER="admin", ICC_ADMIN_PASSWORD="smoke-test-pw", ICC_AUTH_PROVIDERS="local,oidc",
               ICC_OIDC_ISSUER=f"http://127.0.0.1:{OIDC_PORT}", ICC_OIDC_CLIENT_ID="icc", ICC_OIDC_CLIENT_SECRET="s",
               ICC_OIDC_ALLOWED_GROUPS="icc-admins", ICC_PUBLIC_URL=B)
    procs = [subprocess.Popen([sys.executable, os.path.join(ROOT, "tests", "mock_oidc.py"), str(OIDC_PORT)]),
             subprocess.Popen([sys.executable, os.path.join(ROOT, "app", "api", "icc_api.py")], env=env)]
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(B + "/papi/health", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        anon = opener(http.cookiejar.CookieJar())
        st, d, _ = call(anon, "GET", "/papi/auth/methods")
        check("auth methods", st == 200 and d["local"] and d["oidc"] and d["name"] == "ACME Ltd", d)
        check("inventory needs a session", call(anon, "GET", "/papi/inventory.json")[0] == 401)
        st, d, _ = call(anon, "POST", "/papi/login", {"user": "admin", "password": "nope"})
        check("wrong password rejected", st == 401)
        jar = http.cookiejar.CookieJar()
        op = opener(jar)
        st, d, _ = call(op, "POST", "/papi/login", {"user": "admin", "password": "smoke-test-pw"})
        check("local sign-in", st == 200 and d["user"] == "admin", d)
        st, inv, _ = call(op, "GET", "/papi/inventory.json")
        check("inventory", st == 200 and len(inv["nodes"]) == 15 and len(inv["services"]) == 8 and inv["icc"]["instance"]["name"] == "ACME Ltd")
        st, d, _ = call(op, "GET", "/papi/sd/probes")
        check("probe targets", st == 200 and {x["labels"]["probe_id"] for x in d} == {"config-repo", "website", "wiki"}, d)
        st, d, _ = call(op, "GET", "/papi/changelog")
        check("changelog parsed", st == 200 and len(d["entries"]) == 1 and d["entries"][0]["href"], d)
        st, d, _ = call(op, "GET", "/papi/todo")
        check("planner parsed", st == 200 and len(d["tasks"]) == 6 and d["sections"] == ["HQ", "Branch", "Monitoring"], d.get("sections"))
        check("write needs X-ICC", call(op, "POST", "/papi/todo", {"section": "HQ", "title": "x"}, icc=False)[0] == 403)
        st, d, _ = call(op, "POST", "/papi/todo", {"section": "Network", "title": "Smoke task", "prio": "P1", "owner": "Ops"})
        t = [x for x in d.get("tasks", []) if x["title"] == "Smoke task"]
        check("planner add", st == 200 and t and t[0]["owner"] == "Ops", d)
        st, d, _ = call(op, "POST", f"/papi/todo/{t[0]['i']}", {"expectTitle": "Smoke task", "status": "done"})
        check("planner done", st == 200 and [x for x in d["tasks"] if x["title"] == "Smoke task"][0]["status"] == "done", d)
        st, d, _ = call(op, "DELETE", f"/papi/todo/{t[0]['i']}", {"expectTitle": "Smoke task"})
        check("planner delete", st == 200 and not [x for x in d["tasks"] if x["title"] == "Smoke task"], d)
        st, d, _ = call(op, "POST", "/papi/prefs", {"theme": "light", "tz": "Europe/Vienna"})
        check("settings saved", st == 200 and d["prefs"]["tz"] == "Europe/Vienna", d)
        st, d, _ = call(op, "POST", "/papi/hermes/folders", {"op": "create", "name": "Branch"})
        check("chat folder", st == 200 and d["folders"][0]["name"] == "Branch", d)
        st, d, _ = call(op, "GET", "/papi/config")
        check("config files + history", st == 200 and any(f["path"] == "planner.md" and f["history"] for f in d["files"]), d)
        st, d, _ = call(op, "GET", "/papi/activity")
        subj = [c["subject"] for c in d.get("changes", [])]
        check("activity attribution", st == 200 and any(s.startswith("planner: remove") for s in subj) and all(c["via"] in ("portal", "git") for c in d["changes"]), subj)
        log = subprocess.run(["git", "-C", os.path.join(data, "repo"), "log", "--format=%an|%s"], capture_output=True, text=True).stdout
        check("commits authored as '<name> via ICC'", "Administrator via ICC|planner: add" in log, log)
        check("missing repo icon -> 404", call(op, "GET", "/papi/icons/nope.svg")[0] == 404)
        check("icon path traversal refused", call(op, "GET", "/papi/icons/..%2Ficc.yaml")[0] == 404)
        st, d, _ = call(op, "GET", "/papi/docs/nav")
        check("docs nav (nav.yml)", st == 200 and d["nav"][0]["path"] == "index.md" and d["pages"] == 5, d)
        st, d, _ = call(op, "GET", "/papi/docs/page?path=network.md")
        check("docs page: mermaid + tabs", st == 200 and d["mermaid"] and "tabbed-set" in d["html"] and d["toc"], str(d)[:200])
        st, d, _ = call(op, "GET", "/papi/docs/page?path=index.md")
        check("docs: relative links -> ICC routes, icons inlined", st == 200 and "#/docs?p=network.md" in d["html"] and "<svg" in d["html"], str(d)[:300])
        st, d, _ = call(op, "GET", "/papi/docs/search?q=restore%20backup")
        check("docs search", st == 200 and d["hits"] and d["hits"][0]["path"] == "runbooks/restore-vm.md", d)
        check("docs asset traversal refused", call(op, "GET", "/papi/docs/asset/..%2Ficc.yaml")[0] == 404)
        st, d, _ = call(op, "GET", "/papi/docs/raw?path=runbooks/wifi-password.md")
        st2, d2, _ = call(op, "POST", "/papi/docs/page", {"path": "runbooks/wifi-password.md", "text": d["text"] + "\n4. Done.\n", "sha": d["sha"]})
        check("docs edit commits", st2 == 200 and d2.get("commit"), d2)
        st3, d3, _ = call(op, "POST", "/papi/docs/page", {"path": "runbooks/wifi-password.md", "text": "stale", "sha": d["sha"]})
        check("docs stale edit refused", st3 == 409, d3)
        st4, d4, _ = call(op, "POST", "/papi/docs/page", {"path": "runbooks/new-page.md", "text": "# New\n", "sha": ""})
        check("docs new page", st4 == 200 and call(op, "GET", "/papi/docs/page?path=runbooks/new-page.md")[1].get("title") == "New", d4)
        st5, _, _ = call(op, "POST", "/papi/docs/page", {"path": "../icc.yaml", "text": "x", "sha": ""})
        check("docs path outside refused", st5 == 400)
        st, d, _ = call(op, "GET", "/papi/hermes/health")
        check("no agent -> health false", st == 200 and d["ok"] is False)
        # OIDC: /papi/oidc/login -> mock /authorize -> /papi/oidc/callback -> session cookie
        ojar = http.cookiejar.CookieJar()
        nr = opener(ojar, follow=False)
        st, _, h = call(nr, "GET", "/papi/oidc/login")
        check("oidc redirect", st == 302 and "code_challenge=" in h["Location"], st)
        st, _, h = call(nr, "GET", h["Location"])
        check("mock idp approves", st == 302 and "/papi/oidc/callback" in h["Location"], st)
        st, _, h = call(nr, "GET", h["Location"])
        check("oidc callback signs in", st == 302 and h["Location"] == "/", h.get("Location"))
        st, d, _ = call(nr, "GET", "/papi/me")
        check("oidc session", st == 200 and d.get("user") == "jdoe" and d.get("via") == "oidc", d)
    finally:
        for p in procs:
            p.terminate()
    print(f"\n{len(FAILS)} failure(s)" if FAILS else "\nall checks passed")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
