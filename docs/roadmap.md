# Roadmap

A milestone is done when its acceptance criteria are met and verified in CI. A roadmap entry is not a delivery commitment.

## Done in 0.1 (preview)

- **M0 Package and CI.** Installable package, CLI, tests on Python 3.10 and 3.13.
- **M1 Read dbt artifacts.** Manifest v9–v12, catalog, run results and source freshness into a typed graph of models, sources, seeds, snapshots, analyses, exposures, metrics, semantic models, saved queries and functions; tests and unit tests attached to the nodes they test; clear errors for missing or unsupported artifacts.
- **M2 Static site with model lineage.** Server-rendered page per node; the lineage explorer with incremental expansion, colour-by modes, tracing, path finding, right-click menus, shortcuts and URL state; works from disk and from any static host; browser checks of the explorer in CI-like runs.
- **M3 Column lineage.** sqlglot-based tracing through CTEs, subqueries, unions and ephemeral models with direct, renamed, derived and aggregated labels; unresolved columns shown as unknown; tests for each case.
- **Health, impact and SQL.** `lineum check`, `lineum impact`, `lineum lineage`, `lineum export`; DuckDB-WASM SQL page over project metadata and optional DuckDB sample data.

## Next

- **M4 First release.** Publish 0.1.0 to PyPI after the release-readiness checklist passes and the maintainer approves.
- **M5 Wider data sources.** Sample data and profiles from Snowflake, BigQuery, Postgres and Databricks through the user's dbt connection; dbt v2 (Fusion) Parquet metadata.
- **M6 Change review.** Compare two manifests and show added, removed and changed nodes and columns, with downstream impact, for pull requests.
- **M7 Large projects.** Data split per page for projects over 5,000 nodes; an aggregated overview by folder and layer; a WebGL canvas when DOM rendering is too slow.
- **M8 Offline SQL.** Optionally ship DuckDB-WASM inside the site.
- Accessibility testing with NVDA, JAWS and VoiceOver; an MCP server for coding agents.
