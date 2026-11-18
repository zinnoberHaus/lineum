"""The JSON payload the site's browser app reads (window.__LINEUM__).

The shape is documented in docs/payload.md and typed in web/src/types.ts. Bump SCHEMA when a change
would break an older app bundle.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from lineum import __version__
from lineum.columns import DIALECTS
from lineum.model import Node, Project
from lineum.project import iter_layers

SCHEMA = "lineum/1"
TRANSFORM_CODES = {"direct": "d", "renamed": "r", "derived": "x", "aggregated": "a"}


def build(
    project: Project,
    summary: dict[str, Any],
    health: dict[str, Any],
    *,
    title: str,
    base_url: str | None,
    include_sql: bool,
    data: dict[str, Any] | None = None,
    queries: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    ids = list(project.nodes)
    index = {uid: i for i, uid in enumerate(ids)}
    return {
        "schema": SCHEMA,
        "meta": {
            "project": project.name,
            "title": title,
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "lineumVersion": __version__,
            "dbtVersion": project.dbt_version,
            "adapter": project.adapter,
            "dialect": DIALECTS.get(project.adapter.lower(), project.adapter) if project.adapter else None,
            "artifacts": project.artifact_versions,
            "manifestGeneratedAt": project.generated_at,
            "runGeneratedAt": project.run_generated_at,
            "baseUrl": base_url,
            "sql": include_sql,
            "data": data or {"enabled": False},
            "queries": queries or [],
        },
        "overview": project.overview_html,
        "layers": [{"id": layer, "label": label, "rank": rank} for layer, label, rank in iter_layers(project)],
        "groups": project.groups,
        "nodes": [node_json(node, include_sql) for node in project.nodes.values()],
        "edges": [[index[a], index[b]] for a, b in project.edges],
        "columnEdges": [
            [index[e.source], e.source_column, index[e.target], e.target_column, TRANSFORM_CODES[e.transform]]
            for e in project.column_edges
            if e.source in index and e.target in index
        ],
        "summary": summary,
        "health": health,
        "warnings": project.warnings,
    }


def node_json(node: Node, include_sql: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": node.id,
        "type": node.type,
        "name": node.name,
        "package": node.package,
        "layer": node.layer,
        "url": node.url,
        "m": node.metrics,
    }
    optional = {
        "label": node.label,
        "path": node.path,
        "folder": node.folder,
        "description": node.description,
        "html": node.html,
        "tags": node.tags,
        "meta": node.meta,
        "owner": node.owner,
        "group": node.group,
        "access": node.access,
        "materialized": node.materialized,
        "database": node.database,
        "schema": node.schema,
        "alias": node.alias if node.alias != node.name else None,
        "relation": node.relation,
        "language": node.language if node.language not in (None, "sql") else None,
        "version": node.version,
        "run": node.run,
        "stats": node.stats,
        "freshness": node.freshness,
        "columnLineage": node.column_lineage if node.column_lineage not in (None, "ok") else None,
    }
    for key, value in optional.items():
        if value not in (None, "", [], {}):
            data[key] = value
    if node.contract:
        data["contract"] = True
    if node.columns:
        data["columns"] = [column.to_json() for column in node.columns]
    if node.tests:
        data["tests"] = [test.to_json() for test in node.tests]
    if node.extra:
        data["x"] = node.extra
    if include_sql and (node.raw_sql or node.compiled_sql):
        data["sql"] = {k: v for k, v in (("raw", node.raw_sql), ("compiled", node.compiled_sql)) if v}
    return data
