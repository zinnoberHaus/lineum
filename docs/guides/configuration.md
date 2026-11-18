# Configuration

Lineum works without configuration. To change its defaults, add `lineum.yml` (or `lineum.yaml`) next to `dbt_project.yml`. Command-line flags override the file. Unknown settings are an error, so typos do not pass silently.

| Setting | Flag | Default | Effect |
| --- | --- | --- | --- |
| `title` | `--title` | project name | Site title |
| `base_url` | `--base-url` | none | Canonical URLs, `sitemap.xml`, absolute links in `llms.txt` |
| `noindex` | `--noindex` | `false` | Ask search engines not to index |
| `sql` | `--no-sql` | `true` | Include raw and compiled SQL |
| `column_lineage` | `--no-column-lineage` | `true` | Parse SQL for column lineage |
| `exclude_packages` | `--exclude-package` (repeatable) | none | Leave out nodes from these dbt packages |
| `layers` | — | see below | Map models to layers by name or path patterns |
| `data.duckdb` | `--data` | none | Export sample rows and profiles from this DuckDB file |
| `data.rows` | `--data-rows` | `5000` | Rows per exported table |
| `queries` | — | none | Example queries for the SQL page (`title`, `sql`) |
| `head_html` | `--head-html FILE` | none | HTML added to every page's `<head>` (analytics, fonts) |

Sample data set in `lineum.yml` is skipped with a warning when the DuckDB file or the `duckdb` package is missing; `--data` on the command line makes that an error.

## Layers

Models are placed in layers by name and path patterns (shell-style, case-insensitive), first match wins:

| Layer | Default patterns |
| --- | --- |
| staging | `stg_*`, `base_*`, `*/staging/*`, `*/base/*` |
| intermediate | `int_*`, `*/intermediate/*` |
| marts | `fct_*`, `fact_*`, `dim_*`, `mart_*`, `agg_*`, `rpt_*`, `report_*`, `obt_*`, `*/marts/*`, `*/mart/*` |

Anything else is *other models*. Sources, seeds, snapshots, exposures and the semantic layer have their own layers. Override per model with `meta: {lineum: {layer: marts}}`.

```yaml
layers:
  staging: ["src_*", "*/sources/*"]
  marts: ["*/reporting/*"]
```
