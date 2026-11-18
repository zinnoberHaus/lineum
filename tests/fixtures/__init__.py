"""A small synthetic dbt project, written as artifacts, for unit tests.

It covers what Lineum has to handle: sources with freshness, a seed, staging views, an ephemeral model
inlined as a CTE, a union, an aggregate, a contract, generic, singular and unit tests, an exposure, a
metric and a Python model. Everything is invented; no dbt installation is needed.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PKG = "shop"
SCHEMA = "https://schemas.getdbt.com/dbt/manifest/v12.json"


def _model(name: str, sql: str, deps: list[str], *, folder: str, materialized: str = "view",
           description: str = "", columns: dict[str, Any] | None = None, language: str = "sql",
           group: str | None = None, access: str = "protected", contract: bool = False,
           schema: str = "analytics") -> dict[str, Any]:
    return {
        "unique_id": f"model.{PKG}.{name}",
        "resource_type": "model",
        "name": name,
        "package_name": PKG,
        "path": f"{folder}/{name}.sql",
        "original_file_path": f"models/{folder}/{name}.sql",
        "fqn": [PKG, *folder.split("/"), name],
        "database": "db",
        "schema": schema,
        "alias": name,
        "relation_name": None if materialized == "ephemeral" else f'"db"."{schema}"."{name}"',
        "config": {"enabled": True, "materialized": materialized, "tags": [], "meta": {}, "group": group,
                   "access": access, "contract": {"enforced": contract}},
        "tags": [],
        "description": description,
        "columns": columns or {},
        "meta": {},
        "group": group,
        "access": access,
        "contract": {"enforced": contract},
        "language": language,
        "raw_code": sql.replace('"db"."analytics".', "{{ ref('").replace('"db"."raw".', "{{ source('raw', '"),
        "compiled_code": sql if language == "sql" else None,
        "depends_on": {"macros": [], "nodes": deps},
        "primary_key": [],
    }


def manifest() -> dict[str, Any]:
    raw_orders = f"source.{PKG}.raw.orders"
    raw_payments = f"source.{PKG}.raw.payments"
    nodes: dict[str, Any] = {}

    def add(entry: dict[str, Any]) -> None:
        nodes[entry["unique_id"]] = entry

    add(_model("stg_orders", 'select id as order_id, customer_id, amount_cents / 100.0 as amount, created_at from "db"."raw"."orders"',
               [raw_orders], folder="staging", description="Orders, one row per order.",
               columns={"order_id": {"name": "order_id", "description": "Primary key.", "meta": {}, "tags": [], "constraints": []}}))
    add(_model("stg_payments", 'select id as payment_id, order_id, amount from "db"."raw"."payments"',
               [raw_payments], folder="staging"))
    add(_model("int_payments_by_order", 'select order_id, sum(amount) as paid from "db"."analytics"."stg_payments" group by 1',
               [f"model.{PKG}.stg_payments"], folder="intermediate", materialized="ephemeral"))
    add(_model(
        "fct_orders",
        'with __dbt__cte__int_payments_by_order as (select order_id, sum(amount) as paid from "db"."analytics"."stg_payments" group by 1)\n'
        'select o.order_id, o.customer_id, o.amount, coalesce(p.paid, 0) as paid, o.amount - coalesce(p.paid, 0) as balance\n'
        'from "db"."analytics"."stg_orders" as o left join __dbt__cte__int_payments_by_order as p using (order_id)',
        [f"model.{PKG}.stg_orders", f"model.{PKG}.int_payments_by_order"], folder="marts", materialized="table",
        description="Orders with payments. <script>alert(1)</script>", group="finance", access="public", contract=True,
        columns={"order_id": {"name": "order_id", "description": "Order id.", "meta": {}, "tags": [], "constraints": [{"type": "primary_key"}]}},
    ))
    add(_model("all_amounts", 'select order_id as id, amount from "db"."analytics"."stg_orders" union all select payment_id as id, amount from "db"."analytics"."stg_payments"',
               [f"model.{PKG}.stg_orders", f"model.{PKG}.stg_payments"], folder="marts", materialized="table"))
    add(_model("customer_scores", "def model(dbt, session):\n    return dbt.ref('fct_orders')",
               [f"model.{PKG}.fct_orders"], folder="marts", language="python", materialized="table"))
    add(_model("direct_from_source", 'select id, amount_cents from "db"."raw"."orders"', [raw_orders],
               folder="marts", materialized="table"))
    nodes[f"seed.{PKG}.countries"] = {
        "unique_id": f"seed.{PKG}.countries", "resource_type": "seed", "name": "countries", "package_name": PKG,
        "path": "countries.csv", "original_file_path": "seeds/countries.csv", "fqn": [PKG, "countries"],
        "database": "db", "schema": "analytics", "alias": "countries", "relation_name": '"db"."analytics"."countries"',
        "config": {"enabled": True, "materialized": "seed"}, "tags": [], "description": "", "columns": {}, "meta": {},
        "depends_on": {"macros": [], "nodes": []},
    }
    for test_name, column, kind, target in (
        ("unique_stg_orders_order_id", "order_id", "unique", "stg_orders"),
        ("not_null_stg_orders_order_id", "order_id", "not_null", "stg_orders"),
        ("not_null_fct_orders_order_id", "order_id", "not_null", "fct_orders"),
    ):
        nodes[f"test.{PKG}.{test_name}"] = {
            "unique_id": f"test.{PKG}.{test_name}", "resource_type": "test", "name": test_name, "package_name": PKG,
            "config": {"enabled": True, "severity": "ERROR"}, "column_name": column,
            "test_metadata": {"name": kind, "kwargs": {"column_name": column}, "namespace": None},
            "attached_node": f"model.{PKG}.{target}",
            "depends_on": {"macros": [], "nodes": [f"model.{PKG}.{target}"]},
        }
    nodes[f"test.{PKG}.assert_balance_not_negative"] = {
        "unique_id": f"test.{PKG}.assert_balance_not_negative", "resource_type": "test",
        "name": "assert_balance_not_negative", "package_name": PKG, "config": {"enabled": True, "severity": "warn"},
        "depends_on": {"macros": [], "nodes": [f"model.{PKG}.fct_orders"]},
    }
    return {
        "metadata": {"dbt_schema_version": SCHEMA, "dbt_version": "1.11.0", "generated_at": "2026-11-01T00:00:00Z",
                     "project_name": PKG, "adapter_type": "duckdb"},
        "nodes": nodes,
        "sources": {
            raw_orders: {
                "unique_id": raw_orders, "resource_type": "source", "name": "orders", "source_name": "raw",
                "package_name": PKG, "path": "models/staging/sources.yml", "original_file_path": "models/staging/sources.yml",
                "fqn": [PKG, "staging", "raw", "orders"], "database": "db", "schema": "raw", "identifier": "orders",
                "relation_name": '"db"."raw"."orders"', "loader": "fivetran", "loaded_at_field": "created_at",
                "freshness": {"warn_after": {"count": 1, "period": "day"}, "error_after": {"count": None, "period": None}},
                "config": {"enabled": True}, "description": "Raw orders.", "columns": {}, "meta": {}, "tags": [],
            },
            raw_payments: {
                "unique_id": raw_payments, "resource_type": "source", "name": "payments", "source_name": "raw",
                "package_name": PKG, "path": "models/staging/sources.yml", "original_file_path": "models/staging/sources.yml",
                "fqn": [PKG, "staging", "raw", "payments"], "database": "db", "schema": "raw", "identifier": "payments",
                "relation_name": '"db"."raw"."payments"', "config": {"enabled": True}, "description": "",
                "columns": {}, "meta": {}, "tags": [],
            },
        },
        "exposures": {
            f"exposure.{PKG}.finance_dashboard": {
                "unique_id": f"exposure.{PKG}.finance_dashboard", "resource_type": "exposure",
                "name": "finance_dashboard", "label": "Finance dashboard", "package_name": PKG, "type": "dashboard",
                "maturity": "high", "url": "https://bi.example.com/finance", "owner": {"name": "Finance", "email": "f@example.com"},
                "description": "Weekly finance review.", "depends_on": {"macros": [], "nodes": [f"model.{PKG}.fct_orders"]},
                "config": {"enabled": True}, "tags": [], "meta": {},
            }
        },
        "metrics": {
            f"metric.{PKG}.balance": {
                "unique_id": f"metric.{PKG}.balance", "resource_type": "metric", "name": "balance", "label": "Open balance",
                "package_name": PKG, "type": "simple", "type_params": {"measure": {"name": "balance"}},
                "description": "", "depends_on": {"macros": [], "nodes": [f"model.{PKG}.fct_orders"]},
                "config": {"enabled": True}, "tags": [], "meta": {},
            }
        },
        "groups": {f"group.{PKG}.finance": {"name": "finance", "owner": {"name": "Finance team", "email": "f@example.com"}}},
        "semantic_models": {},
        "saved_queries": {},
        "unit_tests": {
            f"unit_test.{PKG}.stg_orders.test_amount": {
                "unique_id": f"unit_test.{PKG}.stg_orders.test_amount", "name": "test_amount", "model": "stg_orders",
                "depends_on": {"macros": [], "nodes": [f"model.{PKG}.stg_orders"]},
            }
        },
        "docs": {f"doc.{PKG}.__overview__": {"block_contents": "# Shop\n\nA **test** project."}},
    }


def catalog() -> dict[str, Any]:
    def entry(uid: str, schema: str, name: str, columns: list[tuple[str, str]], rows: int | None = None) -> dict[str, Any]:
        stats: dict[str, Any] = {"has_stats": {"id": "has_stats", "value": rows is not None, "include": False}}
        if rows is not None:
            stats["row_count"] = {"id": "row_count", "label": "Row count", "value": rows, "include": True}
        return {
            "unique_id": uid,
            "metadata": {"type": "BASE TABLE", "schema": schema, "name": name, "database": "db"},
            "columns": {c: {"name": c, "type": t, "index": i + 1, "comment": None} for i, (c, t) in enumerate(columns)},
            "stats": stats,
        }

    return {
        "metadata": {"dbt_schema_version": "https://schemas.getdbt.com/dbt/catalog/v1.json"},
        "nodes": {
            f"model.{PKG}.stg_orders": entry(f"model.{PKG}.stg_orders", "analytics", "stg_orders",
                                             [("order_id", "INTEGER"), ("customer_id", "INTEGER"), ("amount", "DOUBLE"), ("created_at", "TIMESTAMP")]),
            f"model.{PKG}.stg_payments": entry(f"model.{PKG}.stg_payments", "analytics", "stg_payments",
                                               [("payment_id", "INTEGER"), ("order_id", "INTEGER"), ("amount", "DOUBLE")]),
            f"model.{PKG}.fct_orders": entry(f"model.{PKG}.fct_orders", "analytics", "fct_orders",
                                             [("order_id", "INTEGER"), ("customer_id", "INTEGER"), ("amount", "DOUBLE"),
                                              ("paid", "DOUBLE"), ("balance", "DOUBLE")], rows=120),
        },
        "sources": {
            f"source.{PKG}.raw.orders": entry(f"source.{PKG}.raw.orders", "raw", "orders",
                                              [("id", "INTEGER"), ("customer_id", "INTEGER"), ("amount_cents", "INTEGER"), ("created_at", "TIMESTAMP")]),
            f"source.{PKG}.raw.payments": entry(f"source.{PKG}.raw.payments", "raw", "payments",
                                                [("id", "INTEGER"), ("order_id", "INTEGER"), ("amount", "DOUBLE")]),
        },
    }


def run_results() -> dict[str, Any]:
    def result(uid: str, status: str, seconds: float, **extra: Any) -> dict[str, Any]:
        return {"unique_id": uid, "status": status, "execution_time": seconds,
                "timing": [{"name": "execute", "started_at": "2026-11-01T00:00:00Z", "completed_at": "2026-11-01T00:00:01Z"}],
                "adapter_response": {}, "message": None, "failures": None, **extra}

    return {
        "metadata": {"dbt_schema_version": "https://schemas.getdbt.com/dbt/run-results/v6.json", "generated_at": "2026-11-01T00:01:00Z"},
        "results": [
            result(f"model.{PKG}.stg_orders", "success", 0.5),
            result(f"model.{PKG}.stg_payments", "success", 0.2),
            result(f"model.{PKG}.fct_orders", "success", 2.0),
            result(f"model.{PKG}.all_amounts", "success", 0.1),
            result(f"test.{PKG}.unique_stg_orders_order_id", "pass", 0.1),
            result(f"test.{PKG}.not_null_stg_orders_order_id", "pass", 0.1),
            result(f"test.{PKG}.not_null_fct_orders_order_id", "fail", 0.1, failures=3, message="Got 3 results"),
            result(f"test.{PKG}.assert_balance_not_negative", "warn", 0.1, failures=2),
            result(f"unit_test.{PKG}.stg_orders.test_amount", "pass", 0.3),
        ],
    }


def sources() -> dict[str, Any]:
    return {
        "metadata": {"dbt_schema_version": "https://schemas.getdbt.com/dbt/sources/v3.json"},
        "results": [{"unique_id": f"source.{PKG}.raw.orders", "status": "warn", "max_loaded_at": "2026-10-30T00:00:00Z",
                     "snapshotted_at": "2026-11-01T00:00:00Z", "max_loaded_at_time_ago_in_s": 172800,
                     "criteria": {"warn_after": {"count": 1, "period": "day"}, "error_after": {"count": None, "period": None}}}],
    }


def write_project(directory: Path, *, catalog_file: bool = True, runs: bool = True) -> Path:
    """Write the synthetic project's artifacts to directory/target and return the project directory."""
    target = directory / "target"
    target.mkdir(parents=True, exist_ok=True)
    (directory / "dbt_project.yml").write_text(f"name: {PKG}\nprofile: {PKG}\n")
    (target / "manifest.json").write_text(json.dumps(manifest()))
    if catalog_file:
        (target / "catalog.json").write_text(json.dumps(catalog()))
    if runs:
        (target / "run_results.json").write_text(json.dumps(run_results()))
        (target / "sources.json").write_text(json.dumps(sources()))
    return directory
