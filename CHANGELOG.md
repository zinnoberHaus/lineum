# Changelog

## 0.1.0 (preview, not on PyPI)

First working version. Install from GitHub; see the README.

- `lineum build` reads `manifest.json` (dbt Core 1.5+, schema v9–v12) and, when present, `catalog.json`, `run_results.json` and `sources.json`, and writes a static site with a server-rendered page for every model, source, seed, snapshot, exposure, metric, semantic model and saved query, plus `sitemap.xml` (with `--base-url`), `robots.txt`, `llms.txt`, `llms-full.txt` and JSON-LD.
- Lineage explorer: focus and depth controls, `+N` expanders for hidden parents and children, flow and layer-band layouts, 14 colour-by modes with a legend that selects or hides, trace upstream/downstream/both with an animated tracer, paths between two nodes, undo and redo, URL state, ⌘K to add nodes, keyboard shortcuts, inspector with details, columns, impact and SQL.
- Right-click menus on nodes, columns, the canvas, selections, the sidebar tree, search results and links.
- Column-level lineage from compiled SQL with sqlglot, labelled direct, renamed, derived or aggregated, through CTEs, subqueries, unions and ephemeral models; parallel parsing for large projects.
- Graph analytics: upstream and downstream reach, depth, fan-in and fan-out, exposures reached, impact score, critical path of the last run, and a run timeline (Gantt chart of the last dbt run by thread, critical path outlined) on the overview.
- Health score over seven coverage dimensions with findings; `lineum check --fail-under`.
- SQL page with DuckDB-WASM over `nodes`, `edges`, `columns`, `column_edges` and `tests`, plus sample data exported with `--data` from DuckDB warehouses; charts and CSV export.
- `lineum serve`, `lineum dev`, `lineum impact`, `lineum lineage` and `lineum export` (JSON, Mermaid, DOT).
- Large projects: a synthetic 2,700-model, 300-source project builds in about 1.5 s; the explorer opens on the most depended-on model and shows every node in under a second with the band layout. A stale catalog no longer drops a model's column lineage, and SQL parsing falls back to one process when worker processes cannot start.
- `lineum.yml` configuration: title, base URL, noindex, SQL, excluded packages, layer rules, sample data, example queries, head HTML.
- Example project `examples/larkspur` (DuckDB, synthetic data) with committed artifacts; live demo at https://lineum-demo.vercel.app.
