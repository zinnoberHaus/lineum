"""Column-level lineage from compiled SQL, using sqlglot.

For each SQL model, Lineum parses the compiled SQL, resolves every output column through CTEs,
subqueries, unions and joins to the columns of the upstream relations it reads, and classifies the
transformation along the way:

* ``direct``: the column is passed through unchanged (casts count as unchanged).
* ``renamed``: passed through under another name.
* ``derived``: computed by a function, operator, CASE or window.
* ``aggregated``: computed by an aggregate function.

Ephemeral models are inlined by dbt as ``__dbt__cte__<name>`` CTEs. Lineum cuts those CTEs out so
lineage stops at the ephemeral model, matching the model-level graph.

A column whose sources cannot be resolved gets no edges: Lineum never guesses.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from typing import Any

from lineum.model import TRANSFORMS, Column, ColumnEdge, Node, Project

DIALECTS = {
    "bigquery": "bigquery", "snowflake": "snowflake", "postgres": "postgres", "postgresql": "postgres",
    "redshift": "redshift", "duckdb": "duckdb", "motherduck": "duckdb", "databricks": "databricks",
    "spark": "spark", "trino": "trino", "starburst": "trino", "clickhouse": "clickhouse", "athena": "athena",
    "sqlserver": "tsql", "fabric": "tsql", "synapse": "tsql", "oracle": "oracle", "mysql": "mysql",
    "materialize": "postgres", "teradata": "teradata", "exasol": "exasol", "dremio": "dremio",
}

EPHEMERAL_PREFIX = "__dbt__cte__"
PSEUDO_CATALOG = "__lineum__"
PSEUDO_SCHEMA = "__ephemeral__"
RANK = {name: index for index, name in enumerate(TRANSFORMS)}
PARALLEL_THRESHOLD = 150


@dataclass(frozen=True)
class Job:
    node_id: str
    sql: str
    dialect: str | None
    # {catalog: {db: {table: {column: type}}}} for the relations this model reads
    schema: dict[str, dict[str, dict[str, dict[str, str]]]]
    # (catalog, db, table) lowercased -> node id, for mapping lineage leaves back to nodes
    relations: tuple[tuple[tuple[str, ...], str], ...]
    ephemeral: tuple[tuple[str, str], ...]  # (model name, node id) of ephemeral parents


@dataclass
class Outcome:
    node_id: str
    status: str  # "ok" or the reason column lineage is unavailable
    outputs: list[str]
    edges: list[tuple[str, str, str, str]]  # (source node, source column, target column, transform)


def compute(project: Project, workers: int | None = None) -> dict[str, int]:
    """Compute column lineage for every SQL model and store it on the project.

    Returns counts: models analysed, models with lineage, column edges.
    """
    dialect = DIALECTS.get(project.adapter.lower()) if project.adapter else None
    order = _topological(project)
    eligible: list[Node] = []
    for node in order:
        if node.type not in ("model", "snapshot", "analysis"):
            continue
        if (node.language or "sql") != "sql":
            node.column_lineage = f"{node.language} model: column lineage needs SQL"
            continue
        if not node.compiled_sql:
            node.column_lineage = "no compiled SQL: run `dbt compile` or `dbt docs generate`"
            continue
        eligible.append(node)

    outputs: dict[str, list[str]] = {}
    ephemeral = [n for n in eligible if n.materialized == "ephemeral"]
    regular = [n for n in eligible if n.materialized != "ephemeral"]

    results: list[Outcome] = []
    # Ephemeral models first, in dependency order, so their output columns are known to consumers.
    for node in ephemeral:
        outcome = run_job(_job(project, node, dialect, outputs))
        outputs[node.id] = outcome.outputs
        results.append(outcome)

    jobs = [_job(project, node, dialect, outputs) for node in regular]
    worker_count = _workers(workers, len(jobs))
    if worker_count > 1:
        with ProcessPoolExecutor(max_workers=worker_count) as pool:
            results.extend(pool.map(run_job, jobs, chunksize=8))
    else:
        results.extend(run_job(job) for job in jobs)

    edges: list[ColumnEdge] = []
    with_lineage = 0
    for outcome in results:
        node = project.nodes[outcome.node_id]
        node.column_lineage = outcome.status
        if outcome.status != "ok":
            continue
        _add_missing_columns(node, outcome.outputs)
        resolved_targets = set()
        for source, source_column, target_column, transform in outcome.edges:
            source_node = project.nodes.get(source)
            source_name = source_column
            if source_node is not None:
                existing = source_node.column(source_column)
                if existing is not None:
                    source_name = existing.name
                elif source_node.materialized == "ephemeral" or not source_node.columns:
                    source_node.columns.append(Column(name=source_column))
            edges.append(ColumnEdge(source, source_name, node.id, _column_name(node, target_column), transform))
            resolved_targets.add(target_column.lower())
        total = len(outcome.outputs)
        node.extra["column_lineage"] = {"resolved": len(resolved_targets), "total": total}
        if outcome.edges:
            with_lineage += 1
    project.column_edges = _dedupe(edges)
    return {"models": len(eligible), "with_lineage": with_lineage, "edges": len(project.column_edges)}


def _workers(requested: int | None, jobs: int) -> int:
    if requested is not None:
        return max(1, requested)
    if jobs < PARALLEL_THRESHOLD:
        return 1
    return max(1, min(8, (os.cpu_count() or 2) - 1))


def _column_name(node: Node, name: str) -> str:
    column = node.column(name)
    return column.name if column else name


def _add_missing_columns(node: Node, outputs: list[str]) -> None:
    for name in outputs:
        if node.column(name) is None:
            node.columns.append(Column(name=name))


def _dedupe(edges: list[ColumnEdge]) -> list[ColumnEdge]:
    best: dict[tuple[str, str, str, str], ColumnEdge] = {}
    for edge in edges:
        key = (edge.source, edge.source_column.lower(), edge.target, edge.target_column.lower())
        current = best.get(key)
        if current is None or RANK[edge.transform] > RANK[current.transform]:
            best[key] = edge
    return list(best.values())


def _topological(project: Project) -> list[Node]:
    indegree = {uid: 0 for uid in project.nodes}
    for _, child in project.edges:
        indegree[child] += 1
    ready = [uid for uid, degree in indegree.items() if degree == 0]
    order: list[Node] = []
    while ready:
        uid = ready.pop()
        order.append(project.nodes[uid])
        for child in project.nodes[uid].children:
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
    if len(order) < len(project.nodes):  # cycles should not exist, but never drop nodes
        seen = {node.id for node in order}
        order.extend(node for uid, node in project.nodes.items() if uid not in seen)
    return order


def _clean(value: str | None) -> str:
    return (value or "").replace('"', "").replace("`", "").replace("[", "").replace("]", "").lower()


def _job(project: Project, node: Node, dialect: str | None, outputs: dict[str, list[str]]) -> Job:
    schema: dict[str, dict[str, dict[str, dict[str, str]]]] = {}
    relations: list[tuple[tuple[str, ...], str]] = []
    ephemeral: list[tuple[str, str]] = []
    for parent_id in node.parents:
        parent = project.nodes[parent_id]
        if parent.materialized == "ephemeral":
            columns = outputs.get(parent_id) or [c.name for c in parent.columns]
            schema.setdefault(PSEUDO_CATALOG, {}).setdefault(PSEUDO_SCHEMA, {})[parent.name] = {
                c: "UNKNOWN" for c in columns
            }
            relations.append(((PSEUDO_CATALOG, PSEUDO_SCHEMA, parent.name.lower()), parent_id))
            ephemeral.append((parent.name, parent_id))
            continue
        table = parent.alias or parent.name
        if not parent.schema or not table:
            continue
        database = parent.database or ""
        if parent.columns:
            schema.setdefault(database, {}).setdefault(parent.schema, {})[table] = {
                c.name: (c.type or "UNKNOWN") for c in parent.columns
            }
        key = (_clean(database), _clean(parent.schema), _clean(table))
        relations.append((key, parent_id))
    return Job(node.id, node.compiled_sql or "", dialect, schema, tuple(relations), tuple(ephemeral))


def run_job(job: Job) -> Outcome:
    """Analyse one model. Runs in a worker process for large projects, so it must not raise."""
    try:
        return _analyse(job)
    except Exception as error:  # noqa: BLE001 - one bad model must not stop the build
        reason = str(error).splitlines()[0][:160] if str(error) else type(error).__name__
        return Outcome(job.node_id, f"could not analyse SQL: {reason}", [], [])


def _analyse(job: Job) -> Outcome:
    import sqlglot
    from sqlglot import exp
    from sqlglot.errors import SqlglotError
    from sqlglot.lineage import lineage

    try:
        statements = [s for s in sqlglot.parse(job.sql, dialect=job.dialect) if s is not None]
    except SqlglotError as error:
        return Outcome(job.node_id, f"could not parse SQL: {str(error).splitlines()[0][:160]}", [], [])
    query = next((s for s in reversed(statements) if isinstance(s, exp.Query)), None)
    if query is None:
        return Outcome(job.node_id, "SQL is not a SELECT query", [], [])

    if job.ephemeral:
        query = _cut_ephemeral_ctes(query, dict(job.ephemeral))

    schema = _uniform_schema(job.schema)
    try:
        roots = _lineage_all(lineage, query, schema, job.dialect)
    except SqlglotError as error:
        return Outcome(job.node_id, f"could not resolve columns: {str(error).splitlines()[0][:160]}", [], [])

    lookup = _relation_lookup(job.relations)
    edges: list[tuple[str, str, str, str]] = []
    for output, root in roots.items():
        for table, column, transform in _leaves(root, exp):
            source = _resolve(table, lookup)
            if source is not None and column:
                edges.append((source, column, output, transform))
    return Outcome(job.node_id, "ok", list(roots), edges)


def _lineage_all(lineage: Any, query: Any, schema: dict[str, Any], dialect: str | None) -> dict[str, Any]:
    """Lineage of every output column. sqlglot 30+ does this in one call with a shared cache; older
    releases need one call per column over a query qualified once."""
    from sqlglot.errors import SqlglotError

    try:
        result = lineage(None, query, schema, dialect=dialect, copy=True)
        if isinstance(result, dict):
            return result
    except SqlglotError:
        raise
    except Exception:  # noqa: BLE001 - older sqlglot without column=None support
        pass
    from sqlglot.optimizer.qualify import qualify
    from sqlglot.optimizer.scope import build_scope
    from sqlglot.schema import ensure_schema

    mapping = ensure_schema(schema, dialect=dialect)
    qualified = qualify(query, dialect=dialect, schema=mapping, validate_qualify_columns=False, identify=False)
    scope = build_scope(qualified)
    if scope is None:
        raise SqlglotError("Cannot build lineage, sql must be SELECT")
    return {
        select.alias_or_name: lineage(select.alias_or_name, qualified, mapping, dialect=dialect, scope=scope)
        for select in qualified.selects
        if select.alias_or_name
    }


def _uniform_schema(schema: dict[str, dict[str, dict[str, dict[str, str]]]]) -> dict[str, Any]:
    """sqlglot wants every table at the same nesting depth; use catalog.db.table throughout."""
    uniform: dict[str, Any] = {}
    for catalog, dbs in schema.items():
        name = catalog or "__default__"
        for db, tables in dbs.items():
            uniform.setdefault(name, {}).setdefault(db, {}).update(tables)
    return uniform


def _cut_ephemeral_ctes(query: Any, ephemeral: dict[str, str]) -> Any:
    """Replace dbt's inlined ephemeral CTEs with references to a pseudo table per ephemeral model."""
    from sqlglot import exp

    with_ = query.args.get("with") or query.args.get("with_")
    names = {f"{EPHEMERAL_PREFIX}{name}".lower(): name for name in ephemeral}
    if with_ is not None:
        kept = [cte for cte in with_.expressions if cte.alias_or_name.lower() not in names]
        if len(kept) != len(with_.expressions):
            if kept:
                with_.set("expressions", kept)
            else:
                with_.pop()
    for table in list(query.find_all(exp.Table)):
        model = names.get(table.name.lower())
        if model is None or table.args.get("db"):
            continue
        alias = table.alias or table.name
        replacement = exp.table_(model, db=PSEUDO_SCHEMA, catalog=PSEUDO_CATALOG, alias=alias)
        table.replace(replacement)
    return query


def _relation_lookup(relations: tuple[tuple[tuple[str, ...], str], ...]) -> dict[tuple[str, ...], str | None]:
    lookup: dict[tuple[str, ...], str | None] = {}
    for (database, schema, table), node_id in relations:
        for key in ((database, schema, table), (schema, table), (table,)):
            if key in lookup and lookup[key] != node_id:
                lookup[key] = None  # ambiguous
            else:
                lookup[key] = node_id
    return lookup


def _resolve(table: Any, lookup: dict[tuple[str, ...], str | None]) -> str | None:
    name = _clean(table.name)
    if not name:
        return None
    database, schema = _clean(table.catalog), _clean(table.db)
    for key in ((database, schema, name), (schema, name), (name,)):
        if all(key) and key in lookup:
            return lookup[key]
    return None


def _leaves(root: Any, exp: Any) -> Iterator[tuple[Any, str, str]]:
    """Yield (table expression, column, transform) for every source column a lineage tree reaches."""
    stack: list[tuple[Any, int, frozenset[int]]] = [(root, 0, frozenset())]
    while stack:
        node, rank, path = stack.pop()
        if id(node) in path:  # defensive: lineage trees are acyclic
            continue
        expression = node.expression
        if isinstance(expression, exp.Table):
            yield expression, node.name.split(".")[-1], TRANSFORMS[rank]
            continue
        rank = max(rank, _hop_rank(expression, exp))
        for child in node.downstream:
            stack.append((child, rank, path | {id(node)}))


def _hop_rank(expression: Any, exp: Any) -> int:
    """How one projection transforms its input. A column under a different alias is a rename."""
    alias = expression.alias if isinstance(expression, exp.Alias) else ""
    inner = expression.unalias() if isinstance(expression, exp.Alias) else expression
    while isinstance(inner, (exp.Cast, exp.TryCast, exp.Paren)):
        inner = inner.this
    if isinstance(inner, (exp.Column, exp.Star)):
        if isinstance(inner, exp.Column) and inner.name and alias and inner.name.lower() != alias.lower():
            return RANK["renamed"]
        return RANK["direct"]
    if inner.find(exp.Window):
        return RANK["derived"]
    if inner.find(exp.AggFunc):
        return RANK["aggregated"]
    return RANK["derived"]
