"""The normalized project graph Lineum builds from dbt artifacts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Node types shown in the lineage graph. Tests are attached to the nodes they test instead.
NODE_TYPES = (
    "source",
    "seed",
    "snapshot",
    "model",
    "analysis",
    "function",
    "semantic_model",
    "metric",
    "saved_query",
    "exposure",
)

# Column lineage transformation kinds, strongest last. A column that passes through a cast keeps
# its kind; any function or arithmetic makes it derived; an aggregate makes it aggregated.
TRANSFORMS = ("direct", "renamed", "derived", "aggregated")


@dataclass(slots=True)
class Test:
    id: str
    name: str
    kind: str
    column: str | None = None
    status: str = "not_run"  # pass | fail | warn | error | skipped | not_run
    severity: str = "error"
    failures: int | None = None
    message: str | None = None
    seconds: float | None = None
    references: str | None = None  # the other node of a relationships test

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {"id": self.id, "name": self.name, "kind": self.kind, "status": self.status}
        if self.column:
            data["column"] = self.column
        if self.severity != "error":
            data["severity"] = self.severity
        if self.failures:
            data["failures"] = self.failures
        if self.message and self.status in ("fail", "warn", "error"):
            data["message"] = self.message[:500]
        if self.seconds is not None:
            data["seconds"] = round(self.seconds, 3)
        if self.references:
            data["references"] = self.references
        return data


@dataclass(slots=True)
class Column:
    name: str
    type: str | None = None
    description: str = ""
    html: str = ""
    meta: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    primary_key: bool = False
    tests: list[int] = field(default_factory=list)  # indexes into Node.tests
    profile: dict[str, Any] | None = None

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {"name": self.name}
        if self.type:
            data["type"] = self.type
        if self.description:
            data["description"] = self.description
            data["html"] = self.html
        if self.meta:
            data["meta"] = self.meta
        if self.tags:
            data["tags"] = self.tags
        if self.primary_key:
            data["pk"] = True
        if self.tests:
            data["tests"] = self.tests
        if self.profile:
            data["profile"] = self.profile
        return data


@dataclass(slots=True)
class Node:
    id: str
    type: str
    name: str
    package: str
    label: str | None = None
    path: str | None = None
    folder: str = ""
    layer: str = "other"
    url: str = ""
    description: str = ""
    html: str = ""
    tags: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    owner: str | None = None
    group: str | None = None
    access: str | None = None
    materialized: str | None = None
    database: str | None = None
    schema: str | None = None
    alias: str | None = None
    relation: str | None = None
    language: str | None = None
    contract: bool = False
    version: str | None = None
    columns: list[Column] = field(default_factory=list)
    raw_sql: str | None = None
    compiled_sql: str | None = None
    tests: list[Test] = field(default_factory=list)
    run: dict[str, Any] | None = None
    stats: dict[str, Any] | None = None
    freshness: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)
    parents: list[str] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    column_lineage: str | None = None  # "ok", or why column lineage is unavailable

    def column(self, name: str) -> Column | None:
        lowered = name.lower()
        for column in self.columns:
            if column.name.lower() == lowered:
                return column
        return None

    @property
    def display_name(self) -> str:
        if self.type == "source":
            return f"{self.extra.get('source_name', '')}.{self.name}"
        return self.name


@dataclass(slots=True, frozen=True)
class ColumnEdge:
    source: str  # node id
    source_column: str
    target: str  # node id
    target_column: str
    transform: str  # one of TRANSFORMS


@dataclass
class Project:
    name: str
    dbt_version: str = ""
    adapter: str = ""
    generated_at: str = ""
    run_generated_at: str | None = None
    artifact_versions: dict[str, str] = field(default_factory=dict)
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: list[tuple[str, str]] = field(default_factory=list)
    column_edges: list[ColumnEdge] = field(default_factory=list)
    groups: list[dict[str, Any]] = field(default_factory=list)
    overview_html: str = ""
    warnings: list[str] = field(default_factory=list)

    def resolve(self, reference: str) -> Node | None:
        """Find a node by unique id, name, ``source_name.table`` or a ``type:name`` reference."""
        if reference in self.nodes:
            return self.nodes[reference]
        wanted_type = None
        name = reference
        if ":" in reference:
            wanted_type, name = reference.split(":", 1)
            wanted_type = {"src": "source", "exp": "exposure"}.get(wanted_type, wanted_type)
        lowered = name.lower()
        matches = []
        for node in self.nodes.values():
            if wanted_type and node.type != wanted_type:
                continue
            if node.name.lower() == lowered or node.display_name.lower() == lowered:
                matches.append(node)
        if not matches:
            return None
        # Prefer models, then the root project's package, when a name is ambiguous.
        matches.sort(key=lambda n: (n.type != "model", n.package != self.name))
        return matches[0]
