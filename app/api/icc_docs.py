# SPDX-License-Identifier: Apache-2.0
"""ICC integrated docs: Markdown pages in the config repository, rendered server-side.

Layout (default <config path>/docs, override ICC_DOCS_DIR):
  nav.yml                    optional MkDocs-style nav (list of "Title: page.md" / sections)
  **/*.md                    pages (front matter `title:` optional)
  assets/icons/<set>-<name>.svg  icons for :set-name: shortcodes (e.g. :material-server:)
  assets/...                 images and other files linked from pages

Supported Markdown: tables, admonitions (!!! note), details (??? note), tabs (=== "Tab"), task lists,
footnotes, definition lists, attribute lists, Markdown inside HTML blocks, code fences with
highlight-free <pre>, ```mermaid diagrams (rendered in the browser), table of contents.
Links: relative .md links become ICC routes (#/docs?p=<path>&a=<anchor>), relative files become asset URLs.
"""
import html
import os
import re
import threading
import urllib.parse
import xml.etree.ElementTree as ET

import yaml

try:
    import markdown
    from markdown.extensions.toc import slugify_unicode
except ImportError:  # docs are optional
    markdown = None

_cache = {}
_lock = threading.Lock()
ASSET_TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
               ".webp": "image/webp", ".pdf": "application/pdf", ".css": "text/css", ".txt": "text/plain", ".ico": "image/x-icon"}


class Docs:
    def __init__(self, repo_dir, rel_dir):
        self.repo_dir = repo_dir
        self.rel = rel_dir.strip("/")

    # ------------------------------------------------------------ paths
    @property
    def root(self):
        return os.path.join(self.repo_dir, self.rel)

    def enabled(self):
        return markdown is not None and os.path.isdir(self.root)

    def safe(self, rel):
        """normalised path inside the docs dir, or None"""
        rel = (rel or "").replace("\\", "/").lstrip("/")
        p = os.path.normpath(os.path.join(self.root, rel))
        return p if p == self.root or p.startswith(self.root + os.sep) else None

    def resolve(self, ref):
        """'platform/compute/' | 'platform/compute.md' | 'sites/' | '' -> 'platform/compute.md' (or None)"""
        ref = (ref or "").split("#")[0].split("?")[0].strip("/")
        cands = [ref] if ref.endswith(".md") else [f"{ref}.md", f"{ref}/index.md", f"{ref}/README.md"] if ref else ["index.md", "README.md"]
        for c in cands:
            p = self.safe(c)
            if p and os.path.isfile(p):
                return os.path.relpath(p, self.root).replace(os.sep, "/")
        return None

    # ------------------------------------------------------------ pages
    def pages(self):
        out = []
        for d, dirs, files in os.walk(self.root):
            dirs[:] = sorted(x for x in dirs if not x.startswith("."))
            for f in sorted(files):
                if f.endswith(".md"):
                    out.append(os.path.relpath(os.path.join(d, f), self.root).replace(os.sep, "/"))
        return out

    @staticmethod
    def split_front(text):
        meta = {}
        if text.startswith("---\n"):
            end = text.find("\n---", 4)
            if end > 0:
                try:
                    meta = yaml.safe_load(text[4:end]) or {}
                except yaml.YAMLError:
                    meta = {}
                text = text[end + 4:].lstrip("\n")
        return (meta if isinstance(meta, dict) else {}), text

    def raw(self, rel):
        with open(self.safe(rel), encoding="utf-8") as f:
            return self.split_front(f.read())

    def title_of(self, rel, meta=None, text=None):
        if meta is None:
            meta, text = self.raw(rel)
        if meta.get("title"):
            return str(meta["title"])
        m = re.search(r"^#\s+(.+?)\s*#*\s*$", text or "", re.M)
        if m:
            return re.sub(r"[*_`]", "", m.group(1)).strip()
        base = os.path.splitext(os.path.basename(rel))[0]
        if base in ("index", "README"):
            base = os.path.basename(os.path.dirname(rel)) or "Home"
        return base.replace("-", " ").replace("_", " ").capitalize()

    # ------------------------------------------------------------ nav
    def nav(self):
        navf = next((self.safe(n) for n in ("nav.yml", "nav.yaml") if os.path.isfile(self.safe(n) or "")), None)
        if navf:
            try:
                return self._nav_items(yaml.safe_load(open(navf, encoding="utf-8")) or [])
            except yaml.YAMLError:
                pass
        return self._dir_nav("")

    def _nav_items(self, items):
        out = []
        for it in items if isinstance(items, list) else []:
            if isinstance(it, str):
                r = self.resolve(it)
                if r:
                    out.append({"title": self.title_of(r), "path": r})
            elif isinstance(it, dict):
                for title, v in it.items():
                    if isinstance(v, str):
                        if re.match(r"^[a-z]+://", v):
                            out.append({"title": str(title), "url": v})
                        else:
                            r = self.resolve(v)
                            if r:
                                out.append({"title": str(title), "path": r})
                    else:
                        kids = self._nav_items(v)
                        idx = next((k for k in kids if k.get("path", "").endswith("index.md") and k["title"] == self.title_of(k["path"])), None)
                        out.append({"title": str(title), "path": idx["path"] if idx else None, "children": [k for k in kids if k is not idx]})
        return out

    def _dir_nav(self, rel):
        base = self.safe(rel)
        out, sub = [], []
        for name in sorted(os.listdir(base)):
            p = os.path.join(base, name)
            r = f"{rel}/{name}".lstrip("/")
            if name.startswith(".") or name == "assets":
                continue
            if os.path.isdir(p):
                kids = self._dir_nav(r)
                if kids:
                    idx = self.resolve(r)
                    sub.append({"title": self.title_of(idx) if idx else name.capitalize(), "path": idx, "children": [k for k in kids if k.get("path") != idx]})
            elif name.endswith(".md") and name not in ("index.md", "README.md") or (name in ("index.md", "README.md") and not rel):
                out.append({"title": self.title_of(r), "path": r})
        return out + sub

    # ------------------------------------------------------------ rendering
    def _icon(self, index, shortname, alias, uc, alt, title, category, options, md):
        name = shortname.strip(":")
        p = self.safe(f"assets/icons/{name}.svg")
        if p and os.path.isfile(p):
            svg = open(p, encoding="utf-8").read()
            svg = re.sub(r"<\?xml[^>]*>|<!--.*?-->", "", svg, flags=re.S).strip()
            if svg.startswith("<svg") and "<script" not in svg.lower():
                el = ET.Element("span")
                el.set("class", "dicon")
                el.text = md.htmlStash.store(svg)
                return el
        el = ET.Element("span")
        el.set("class", "dicon missing")
        el.set("title", name)
        return el

    def render(self, rel, head):
        key = (rel, head)
        with _lock:
            if key in _cache:
                return _cache[key]
        meta, text = self.raw(rel)
        exts = ["abbr", "admonition", "attr_list", "def_list", "footnotes", "md_in_html", "tables", "toc",
                "pymdownx.details", "pymdownx.superfences", "pymdownx.tabbed", "pymdownx.tasklist", "pymdownx.emoji", "pymdownx.inlinehilite"]
        cfg = {
            "toc": {"permalink": "", "slugify": slugify_unicode, "toc_depth": "2-4"},
            "pymdownx.tabbed": {"alternate_style": True},
            "pymdownx.tasklist": {"custom_checkbox": True},
            "pymdownx.emoji": {"emoji_generator": self._icon, "emoji_index": _icon_index},
            "pymdownx.superfences": {"custom_fences": [{"name": "mermaid", "class": "mermaid", "format": _fence_mermaid}]},
        }
        md = markdown.Markdown(extensions=exts, extension_configs=cfg)
        body = md.convert(text)
        body = self._rewrite_links(body, rel)
        toc = [{"id": t["id"], "name": html.unescape(t["name"]), "level": t["level"],
                "children": [{"id": c["id"], "name": html.unescape(c["name"]), "level": c["level"]} for c in t.get("children", [])]}
               for t0 in md.toc_tokens for t in ([t0] if t0["level"] > 1 else t0.get("children", []))]
        page = {"path": rel, "title": self.title_of(rel, meta, text), "html": body, "toc": toc,
                "hide": meta.get("hide") or [], "mermaid": 'class="mermaid"' in body}
        with _lock:
            if len(_cache) > 400:
                _cache.clear()
            _cache[key] = page
        return page

    def _rewrite_links(self, body, rel):
        here = os.path.dirname(rel)

        def link(page, frag=""):
            q = urllib.parse.urlencode({"p": page, **({"a": frag} if frag else {})}, safe="/")
            return f"#/docs?{q}"

        def fix(m):
            attr, url = m.group(1), html.unescape(m.group(2))
            if attr == "href" and url.startswith("#") and not url.startswith("#/"):
                return f'href="{html.escape(link(rel, url[1:]), quote=True)}"'
            if re.match(r"^([a-z][a-z0-9+.-]*:|#|/)", url, re.I):
                return m.group(0)
            path, _, frag = url.partition("#")
            target = os.path.normpath(os.path.join(here, path)).replace(os.sep, "/") if path else rel
            if target.startswith(".."):
                return m.group(0)
            doc = self.resolve(target) if (path.endswith(".md") or path.endswith("/") or not os.path.splitext(path)[1]) else None
            if doc:
                new = link(doc, frag)
            elif not path and frag:
                new = link(rel, frag)
            else:
                new = f"/papi/docs/asset/{target}"
            return f'{attr}="{html.escape(new, quote=True)}"'
        return re.sub(r'\b(href|src)="([^"]*)"', fix, body)

    # ------------------------------------------------------------ search
    def index(self, head):
        key = ("__index__", head)
        with _lock:
            if key in _cache:
                return _cache[key]
        docs = []
        for rel in self.pages():
            try:
                meta, text = self.raw(rel)
            except (OSError, UnicodeDecodeError):
                continue
            title = self.title_of(rel, meta, text)
            sec, anchor, buf = title, "", []
            def flush():
                t = re.sub(r"<[^>]+>|[`*_>|#]|:[a-z]+-[a-z0-9-]+:|\[([^\]]*)\]\([^)]*\)", lambda mm: mm.group(1) or " ", " ".join(buf))
                docs.append({"path": rel, "page": title, "section": sec, "anchor": anchor, "text": re.sub(r"\s+", " ", t).strip()})
            for line in text.split("\n"):
                hm = re.match(r"^(#{1,4})\s+(.+?)\s*#*\s*$", line)
                if hm:
                    flush()
                    sec = re.sub(r"[*_`]", "", hm.group(2)).strip()
                    anchor = slugify_unicode(re.sub(r"\{[^}]*\}\s*$", "", sec), "-") if len(hm.group(1)) > 1 else ""
                    buf = []
                elif not re.fullmatch(r"\s*\|?[\s:|-]*-{3,}[\s:|-]*", line):  # skip table separator rows
                    buf.append(line)
            flush()
        with _lock:
            _cache[key] = docs
        return docs

    def search(self, q, head, limit=30):
        words = [w for w in re.findall(r"\w[\w.-]*", (q or "").lower()) if len(w) > 1]
        if not words:
            return []
        hits = []
        for d in self.index(head):
            t, s, pg = d["text"].lower(), d["section"].lower(), d["page"].lower()
            if not all(w in t or w in s or w in pg for w in words):
                continue
            score = sum(3 * (w in s) + 2 * (w in pg) + min(t.count(w), 5) for w in words)
            i = max(0, min((t.find(w) for w in words if w in t), default=0) - 70)
            hits.append({"path": d["path"], "page": d["page"], "section": d["section"], "anchor": d["anchor"], "score": score,
                         "snippet": ("…" if i else "") + d["text"][i:i + 220] + ("…" if len(d["text"]) > i + 220 else "")})
        return sorted(hits, key=lambda h: -h["score"])[:limit]


def _fence_mermaid(source, language, class_name, options, md, **kwargs):
    return f'<pre class="mermaid">{html.escape(source)}</pre>'


def _icon_index(options, md):
    """accept any :set-name: shortcode (resolved against docs/assets/icons/ by the generator)"""
    class AnyIndex(dict):
        def __contains__(self, k):
            return bool(re.fullmatch(r":[a-z0-9]+(-[a-z0-9]+)+:", k))

        def __getitem__(self, k):
            return {"name": k.strip(":"), "category": "icons"}

        def get(self, k, default=None):
            return self[k] if k in self else default
    return {"name": "icc", "emoji": AnyIndex(), "aliases": {}}
