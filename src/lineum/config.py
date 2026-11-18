"""Optional project configuration in ``lineum.yml`` next to dbt_project.yml.

Every setting has a command-line flag; flags win over the file. Example:

.. code-block:: yaml

    title: Larkspur data docs
    base_url: https://docs.example.com/
    exclude_packages: [dbt_project_evaluator]
    layers:
      staging: ["stg_*", "*/staging/*"]
      marts: ["fct_*", "dim_*", "*/marts/*"]
    data:
      duckdb: warehouse.duckdb
      rows: 5000
    queries:
      - title: Revenue by month
        sql: select date_trunc('month', ordered_at) as month, sum(net_revenue) from fct_orders group by 1 order by 1
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

FILE_NAMES = ("lineum.yml", "lineum.yaml")


class ConfigError(Exception):
    pass


@dataclass
class Config:
    title: str | None = None
    base_url: str | None = None
    noindex: bool = False
    include_sql: bool = True
    column_lineage: bool = True
    exclude_packages: list[str] = field(default_factory=list)
    layers: dict[str, list[str]] = field(default_factory=dict)
    data_duckdb: str | None = None
    data_required: bool = False  # True when --data was passed: a missing file is an error
    data_rows: int = 5000
    head_html: str = ""
    queries: list[dict[str, str]] = field(default_factory=list)
    path: Path | None = None


def load(project_dir: Path) -> Config:
    for name in FILE_NAMES:
        path = project_dir / name
        if path.exists():
            return _parse(path)
    return Config()


def _parse(path: Path) -> Config:
    try:
        import yaml
    except ImportError as error:  # pragma: no cover
        raise ConfigError("Reading lineum.yml needs PyYAML: pip install pyyaml") from error
    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as error:
        raise ConfigError(f"{path} is not valid YAML: {error}") from error
    if not isinstance(raw, dict):
        raise ConfigError(f"{path} must contain a mapping of settings.")
    known = {"title", "base_url", "noindex", "sql", "column_lineage", "exclude_packages", "layers", "data", "head_html",
             "queries"}
    unknown = sorted(set(raw) - known)
    if unknown:
        raise ConfigError(f"Unknown setting(s) in {path.name}: {', '.join(unknown)}.")
    config = Config(path=path)
    config.title = _str(raw.get("title"), "title")
    config.base_url = _str(raw.get("base_url"), "base_url")
    config.noindex = bool(raw.get("noindex", False))
    config.include_sql = bool(raw.get("sql", True))
    config.column_lineage = bool(raw.get("column_lineage", True))
    config.head_html = _str(raw.get("head_html"), "head_html") or ""
    excluded = raw.get("exclude_packages") or []
    if not isinstance(excluded, list):
        raise ConfigError("exclude_packages must be a list of package names.")
    config.exclude_packages = [str(p) for p in excluded]
    layers = raw.get("layers") or {}
    if not isinstance(layers, dict) or not all(isinstance(v, list) for v in layers.values()):
        raise ConfigError("layers must map a layer name to a list of name or path patterns.")
    config.layers = {str(k): [str(p) for p in v] for k, v in layers.items()}
    data: Any = raw.get("data") or {}
    if not isinstance(data, dict):
        raise ConfigError("data must be a mapping with `duckdb` and optional `rows`.")
    if data.get("duckdb"):
        database = Path(str(data["duckdb"]))
        config.data_duckdb = str(database if database.is_absolute() else path.parent / database)
    if data.get("rows") is not None:
        config.data_rows = int(data["rows"])
    queries = raw.get("queries") or []
    if not isinstance(queries, list) or not all(isinstance(q, dict) and q.get("title") and q.get("sql") for q in queries):
        raise ConfigError("queries must be a list of mappings with `title` and `sql`.")
    config.queries = [{"title": str(q["title"]), "sql": str(q["sql"]).strip()} for q in queries]
    return config


def _str(value: Any, name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ConfigError(f"{name} must be a string.")
    return value
