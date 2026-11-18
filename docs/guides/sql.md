# SQL in the browser

The SQL page runs [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) in your browser. It loads from jsDelivr (version 1.32.0) the first time the page opens and is cached afterwards. Queries never leave the page.

## Metadata tables (every site)

| Table | One row per | Useful columns |
| --- | --- | --- |
| `nodes` | model, source, seed, snapshot, exposure, metric… | `id`, `name`, `type`, `layer`, `materialized`, `owner`, `dbt_group`, `access`, `tags`, `has_description`, `column_count`, `described_columns`, `test_count`, `failing_tests`, `run_status`, `run_seconds`, `rows`, `upstream`, `downstream`, `depth`, `fan_in`, `fan_out`, `exposures`, `impact`, `on_critical_path`, `freshness` |
| `edges` | dependency | `parent`, `child`, `parent_name`, `child_name` |
| `columns` | column | `node_id`, `node`, `name`, `type`, `description`, `has_description`, `is_primary_key`, `test_count`, `nulls`, `distinct_values` |
| `column_edges` | column lineage edge | `source`, `source_node`, `source_column`, `target`, `target_node`, `target_column`, `transform` |
| `tests` | data or unit test | `node_id`, `node`, `kind`, `column_name`, `status`, `severity`, `failures` |

Recursive queries work, so you can walk lineage in SQL:

```sql
-- Every source column that feeds fct_orders.net_revenue
with recursive trace(node_id, col, depth) as (
  select 'model.larkspur.fct_orders', 'net_revenue', 0
  union all
  select e.source, e.source_column, t.depth + 1
  from column_edges e join trace t on e.target = t.node_id and lower(e.target_column) = lower(t.col)
)
select n.name, t.col, t.depth from trace t join nodes n on n.id = t.node_id order by depth;
```

## Sample data (optional)

`lineum build --data warehouse.duckdb` reads every model, seed, snapshot and source from a DuckDB database (opened read-only), writes up to `--data-rows` rows each (default 5,000; a seeded random sample when a table is larger) to `data/*.parquet`, and profiles every column (nulls, distinct values, min, max, mean, top values). Each export becomes a view named after the model (sources as `source_table`), and `{{ ref('model') }}` or `{{ source('src', 'table') }}` resolve to it.

Sample data needs the site to be served over HTTP (`lineum serve` or any host); browsers block it from `file://`. It is a sample: aggregates over sampled tables are not the real totals unless the whole table fit.

Only DuckDB warehouses can be exported today. Exported rows are published with the site: do not export tables with personal or confidential data to a public host.

## Example queries

The *Example queries* menu has queries for every project. Add your own in `lineum.yml`:

```yaml
queries:
  - title: Revenue by month
    sql: select date_trunc('month', ordered_at) as month, sum(net_revenue) as revenue from fct_orders group by 1 order by 1
```

Results show as a table or, when the first column is a label or date and another is a number, a chart. *Copy CSV* and *Download* export them.
