"""Build the normalized project graph from dbt artifacts."""

from __future__ import annotations

import fnmatch
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lineum import markdown
from lineum.artifacts import JSON, Artifacts
from lineum.model import Column, Node, Project, Test

GRAPH_RESOURCE_TYPES = {"model", "seed", "snapshot", "analysis"}

# (id, label, rank) — rank orders layers left to right in the lineage view.
LAYERS: tuple[tuple[str, str, int], ...] = (
    ("source", "Sources", 0),
    ("seed", "Seeds", 0),
    ("staging", "Staging", 1),
    ("snapshot", "Snapshots", 1),
    ("intermediate", "Intermediate", 2),
    ("other", "Other models", 2),
    ("marts", "Marts", 3),
    ("semantic", "Semantic layer", 4),
    ("analysis", "Analyses", 4),
    ("exposure", "Exposures", 5),
)

DEFAULT_LAYER_RULES: dict[str, list[str]] = {
    "staging": ["stg_*", "base_*", "*/staging/*", "*/base/*", "staging/*", "base/*"],
    "intermediate": ["int_*", "*/intermediate/*", "intermediate/*"],
    "marts": ["fct_*", "fact_*", "dim_*", "mart_*", "agg_*", "rpt_*", "report_*", "obt_*",
              "*/marts/*", "marts/*", "*/mart/*", "mart/*"],
}


@dataclass
class BuildOptions:
    exclude_packages: list[str] = field(default_factory=list)
    include_sql: bool = True
    layer_rules: dict[str, list[str]] = field(default_factory=dict)
    title: str | None = None


def build_project(artifacts: Artifacts, options: BuildOptions | None = None) -> Project:
    options = options or BuildOptions()
    manifest = artifacts.manifest
    meta = manifest.get("metadata", {})
    project = Project(
        name=str(meta.get("project_name") or _guess_project_name(manifest)),
        dbt_version=str(meta.get("dbt_version", "")),
        adapter=str(meta.get("adapter_type") or ""),
        generated_at=str(meta.get("generated_at", "")),
        artifact_versions=artifacts.versions(),
        warnings=list(artifacts.warnings),
    )
    if artifacts.run_results:
        project.run_generated_at = artifacts.run_results.get("metadata", {}).get("generated_at")

    catalog = _catalog_index(artifacts.catalog)
    runs = _run_index(artifacts.run_results)
    freshness = _freshness_index(artifacts.sources)
    groups = {name: group for name, group in (manifest.get("groups") or {}).items()}
    group_owner = {
        group.get("name"): (group.get("owner") or {}) for group in groups.values() if isinstance(group, dict)
    }
    project.groups = [
        {"name": g.get("name"), "owner": (g.get("owner") or {}).get("name"), "email": (g.get("owner") or {}).get("email")}
        for g in groups.values()
        if isinstance(g, dict)
    ]
    excluded = set(options.exclude_packages)
    rules = {**DEFAULT_LAYER_RULES, **options.layer_rules}

    def keep(entry: JSON) -> bool:
        if entry.get("package_name") in excluded:
            return False
        config = entry.get("config") or {}
        return config.get("enabled", True) is not False

    # Models, seeds, snapshots, analyses ------------------------------------------------------
    for uid, entry in (manifest.get("nodes") or {}).items():
        if entry.get("resource_type") not in GRAPH_RESOURCE_TYPES or not keep(entry):
            continue
        node = _base_node(uid, entry)
        config = entry.get("config") or {}
        node.materialized = config.get("materialized") or entry.get("resource_type")
        if node.type == "seed":
            node.materialized = "seed"
        elif node.type == "snapshot":
            node.materialized = "snapshot"
        node.database = entry.get("database")
        node.schema = entry.get("schema")
        node.alias = entry.get("alias") or entry.get("name")
        node.relation = _relation(entry)
        node.language = entry.get("language") or "sql"
        node.access = entry.get("access") or config.get("access")
        node.group = entry.get("group") or config.get("group")
        contract = entry.get("contract") or config.get("contract") or {}
        node.contract = bool(contract.get("enforced")) if isinstance(contract, dict) else False
        version = entry.get("version")
        node.version = str(version) if version is not None else None
        if options.include_sql:
            node.raw_sql = entry.get("raw_code") or entry.get("raw_sql")
        node.compiled_sql = entry.get("compiled_code") or entry.get("compiled_sql")
        if not node.compiled_sql:
            node.compiled_sql = (runs.get(uid) or {}).get("compiled_code") or _compiled_from_disk(artifacts, entry)
        node.columns = _merge_columns(entry.get("columns") or {}, catalog.get(uid))
        for key in entry.get("primary_key") or []:
            column = node.column(key)
            if column:
                column.primary_key = True
        node.stats = _stats(catalog.get(uid))
        node.run = _run(runs.get(uid))
        node.owner = _owner(entry, group_owner.get(node.group))
        project.nodes[uid] = node

    # Sources ----------------------------------------------------------------------------------
    for uid, entry in (manifest.get("sources") or {}).items():
        if not keep(entry):
            continue
        node = _base_node(uid, entry)
        node.database = entry.get("database")
        node.schema = entry.get("schema")
        node.alias = entry.get("identifier") or entry.get("name")
        node.relation = _relation(entry)
        node.materialized = "source"
        node.columns = _merge_columns(entry.get("columns") or {}, catalog.get(uid))
        node.stats = _stats(catalog.get(uid))
        node.owner = _owner(entry, None)
        node.extra["source_name"] = entry.get("source_name", "")
        if entry.get("loader"):
            node.extra["loader"] = entry["loader"]
        source_description = entry.get("source_description")
        if source_description:
            node.extra["source_description"] = markdown.plain(source_description, 400)
        configured = entry.get("freshness") or (entry.get("config") or {}).get("freshness")
        loaded_at = entry.get("loaded_at_field")
        node.freshness = _freshness(freshness.get(uid), configured, loaded_at)
        project.nodes[uid] = node

    # Exposures --------------------------------------------------------------------------------
    for uid, entry in (manifest.get("exposures") or {}).items():
        if not keep(entry):
            continue
        node = _base_node(uid, entry)
        node.label = entry.get("label") or None
        node.materialized = "exposure"
        owner = entry.get("owner") or {}
        node.owner = owner.get("name") or owner.get("email")
        node.extra.update(
            {
                key: value
                for key, value in {
                    "exposure_type": entry.get("type"),
                    "maturity": entry.get("maturity"),
                    "link": entry.get("url"),
                    "owner_email": owner.get("email"),
                }.items()
                if value
            }
        )
        project.nodes[uid] = node

    # Semantic layer and functions -------------------------------------------------------------
    for key, node_type in (("semantic_models", "semantic_model"), ("metrics", "metric"),
                           ("saved_queries", "saved_query"), ("functions", "function")):
        for uid, entry in (manifest.get(key) or {}).items():
            if not isinstance(entry, dict) or not keep(entry):
                continue
            node = _base_node(uid, entry)
            node.type = node_type
            node.label = entry.get("label") or None
            node.materialized = node_type
            if node_type == "metric":
                node.extra["metric_type"] = entry.get("type")
                params = entry.get("type_params") or {}
                measure = params.get("measure")
                if isinstance(measure, dict):
                    measure = measure.get("name")
                expression = params.get("expr")
                if measure:
                    node.extra["measure"] = measure
                if expression:
                    node.extra["expression"] = expression
                for part in ("numerator", "denominator"):
                    value = params.get(part)
                    if isinstance(value, dict):
                        value = value.get("name")
                    if value:
                        node.extra[part] = value
            elif node_type == "semantic_model":
                node.extra["entities"] = [e.get("name") for e in entry.get("entities") or []]
                node.extra["dimensions"] = [d.get("name") for d in entry.get("dimensions") or []]
                node.extra["measures"] = [
                    {"name": m.get("name"), "agg": m.get("agg")} for m in entry.get("measures") or []
                ]
            if node_type == "function":
                node.language = entry.get("language") or "sql"
                if options.include_sql:
                    node.raw_sql = entry.get("raw_code")
            node.group = entry.get("group") or (entry.get("config") or {}).get("group")
            node.owner = _owner(entry, group_owner.get(node.group))
            project.nodes[uid] = node

    # Edges --------------------------------------------------------------------------------------
    sources_of = {**(manifest.get("nodes") or {}), **(manifest.get("exposures") or {}),
                  **(manifest.get("metrics") or {}), **(manifest.get("semantic_models") or {}),
                  **(manifest.get("saved_queries") or {}), **(manifest.get("functions") or {})}
    seen: set[tuple[str, str]] = set()
    for uid in project.nodes:
        entry = sources_of.get(uid)
        if entry is None:
            continue
        for parent in (entry.get("depends_on") or {}).get("nodes") or []:
            if parent in project.nodes and parent != uid and (parent, uid) not in seen:
                seen.add((parent, uid))
                project.edges.append((parent, uid))
    for parent, child in project.edges:
        project.nodes[parent].children.append(child)
        project.nodes[child].parents.append(parent)

    _attach_tests(project, manifest, runs)
    _assign_layers(project, rules)
    _assign_urls(project)
    project.overview_html = _overview(manifest, project.name)
    if not project.edges and len(project.nodes) > 1:
        project.warnings.append("No dependencies found between nodes; is manifest.json from `dbt parse` or later?")
    return project


# ----------------------------------------------------------------------------------------------
# Node construction helpers
# ----------------------------------------------------------------------------------------------


def _base_node(uid: str, entry: JSON) -> Node:
    resource_type = entry.get("resource_type") or uid.split(".", 1)[0]
    path = entry.get("original_file_path") or entry.get("path")
    description = entry.get("description") or ""
    config = entry.get("config") or {}
    tags = sorted(set(entry.get("tags") or config.get("tags") or []))
    meta = entry.get("meta") or config.get("meta") or {}
    return Node(
        id=uid,
        type=resource_type,
        name=str(entry.get("name") or uid.rsplit(".", 1)[-1]),
        package=str(entry.get("package_name") or uid.split(".")[1]),
        path=path,
        folder=_folder(entry, path),
        description=description.strip(),
        html=markdown.render(description),
        tags=tags,
        meta=meta if isinstance(meta, dict) else {},
    )


def _folder(entry: JSON, path: str | None) -> str:
    fqn = entry.get("fqn")
    if isinstance(fqn, list) and len(fqn) > 2:
        return "/".join(str(part) for part in fqn[1:-1])
    if path:
        parent = Path(path).parent.as_posix()
        for prefix in ("models/", "seeds/", "snapshots/", "analyses/"):
            if parent.startswith(prefix):
                return parent[len(prefix):]
        return "" if parent == "." else parent
    return ""


def _relation(entry: JSON) -> str | None:
    relation = entry.get("relation_name")
    if relation:
        return str(relation).replace('"', "").replace("`", "")
    parts = [entry.get("database"), entry.get("schema"), entry.get("identifier") or entry.get("alias")]
    cleaned = [str(p) for p in parts if p]
    return ".".join(cleaned) if len(cleaned) >= 2 else None


def _owner(entry: JSON, group_owner: dict[str, Any] | None) -> str | None:
    meta = entry.get("meta") or (entry.get("config") or {}).get("meta") or {}
    for key in ("owner", "owners", "maintainer", "team"):
        value = meta.get(key) if isinstance(meta, dict) else None
        if isinstance(value, str) and value:
            return value
        if isinstance(value, list) and value:
            return ", ".join(str(v) for v in value)
    owner = entry.get("owner")
    if isinstance(owner, dict) and (owner.get("name") or owner.get("email")):
        return owner.get("name") or owner.get("email")
    if group_owner:
        return group_owner.get("name") or group_owner.get("email")
    return None


def _merge_columns(documented: JSON, catalog_entry: JSON | None) -> list[Column]:
    """Catalog columns in warehouse order, then documented columns the catalog does not have."""
    by_name: dict[str, Column] = {}
    order: list[str] = []
    if catalog_entry:
        catalog_columns = sorted(
            (catalog_entry.get("columns") or {}).values(), key=lambda c: c.get("index") or 0
        )
        for column in catalog_columns:
            name = str(column.get("name"))
            by_name[name.lower()] = Column(name=name, type=column.get("type"))
            order.append(name.lower())
            comment = column.get("comment")
            if comment:
                by_name[name.lower()].description = str(comment)
    for name, column in documented.items():
        key = str(column.get("name") or name).lower()
        target = by_name.get(key)
        if target is None:
            target = Column(name=str(column.get("name") or name))
            by_name[key] = target
            order.append(key)
        description = (column.get("description") or "").strip()
        if description:
            target.description = description
        if not target.type and column.get("data_type"):
            target.type = str(column["data_type"])
        target.meta = column.get("meta") or {}
        target.tags = list(column.get("tags") or [])
        for constraint in column.get("constraints") or []:
            if isinstance(constraint, dict) and constraint.get("type") == "primary_key":
                target.primary_key = True
    columns = [by_name[key] for key in order]
    for column in columns:
        column.html = markdown.render(column.description)
    return columns


def _stats(entry: JSON | None) -> dict[str, Any] | None:
    if not entry:
        return None
    result: dict[str, Any] = {}
    kind = (entry.get("metadata") or {}).get("type")
    if kind:
        result["kind"] = str(kind).lower()
    for stat in (entry.get("stats") or {}).values():
        if not isinstance(stat, dict) or not stat.get("include", True):
            continue
        stat_id = str(stat.get("id", "")).lower()
        value = stat.get("value")
        if value in (None, "", False):
            continue
        if stat_id in ("row_count", "num_rows", "rows", "approximate_row_count"):
            result["rows"] = _number(value)
        elif stat_id in ("bytes", "num_bytes", "size_bytes", "size"):
            result["bytes"] = _number(value)
        elif stat_id in ("last_modified", "modified"):
            result["modified"] = str(value)
    return result or None


def _number(value: Any) -> int | float | None:
    try:
        number = float(str(value).replace(",", ""))
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def _run(result: JSON | None) -> dict[str, Any] | None:
    if not result:
        return None
    run: dict[str, Any] = {"status": result.get("status")}
    if result.get("execution_time") is not None:
        run["seconds"] = round(float(result["execution_time"]), 3)
    for timing in result.get("timing") or []:
        if timing.get("name") == "execute" and timing.get("completed_at"):
            run["at"] = timing["completed_at"]
    rows = (result.get("adapter_response") or {}).get("rows_affected")
    if isinstance(rows, int) and rows >= 0:
        run["rows"] = rows
    if result.get("status") in ("error", "fail") and result.get("message"):
        run["message"] = str(result["message"])[:500]
    return run


def _freshness(result: JSON | None, configured: Any, loaded_at_field: Any) -> dict[str, Any] | None:
    criteria = configured if isinstance(configured, dict) else {}
    has_rule = any(
        isinstance(criteria.get(level), dict) and criteria[level].get("count") for level in ("warn_after", "error_after")
    )
    if not result and not has_rule:
        return None
    data: dict[str, Any] = {"configured": has_rule and bool(loaded_at_field)}
    for level in ("warn_after", "error_after"):
        rule = (result or {}).get("criteria", {}).get(level) or criteria.get(level) or {}
        if rule.get("count"):
            data["warnAfter" if level == "warn_after" else "errorAfter"] = f"{rule['count']} {rule.get('period', '')}".strip()
    if result:
        data["status"] = result.get("status")
        data["maxLoadedAt"] = result.get("max_loaded_at")
        data["checkedAt"] = result.get("snapshotted_at")
        age = result.get("max_loaded_at_time_ago_in_s")
        if age is not None:
            data["ageSeconds"] = round(float(age))
    return data


def _compiled_from_disk(artifacts: Artifacts, entry: JSON) -> str | None:
    if not artifacts.compiled_dir:
        return None
    path = entry.get("original_file_path")
    package = entry.get("package_name")
    if not path or not package:
        return None
    candidate = artifacts.compiled_dir / package / path
    try:
        resolved = candidate.resolve()
        if artifacts.compiled_dir.resolve() not in resolved.parents:
            return None
        if resolved.is_file() and resolved.stat().st_size < 2_000_000:
            return resolved.read_text(errors="replace")
    except OSError:
        return None
    return None


def _catalog_index(catalog: JSON | None) -> dict[str, JSON]:
    if not catalog:
        return {}
    return {**(catalog.get("nodes") or {}), **(catalog.get("sources") or {})}


def _run_index(run_results: JSON | None) -> dict[str, JSON]:
    if not run_results:
        return {}
    return {r["unique_id"]: r for r in run_results.get("results") or [] if isinstance(r, dict) and "unique_id" in r}


def _freshness_index(sources: JSON | None) -> dict[str, JSON]:
    if not sources:
        return {}
    return {r["unique_id"]: r for r in sources.get("results") or [] if isinstance(r, dict) and "unique_id" in r}


def _guess_project_name(manifest: JSON) -> str:
    for entry in (manifest.get("nodes") or {}).values():
        if entry.get("resource_type") == "model":
            return str(entry.get("package_name"))
    return "dbt project"


def _overview(manifest: JSON, project_name: str) -> str:
    docs = manifest.get("docs") or {}
    entry = docs.get(f"doc.{project_name}.__overview__")
    if not entry:
        return ""
    return markdown.render(entry.get("block_contents") or "")


# ----------------------------------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------------------------------

TEST_STATUS = {"pass": "pass", "success": "pass", "fail": "fail", "warn": "warn", "error": "error",
               "skipped": "skipped", "skip": "skipped"}


def _attach_tests(project: Project, manifest: JSON, runs: dict[str, JSON]) -> None:
    for uid, entry in (manifest.get("nodes") or {}).items():
        if entry.get("resource_type") != "test":
            continue
        config = entry.get("config") or {}
        if config.get("enabled", True) is False:
            continue
        metadata = entry.get("test_metadata") or {}
        kwargs = metadata.get("kwargs") or {}
        kind = metadata.get("name") or "singular"
        namespace = metadata.get("namespace")
        if namespace and namespace != "dbt":
            kind = f"{namespace}.{kind}"
        column = entry.get("column_name") or kwargs.get("column_name")
        targets = [entry["attached_node"]] if entry.get("attached_node") else []
        depends = (entry.get("depends_on") or {}).get("nodes") or []
        if not targets:
            targets = [d for d in depends if d in project.nodes] if kind == "singular" else depends[:1]
        references = None
        if kind == "relationships":
            others = [d for d in depends if d not in targets]
            references = others[0] if others else None
        run = runs.get(uid) or {}
        status = TEST_STATUS.get(str(run.get("status", "")).lower(), "not_run") if run else "not_run"
        failures = run.get("failures")
        test = Test(
            id=uid,
            name=entry.get("name") or uid,
            kind=kind,
            column=str(column) if column else None,
            status=status,
            severity=str(config.get("severity") or "error").lower(),
            failures=failures if isinstance(failures, int) else None,
            message=run.get("message"),
            seconds=run.get("execution_time"),
            references=references,
        )
        for target in targets:
            node = project.nodes.get(target)
            if node is not None:
                _add_test(node, test)

    for uid, entry in (manifest.get("unit_tests") or {}).items():
        depends = (entry.get("depends_on") or {}).get("nodes") or []
        model = next((d for d in depends if d.startswith("model.")), None)
        node = project.nodes.get(model) if model else None
        if node is None:
            continue
        run = runs.get(uid) or {}
        status = TEST_STATUS.get(str(run.get("status", "")).lower(), "not_run") if run else "not_run"
        _add_test(node, Test(id=uid, name=entry.get("name") or uid, kind="unit", status=status,
                             message=run.get("message"), seconds=run.get("execution_time")))

    # Columns tested unique and not_null count as a primary key when dbt did not name one.
    for node in project.nodes.values():
        if any(c.primary_key for c in node.columns):
            continue
        tested: dict[str, set[str]] = {}
        for test in node.tests:
            if test.column and test.kind in ("unique", "not_null"):
                tested.setdefault(test.column.lower(), set()).add(test.kind)
        for name, kinds in tested.items():
            if kinds == {"unique", "not_null"}:
                column = node.column(name)
                if column:
                    column.primary_key = True


def _add_test(node: Node, test: Test) -> None:
    node.tests.append(test)
    if test.column:
        column = node.column(test.column)
        if column is None and test.column:
            # Tests on expressions (e.g. "lower(email)") or quoted names: match the bare name.
            bare = re.sub(r"[^A-Za-z0-9_]", "", test.column.split(".")[-1])
            column = node.column(bare)
        if column is not None:
            column.tests.append(len(node.tests) - 1)


# ----------------------------------------------------------------------------------------------
# Layers and URLs
# ----------------------------------------------------------------------------------------------


def _assign_layers(project: Project, rules: dict[str, list[str]]) -> None:
    for node in project.nodes.values():
        override = node.meta.get("lineum", {}).get("layer") if isinstance(node.meta.get("lineum"), dict) else None
        if isinstance(override, str) and override:
            node.layer = override
            continue
        if node.type == "model":
            node.layer = _model_layer(node, rules)
        elif node.type in ("semantic_model", "metric", "saved_query"):
            node.layer = "semantic"
        elif node.type == "function":
            node.layer = "other"
        else:
            node.layer = node.type  # source, seed, snapshot, exposure, analysis


def _model_layer(node: Node, rules: dict[str, list[str]]) -> str:
    candidates = [node.name.lower(), f"{node.folder.lower()}/{node.name.lower()}", (node.path or "").lower()]
    for layer in ("staging", "intermediate", "marts", *[k for k in rules if k not in ("staging", "intermediate", "marts")]):
        for pattern in rules.get(layer, []):
            if any(fnmatch.fnmatchcase(candidate, pattern.lower()) for candidate in candidates):
                return layer
    return "other"


_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _assign_urls(project: Project) -> None:
    used: set[str] = set()
    for node in project.nodes.values():
        parts = node.id.split(".")
        if node.type == "source" and len(parts) >= 4:
            segments = [node.type, parts[1], parts[2], ".".join(parts[3:])]
        else:
            segments = [node.type, parts[1] if len(parts) > 1 else node.package, ".".join(parts[2:]) or node.name]
        cleaned = [_UNSAFE.sub("-", segment).strip(".-") or "_" for segment in segments]
        url = "/".join(cleaned) + ".html"
        if url.lower() in used:
            stem = url[: -len(".html")]
            index = 2
            while f"{stem}-{index}.html".lower() in used:
                index += 1
            url = f"{stem}-{index}.html"
        used.add(url.lower())
        node.url = url


def iter_layers(project: Project) -> Iterable[tuple[str, str, int]]:
    present = {node.layer for node in project.nodes.values()}
    known = {layer for layer, _, _ in LAYERS}
    for layer in LAYERS:
        if layer[0] in present:
            yield layer
    for extra in sorted(present - known):
        yield (extra, extra.replace("_", " ").title(), 2)
