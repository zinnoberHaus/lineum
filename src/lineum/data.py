"""Export sample rows and column profiles from a DuckDB warehouse (optional).

``lineum build --data path/to/warehouse.duckdb`` reads each model, seed, snapshot and source from the
DuckDB file, writes up to ``--data-rows`` rows per relation to ``data/<node>.parquet`` in the site,
and profiles every column (nulls, distinct values, min, max, mean, top values). The site's Analyze
page then queries those files in the browser with DuckDB-WASM.

Requires the ``duckdb`` package: ``pip install "lineum[data]"``. The database is opened read-only.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from lineum.model import Node, Project

DATA_TYPES = ("model", "seed", "snapshot", "source")


class DataError(Exception):
    pass


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _relation(node: Node, catalog: str | None) -> str | None:
    table = node.alias or node.name
    if not table or not node.schema:
        return None
    parts = [node.schema, table]
    if node.database and catalog and node.database.lower() == catalog.lower():
        parts.insert(0, node.database)
    return ".".join(_quote(p) for p in parts)


def safe_file_name(node_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", node_id) + ".parquet"


def export(project: Project, database: Path, out_dir: Path, rows: int = 5000,
           profile: bool = True) -> dict[str, Any]:
    try:
        import duckdb
    except ImportError as error:  # pragma: no cover - depends on the environment
        raise DataError('Exporting data needs DuckDB: pip install "lineum[data]"') from error
    if not database.exists():
        raise DataError(f"No DuckDB database at {database}.")
    connection = duckdb.connect(str(database), read_only=True)
    catalog_row = connection.execute("select current_database()").fetchone()
    catalog = str(catalog_row[0]) if catalog_row else None
    out_dir.mkdir(parents=True, exist_ok=True)
    tables: dict[str, Any] = {}
    skipped: list[str] = []
    for node in project.nodes.values():
        if node.type not in DATA_TYPES or node.materialized == "ephemeral":
            continue
        relation = _relation(node, catalog)
        if relation is None:
            continue
        try:
            total_row = connection.execute(f"select count(*) from {relation}").fetchone()
        except duckdb.Error:
            skipped.append(node.id)
            continue
        total = int(total_row[0]) if total_row else 0
        name = safe_file_name(node.id)
        target = out_dir / name
        target_sql = str(target).replace("'", "''")
        # A seeded reservoir sample keeps the whole time range and every segment in proportion;
        # the first N rows would cut a table off at whatever order it happens to be stored in.
        sample = f"using sample reservoir({int(rows)} rows) repeatable (7)" if total > rows else ""
        connection.execute(
            f"copy (select * from {relation} {sample}) to '{target_sql}' (format parquet, compression zstd)"
        )
        tables[node.id] = {
            "file": f"data/{name}",
            "table": _table_name(node, tables),
            "rows": min(total, rows),
            "totalRows": total,
            "sampled": total > rows,
        }
        if node.stats is None:
            node.stats = {}
        node.stats.setdefault("rows", total)
        if profile:
            _profile(connection, relation, node)
    connection.close()
    return {"enabled": True, "rowsPerTable": rows, "tables": tables, "skipped": skipped}


def _table_name(node: Node, existing: dict[str, Any]) -> str:
    """A short, unique SQL name for the browser: the model name, or source_table for sources."""
    base = node.name if node.type != "source" else f"{node.extra.get('source_name', 'src')}__{node.name}"
    base = re.sub(r"[^A-Za-z0-9_]", "_", base).lower()
    used = {entry["table"] for entry in existing.values()}
    name, index = base, 2
    while name in used:
        name = f"{base}_{index}"
        index += 1
    return name


NUMERIC = re.compile(r"^(tinyint|smallint|integer|int|bigint|hugeint|ubigint|uinteger|usmallint|utinyint|"
                     r"float|double|real|decimal.*|numeric.*)$", re.I)
TEMPORAL = re.compile(r"^(date|timestamp.*|time.*)$", re.I)


def _profile(connection: Any, relation: str, node: Node) -> None:
    for column in node.columns:
        name = _quote(column.name)
        kind = (column.type or "").strip()
        numeric = bool(NUMERIC.match(kind))
        temporal = bool(TEMPORAL.match(kind))
        parts = ["count(*)", f"count({name})", f"approx_count_distinct({name})"]
        if numeric or temporal:
            parts += [f"min({name})", f"max({name})"]
        if numeric:
            parts += [f"avg({name})"]
        try:
            row = connection.execute(f"select {', '.join(parts)} from {relation}").fetchone()
        except Exception:  # noqa: BLE001 - unusual types (structs, lists) are skipped
            continue
        if row is None:
            continue
        total, non_null, distinct = int(row[0]), int(row[1]), int(row[2])
        profile: dict[str, Any] = {
            "rows": total,
            "nulls": total - non_null,
            "distinct": min(distinct, non_null),
        }
        if numeric or temporal:
            profile["min"] = _plain(row[3])
            profile["max"] = _plain(row[4])
        if numeric and row[5] is not None:
            profile["mean"] = round(float(row[5]), 4)
        if not numeric and 0 < distinct <= 50:
            try:
                top = connection.execute(
                    f"select {name}::varchar as value, count(*) as n from {relation} "
                    f"where {name} is not null group by 1 order by 2 desc, 1 limit 8"
                ).fetchall()
                profile["top"] = [[str(value), int(count)] for value, count in top]
            except Exception:  # noqa: BLE001
                pass
        column.profile = profile


def _plain(value: Any) -> Any:
    if value is None or isinstance(value, (int, float, str, bool)):
        return value
    return str(value)
