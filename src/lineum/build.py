"""Turn a dbt project's artifacts into an analysed project, and into a site."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lineum import analysis, artifacts, columns, data, health, site
from lineum.config import Config
from lineum.model import Project
from lineum.project import BuildOptions, build_project


@dataclass
class Analysed:
    project: Project
    summary: dict[str, Any]
    health: dict[str, Any]
    column_stats: dict[str, int] = field(default_factory=dict)
    seconds: float = 0.0


@dataclass
class BuildResult:
    analysed: Analysed
    out_dir: Path
    pages: int
    payload_bytes: int
    data: dict[str, Any] | None
    seconds: float


def analyse(project_dir: Path, target_dir: Path | None, config: Config, *,
            column_lineage: bool = True, workers: int | None = None) -> Analysed:
    started = time.perf_counter()
    loaded = artifacts.load(project_dir, target_dir)
    project = build_project(loaded, BuildOptions(exclude_packages=config.exclude_packages,
                                                 include_sql=config.include_sql, layer_rules=config.layers,
                                                 title=config.title))
    column_stats: dict[str, int] = {}
    if column_lineage and config.column_lineage:
        column_stats = columns.compute(project, workers=workers)
    summary = analysis.analyse(project)
    report = health.assess(project)
    return Analysed(project, summary, report, column_stats, time.perf_counter() - started)


def build_site(project_dir: Path, out_dir: Path, config: Config, *, target_dir: Path | None = None,
               column_lineage: bool = True, workers: int | None = None) -> BuildResult:
    started = time.perf_counter()
    analysed = analyse(project_dir, target_dir, config, column_lineage=column_lineage, workers=workers)
    site.prepare_output(out_dir)
    exported = None
    if config.data_duckdb:
        database = Path(config.data_duckdb)
        try:
            if not database.exists():
                raise data.DataError(f"No DuckDB database at {database}.")
            exported = data.export(analysed.project, database, out_dir / "data", rows=config.data_rows)
            # Profiles and row counts changed the project; recompute the summary they feed.
            analysed.summary = analysis.analyse(analysed.project)
        except data.DataError as error:
            if config.data_required:  # asked for on the command line: fail loudly
                raise
            analysed.project.warnings.append(f"Skipped the sample data set in lineum.yml: {error}")
    written = site.write(
        analysed.project, analysed.summary, analysed.health, out_dir,
        site.SiteOptions(title=config.title, base_url=config.base_url, noindex=config.noindex,
                         include_sql=config.include_sql, head_html=config.head_html, data=exported,
                         queries=config.queries),
    )
    return BuildResult(analysed, out_dir, written["pages"], written["bytes"], exported, time.perf_counter() - started)
