"""Server-side rendered HTML for every page of a Lineum site.

Each page is complete, readable HTML before any script runs: titles, descriptions, columns,
upstream and downstream links, SQL. Search engines and people without JavaScript get the real
content; the browser app then mounts over it and adds the interactive views.
"""

from __future__ import annotations

import json
from html import escape
from typing import Any

from lineum import __version__
from lineum.markdown import plain
from lineum.model import Node, Project

TYPE_LABELS = {
    "model": "Model", "source": "Source", "seed": "Seed", "snapshot": "Snapshot", "analysis": "Analysis",
    "exposure": "Exposure", "metric": "Metric", "semantic_model": "Semantic model",
    "saved_query": "Saved query", "function": "Function",
}

APP_PAGES = {
    "index.html": ("overview", "Overview"),
    "lineage.html": ("lineage", "Lineage explorer"),
    "health.html": ("health", "Project health"),
    "analyze.html": ("analyze", "Analyze with SQL"),
}


class Site:
    """Shared context for rendering: the project, the site title and URLs."""

    def __init__(self, project: Project, *, title: str, base_url: str | None, noindex: bool,
                 summary: dict[str, Any], health: dict[str, Any], head_html: str = "") -> None:
        self.project = project
        self.title = title
        self.base_url = base_url.rstrip("/") + "/" if base_url else None
        self.noindex = noindex
        self.summary = summary
        self.health = health
        self.head_html = head_html

    def absolute(self, url: str) -> str | None:
        return f"{self.base_url}{url}" if self.base_url else None


def root_prefix(url: str) -> str:
    return "../" * url.count("/")


def _attr(value: str) -> str:
    return escape(value, quote=True)


def _json_ld(data: dict[str, Any]) -> str:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


def document(site: Site, *, url: str, page: dict[str, Any], title: str, description: str, body: str,
             json_ld: list[dict[str, Any]] | None = None) -> str:
    root = root_prefix(url)
    canonical = site.absolute("" if url == "index.html" else url)
    head = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{escape(title)}</title>",
        f'<meta name="description" content="{_attr(description)}">',
        f'<meta name="generator" content="Lineum {__version__}">',
        '<meta name="color-scheme" content="light dark">',
        '<meta name="theme-color" content="#F4F6F8" media="(prefers-color-scheme: light)">',
        '<meta name="theme-color" content="#0E141B" media="(prefers-color-scheme: dark)">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{_attr(site.title)}">',
        f'<meta property="og:title" content="{_attr(title)}">',
        f'<meta property="og:description" content="{_attr(description)}">',
        '<meta name="twitter:card" content="summary">',
    ]
    if canonical:
        head.append(f'<link rel="canonical" href="{_attr(canonical)}">')
        head.append(f'<meta property="og:url" content="{_attr(canonical)}">')
    if site.noindex:
        head.append('<meta name="robots" content="noindex, nofollow">')
    head += [
        f'<link rel="icon" href="{root}assets/favicon.svg" type="image/svg+xml">',
        f'<link rel="stylesheet" href="{root}assets/lineum.css">',
        # Apply the saved theme before first paint so dark mode does not flash.
        "<script>try{var t=localStorage.getItem('lineum-theme');if(t==='light'||t==='dark')"
        "document.documentElement.dataset.theme=t}catch(e){}</script>",
    ]
    for item in json_ld or []:
        head.append(f'<script type="application/ld+json">{_json_ld(item)}</script>')
    if site.head_html:
        head.append(site.head_html)
    page_attr = _attr(json.dumps(page, separators=(",", ":")))
    return (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n' + "\n".join(head) + "\n</head>\n<body>\n"
        f'<div id="lineum-root" data-page="{page_attr}" data-root="{root}">\n'
        f'<div class="ssr">\n{_chrome(site, root, page)}\n<main class="ssr-main">\n{body}\n</main>\n'
        f"{_footer(site)}\n</div>\n</div>\n"
        f'<script src="{root}assets/data.js"></script>\n'
        f'<script src="{root}assets/lineum.js"></script>\n'
        "</body>\n</html>\n"
    )


def _chrome(site: Site, root: str, page: dict[str, Any]) -> str:
    links = [("index.html", "Overview"), ("lineage.html", "Lineage"), ("health.html", "Health"),
             ("analyze.html", "Analyze")]
    current = ' aria-current="page"'
    nav = "".join(
        f'<a href="{root}{href}"{current if page.get("kind") == APP_PAGES[href][0] else ""}>{label}</a>'
        for href, label in links
    )
    return (
        f'<header class="ssr-top"><a class="ssr-brand" href="{root}index.html">{escape(site.title)}</a>'
        f'<nav aria-label="Main">{nav}</nav></header>'
    )


def _footer(site: Site) -> str:
    return (
        '<footer class="ssr-foot"><p>Generated by <a href="https://github.com/zinnoberHaus/lineum">Lineum</a> '
        f"{escape(__version__)} from dbt artifacts. This page works without JavaScript; "
        "enable it for the interactive lineage explorer.</p></footer>"
    )


def _link(root: str, node: Node) -> str:
    return f'<a href="{root}{node.url}">{escape(node.label or node.display_name)}</a>'


def _node_list(site: Site, root: str, ids: list[str], empty: str) -> str:
    nodes = [site.project.nodes[i] for i in ids if i in site.project.nodes]
    if not nodes:
        return f"<p>{escape(empty)}</p>"
    items = "".join(
        f"<li>{_link(root, n)} <small>{escape(TYPE_LABELS.get(n.type, n.type))}</small></li>"
        for n in sorted(nodes, key=lambda n: (n.type, n.name))
    )
    return f"<ul>{items}</ul>"


# ----------------------------------------------------------------------------------------------
# Pages
# ----------------------------------------------------------------------------------------------


def overview(site: Site) -> str:
    project, root = site.project, ""
    counts = site.summary.get("counts", {})
    stat_items = "".join(
        f"<li><strong>{counts.get(key, 0)}</strong> {label}</li>"
        for key, label in (("model", "models"), ("source", "sources"), ("seed", "seeds"),
                           ("snapshot", "snapshots"), ("exposure", "exposures"), ("metric", "metrics"))
        if counts.get(key)
    )
    groups: dict[str, list[Node]] = {}
    for node in project.nodes.values():
        groups.setdefault(node.layer, []).append(node)
    from lineum.project import iter_layers

    sections = []
    for layer, label, _ in iter_layers(project):
        nodes = sorted(groups.get(layer, []), key=lambda n: n.display_name)
        items = "".join(
            f"<li>{_link(root, n)}{' — ' + escape(plain(n.description, 140)) if n.description else ''}</li>"
            for n in nodes
        )
        sections.append(f'<section><h2>{escape(label)} <small>{len(nodes)}</small></h2><ul>{items}</ul></section>')
    description = (
        f"Documentation and lineage for the {project.name} dbt project: "
        f"{counts.get('model', 0)} models, {counts.get('source', 0)} sources, "
        f"{site.summary.get('columns', 0)} columns, health score {site.health.get('score')}."
    )
    body = (
        f"<h1>{escape(site.title)}</h1>"
        + (f'<div class="ssr-prose">{project.overview_html}</div>' if project.overview_html else "")
        + f'<p>{escape(description)}</p><ul class="ssr-stats">{stat_items}</ul>'
        + "".join(sections)
    )
    json_ld: list[dict[str, Any]] = [{
        "@context": "https://schema.org",
        "@type": "DataCatalog",
        "name": site.title,
        "description": description,
        **({"url": site.absolute("")} if site.base_url else {}),
        "dataset": [
            {"@type": "Dataset", "name": n.name, "description": plain(n.description, 300) or _summary(site, n),
             **({"url": site.absolute(n.url)} if site.base_url else {})}
            for n in project.nodes.values() if n.type in ("model", "source", "seed", "snapshot")
        ][:500],
    }]
    return document(site, url="index.html", page={"kind": "overview"}, title=f"{site.title} · dbt docs",
                    description=description, body=body, json_ld=json_ld)


def app_page(site: Site, url: str) -> str:
    kind, label = APP_PAGES[url]
    texts = {
        "lineage": "Explore how every model, source and exposure connects. Expand upstream and downstream, "
                   "trace columns, colour by layer, owner, tests or run time, and right-click any node for "
                   "impact analysis and queries.",
        "health": "Documentation, testing, freshness, ownership and contract coverage for the project, "
                  "with the specific models to fix first.",
        "analyze": "Run SQL in your browser over the project's metadata (nodes, edges, columns, tests, runs) "
                   "and over exported sample data, powered by DuckDB-WASM.",
    }
    body = f"<h1>{escape(label)}</h1><p>{escape(texts[kind])}</p>"
    if kind == "health":
        rows = "".join(
            f"<tr><th scope=\"row\">{escape(d['label'])}</th><td>{'' if d['score'] is None else d['score']}</td>"
            f"<td>{d['hit']} / {d['total']}</td></tr>"
            for d in site.health.get("dimensions", [])
        )
        body += (f"<p>Score: <strong>{site.health.get('score')}</strong> ({escape(site.health.get('grade', ''))})</p>"
                 f"<table><thead><tr><th>Check</th><th>Score</th><th>Covered</th></tr></thead><tbody>{rows}</tbody></table>")
        for finding in site.health.get("findings", []):
            body += f"<h2>{escape(finding['title'])}</h2><p>{escape(finding['detail'])}</p>"
            body += _node_list(site, "", finding["nodes"][:50], "None.")
    elif kind == "lineage":
        body += "<h2>Edges</h2><ul>" + "".join(
            f"<li>{_link('', site.project.nodes[a])} → {_link('', site.project.nodes[b])}</li>"
            for a, b in site.project.edges[:2000]
        ) + "</ul>"
    return document(site, url=url, page={"kind": kind}, title=f"{label} · {site.title}",
                    description=texts[kind], body=body)


def not_found(site: Site) -> str:
    body = ('<h1>Page not found</h1><p>This page does not exist in this build of the documentation. '
            'It may have been renamed or removed.</p><p><a href="index.html">Go to the overview</a></p>')
    return document(site, url="404.html", page={"kind": "notfound"}, title=f"Not found · {site.title}",
                    description="Page not found.", body=body)


def _summary(site: Site, node: Node) -> str:
    kind = TYPE_LABELS.get(node.type, node.type).lower()
    material = f"{node.materialized} " if node.materialized and node.type == "model" else ""
    parts = [f"{node.display_name} is a {material}{kind} in the {site.project.name} dbt project"]
    if node.columns:
        parts.append(f"with {len(node.columns)} columns")
    text = " ".join(parts) + "."
    if node.parents:
        names = ", ".join(site.project.nodes[p].display_name for p in node.parents[:4])
        text += f" Built from {names}{'…' if len(node.parents) > 4 else ''}."
    down = node.metrics.get("down", 0)
    if down:
        text += f" {down} downstream node{'s' if down != 1 else ''} depend on it."
    return text


def resource(site: Site, node: Node) -> str:
    root = root_prefix(node.url)
    project = site.project
    kind = TYPE_LABELS.get(node.type, node.type)
    description = plain(node.description, 300) or _summary(site, node)
    facts = []
    for label, value in (("Type", kind), ("Materialized", node.materialized if node.type == "model" else None),
                         ("Relation", node.relation), ("Layer", node.layer), ("Owner", node.owner),
                         ("Group", node.group), ("Access", node.access), ("Package", node.package),
                         ("Path", node.path), ("Tags", ", ".join(node.tags) if node.tags else None)):
        if value:
            facts.append(f"<dt>{label}</dt><dd>{escape(str(value))}</dd>")
    if node.stats and node.stats.get("rows") is not None:
        facts.append(f"<dt>Rows</dt><dd>{node.stats['rows']:,}</dd>")
    if node.run and node.run.get("seconds") is not None:
        facts.append(f"<dt>Last run</dt><dd>{escape(str(node.run.get('status')))} in {node.run['seconds']} s</dd>")
    columns = ""
    if node.columns:
        rows = "".join(
            f"<tr><th scope=\"row\"><code>{escape(c.name)}</code></th><td>{escape(c.type or '')}</td>"
            f"<td>{c.html or ''}</td></tr>"
            for c in node.columns
        )
        columns = (f"<h2>Columns <small>{len(node.columns)}</small></h2><table><thead><tr><th>Column</th>"
                   f"<th>Type</th><th>Description</th></tr></thead><tbody>{rows}</tbody></table>")
    tests = ""
    if node.tests:
        items = "".join(
            f"<li><code>{escape(t.kind)}</code>{' on ' + escape(t.column) if t.column else ''}: {escape(t.status)}</li>"
            for t in node.tests
        )
        tests = f"<h2>Tests <small>{len(node.tests)}</small></h2><ul>{items}</ul>"
    sql = ""
    if node.raw_sql or node.compiled_sql:
        code = node.compiled_sql or node.raw_sql or ""
        sql = f"<h2>SQL</h2><pre><code>{escape(code[:20000])}</code></pre>"
    exposure = ""
    if node.type == "exposure" and node.extra.get("link"):
        exposure = f'<p><a href="{_attr(node.extra["link"])}" rel="noopener">Open {escape(node.label or node.name)}</a></p>'
    body = (
        f'<nav class="ssr-crumbs" aria-label="Breadcrumb"><a href="{root}index.html">{escape(site.title)}</a> / '
        f"{escape(kind)}s / {escape(node.display_name)}</nav>"
        f"<h1>{escape(node.label or node.display_name)} <small>{escape(kind)}</small></h1>"
        + (f'<div class="ssr-prose">{node.html}</div>' if node.html else f"<p>{escape(description)}</p>")
        + exposure
        + (f"<dl>{''.join(facts)}</dl>" if facts else "")
        + columns
        + f"<h2>Upstream <small>{len(node.parents)}</small></h2>"
        + _node_list(site, root, node.parents, "Nothing upstream: this is a starting point of the graph.")
        + f"<h2>Downstream <small>{len(node.children)}</small></h2>"
        + _node_list(site, root, node.children, "Nothing depends on this yet.")
        + tests
        + sql
    )
    page_title = f"{node.label or node.display_name} · {kind} · {site.title}"
    json_ld: list[dict[str, Any]] = [{
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": node.label or node.display_name,
        "alternateName": node.id,
        "description": description if len(description) >= 50 else f"{description} {_summary(site, node)}",
        "identifier": node.id,
        **({"url": site.absolute(node.url)} if site.base_url else {}),
        **({"keywords": node.tags} if node.tags else {}),
        **({"creator": {"@type": "Organization", "name": node.owner}} if node.owner else {}),
        "includedInDataCatalog": {"@type": "DataCatalog", "name": site.title},
        "variableMeasured": [
            {"@type": "PropertyValue", "name": c.name, **({"description": plain(c.description, 200)} if c.description else {})}
            for c in node.columns[:200]
        ],
        **({"isBasedOn": [site.absolute(project.nodes[p].url) for p in node.parents]} if site.base_url and node.parents else {}),
    }]
    if site.base_url:
        json_ld.append({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": site.title, "item": site.absolute("")},
                {"@type": "ListItem", "position": 2, "name": node.display_name, "item": site.absolute(node.url)},
            ],
        })
    return document(site, url=node.url, page={"kind": "resource", "id": node.id}, title=page_title,
                    description=description, body=body, json_ld=json_ld)
