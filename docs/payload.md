# Payload reference

Every site has `assets/data.js`, which assigns one object to `window.__LINEUM__`. The browser app reads only this object. It is defined by `src/lineum/payload.py` and typed in `web/src/types.ts`; this page describes it for people building on top of it. `schema` changes when a change would break an older app.

```text
{
  schema: "lineum/1",
  meta: { project, title, generatedAt, lineumVersion, dbtVersion, adapter, dialect,
          artifacts: {manifest: "v12", …}, manifestGeneratedAt, runGeneratedAt, baseUrl,
          sql: bool, data: {enabled, rowsPerTable, tables: {nodeId: {file, table, rows, totalRows, sampled}}},
          queries: [{title, sql}] },
  overview: "<html from the project's __overview__ doc block>",
  layers: [{id, label, rank}],
  groups: [{name, owner, email}],
  nodes: [Node],
  edges: [[parentIndex, childIndex]],
  columnEdges: [[sourceIndex, sourceColumn, targetIndex, targetColumn, "d" | "r" | "x" | "a"]],
  summary: {counts, layers, materializations, columns, edges, columnEdges, tests, testCount, runStatus,
            maxDepth, criticalPath: {nodes, seconds}, keystones, slowest, orphans, totalSeconds},
  health: {score, grade, dimensions: [{id, label, weight, hit, total, score, hint, missing}],
           findings: [{rule, severity, title, detail, nodes}]},
  warnings: [string]
}
```

Edges refer to nodes by their position in `nodes`. Transform codes: `d` direct, `r` renamed, `x` derived, `a` aggregated.

## Node

| Field | Always | Notes |
| --- | --- | --- |
| `id`, `type`, `name`, `package`, `layer`, `url` | yes | `url` is relative to the site root |
| `m` | yes | `{up, down, depth, height, fanIn, fanOut, exposures, impact, critical?}` |
| `label`, `path`, `folder`, `description`, `html`, `tags`, `meta`, `owner`, `group`, `access` | when set | `html` is the description rendered safely |
| `materialized`, `database`, `schema`, `alias`, `relation`, `language`, `version`, `contract` | when set | |
| `columns` | when known | `{name, type?, description?, html?, meta?, tags?, pk?, tests?: [index into tests], profile?}` |
| `tests` | when any | `{id, name, kind, status, column?, severity?, failures?, message?, seconds?, references?}` |
| `run` | after a run | `{status, seconds, at, rows?, message?}` |
| `stats` | with a catalog | `{kind, rows?, bytes?}` |
| `freshness` | sources | `{configured, status?, maxLoadedAt?, checkedAt?, ageSeconds?, warnAfter?, errorAfter?}` |
| `columnLineage` | when unavailable | Why column lineage is missing for this model |
| `sql` | unless `--no-sql` | `{raw?, compiled?}` |
| `x` | type-specific | sources: `source_name`, `loader`; exposures: `exposure_type`, `maturity`, `link`, `owner_email`; metrics: `metric_type`, `measure`, `expression`, `numerator`, `denominator`; semantic models: `entities`, `dimensions`, `measures`; models: `column_lineage: {resolved, total}` |

`lineum export --format json` writes the same object without SQL, optionally limited to a node's neighbourhood.
