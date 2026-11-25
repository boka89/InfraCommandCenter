#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Minimal mock OpenID Connect provider for testing ICC's SSO flow (NOT for production).

  python3 tests/mock_oidc.py 18999   -> issuer http://127.0.0.1:18999
Every /authorize request is approved immediately for user "jdoe" (groups: icc-admins).
"""
import base64, json, sys, time, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18999
ISS = f"http://127.0.0.1:{PORT}"
CODES = {}


def b64(o):
    return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()


class H(BaseHTTPRequestHandler):
    def j(self, o, code=200):
        b = json.dumps(o).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.path == "/.well-known/openid-configuration":
            return self.j({"issuer": ISS, "authorization_endpoint": ISS + "/authorize", "token_endpoint": ISS + "/token", "userinfo_endpoint": ISS + "/userinfo"})
        if u.path == "/authorize":
            code = f"c{len(CODES)}"
            CODES[code] = {"nonce": q.get("nonce"), "client": q.get("client_id"), "challenge": q.get("code_challenge")}
            self.send_response(302)
            self.send_header("Location", q["redirect_uri"] + "?" + urllib.parse.urlencode({"code": code, "state": q.get("state", "")}))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if u.path == "/userinfo":
            return self.j({"sub": "u-1", "name": "Jane Doe", "preferred_username": "jdoe", "groups": ["icc-admins"]})
        self.j({"error": "not found"}, 404)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        f = dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))
        c = CODES.pop(f.get("code"), None)
        if not c or not f.get("code_verifier"):
            return self.j({"error": "invalid_grant"}, 400)
        idt = "x." + b64({"iss": ISS, "aud": c["client"], "sub": "u-1", "exp": time.time() + 300, "nonce": c["nonce"]}) + ".sig"
        self.j({"access_token": "at", "id_token": idt, "token_type": "Bearer"})


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
