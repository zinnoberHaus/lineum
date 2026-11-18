# Getting started

## 1. Install

Lineum needs Python 3.10 or later. It is not on PyPI yet, so install it from GitHub:

```sh
pipx install "git+https://github.com/zinnoberHaus/lineum"
lineum --version
```

`uvx --from git+https://github.com/zinnoberHaus/lineum lineum build` runs it once without installing. In a project that pins its tools, add `lineum @ git+https://github.com/zinnoberHaus/lineum` to your requirements.

## 2. Produce the artifacts

Lineum reads what dbt writes to `target/`. Any of these commands writes a manifest with compiled SQL, which column lineage needs:

```sh
dbt docs generate     # also writes catalog.json: column types and table sizes
dbt build             # also writes run_results.json: run status, timings, test results
dbt source freshness  # writes sources.json: source freshness
```

Run them in the order you like; Lineum reads whichever files are there. Every dbt command rewrites `manifest.json`, so run `dbt docs generate` last if you want the catalog and compiled SQL to match.

Supported: dbt Core 1.5 and later (manifest v9 to v12) on any adapter. Column lineage needs a SQL dialect sqlglot knows; the adapter name picks it (Snowflake, BigQuery, Databricks, Redshift, Postgres, DuckDB, Trino, Spark, ClickHouse, SQL Server and others).

## 3. Build and preview

```sh
lineum build          # → target/lineum
lineum serve          # → http://127.0.0.1:8000
```

While you work on models, `lineum dev` builds, serves and rebuilds whenever dbt rewrites its artifacts.

## 4. Look around

- **Overview**: the whole project in layer bands, the most depended-on models, exposures, health and the last run's critical path.
- **Model pages**: columns with their sources, tests, SQL, upstream and downstream, and an embedded lineage view.
- **Lineage**: the explorer. Right-click anything; press `?` for shortcuts.
- **Health**: coverage and findings.
- **SQL**: query the project with DuckDB in the browser.

Search with `⌘K` (or `Ctrl K`, or `/`) from any page.

## 5. Publish

See [deploying](deploying.md). Set `--base-url` to the address you publish at.
