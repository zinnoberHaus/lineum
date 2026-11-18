# Column lineage

Lineum derives column lineage from each model's compiled SQL. No dbt artifact contains column lineage, so Lineum parses the SQL with [sqlglot](https://github.com/tobymao/sqlglot) using your adapter's dialect and the column lists from `catalog.json` (or your YAML when there is no catalog).

## What each label means

| Label | Meaning | Example |
| --- | --- | --- |
| direct | Passed through unchanged. Casts count as unchanged. | `customer_id`, `cast(order_id as integer)` |
| renamed | Passed through under another name. | `id as order_id` |
| derived | Computed by a function, operator, `case` or window. | `amount_cents / 100.0 as amount` |
| aggregated | Computed by an aggregate function. | `sum(amount) as paid` |

When a column passes through several steps (CTEs, subqueries), the strongest step wins: a rename followed by a sum is *aggregated*.

## What Lineum follows

CTEs, subqueries, joins, `union` and `union all` (each branch), `select *` (expanded with the catalog), qualified stars (`orders.*`), window functions, `filter (where …)`, and ephemeral models. dbt inlines an ephemeral model as a `__dbt__cte__` CTE; Lineum cuts it out so lineage stops at the ephemeral model, as the model graph does.

## What it does not do

- **It never guesses.** A column whose sources cannot be resolved gets no edge. Literals and `count(*)` have no source columns.
- **Python models** and SQL that does not parse get no column lineage. The model page says why.
- **Macros** that run SQL at execution time (not in the compiled code) are invisible.
- Columns read only in `where`, `join` or `group by` clauses are not edges; Lineum tracks where output values come from.

## Using it

- On a model page, *Comes from* lists each column's sources; *feeds N* opens the downstream trace.
- In the explorer, show a node's columns (`C`) and click a column to trace it. Traced columns are highlighted on every node; edges are styled by label (solid direct, dashed renamed, dotted derived, thick aggregated).
- In the terminal: `lineum lineage fct_orders --column net_revenue`, `lineum impact raw.orders --column amount_cents`.
- In SQL: the `column_edges` table holds every edge; the column menu's *Where it comes from, in SQL* writes the recursive query for you.

## Performance

Lineum parses each model once and resolves all its columns in one pass. Projects with more than 150 SQL models are parsed in parallel processes. `--no-column-lineage` skips it entirely.
