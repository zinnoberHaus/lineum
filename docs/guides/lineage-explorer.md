# The lineage explorer

The explorer (`lineage.html`) works like a link-analysis tool: start from a node and grow the graph where you need it, rather than drawing the whole project at once.

## Growing the graph

- **Focus** on a node (double-click, `F`, or *Focus here*) to show it with N levels up and down. The **Up** and **Down** steppers in the toolbar change N.
- Each node shows **`+N` pills** for hidden neighbours: blue on the upstream side, amber on the downstream side. Click one to add that level.
- *Expand* in a node's menu adds parents, children, or everything upstream or downstream.
- **Add node** (`⌘K`) finds any model, source, exposure or column and puts it on the canvas.
- *Hide* removes nodes, everything upstream or downstream of a node, or everything not connected to it. Legend entries hide a whole category.
- **Undo and redo** (`⌘Z`, `⇧⌘Z`) step through changes to the canvas.

The URL keeps the focus, depth, trace and colour mode, so a view can be shared.

## Tracing

*Trace* (`T`) lights up everything upstream, downstream or both of a node. An animated tracer line runs along those edges in the direction data flows; everything else dims. With two nodes selected, `T` shows **every path between them**. Click a column inside a node to trace that column instead (see [column lineage](column-lineage.md)). `Esc` clears the trace.

## Colour by

| Mode | Shows |
| --- | --- |
| Layer | Sources, staging, intermediate, marts, semantic layer, exposures (cool to warm, in flow order) |
| Resource type | Model, source, seed, snapshot, exposure, metric, semantic model |
| Materialization | view, table, incremental, ephemeral, … |
| Test status | Passing, warning, failing, not tested |
| Run time | Execution time in the last run, in quintiles |
| Freshness | Fresh or stale sources, and every node built from a stale source |
| Blast radius | Number of downstream nodes, in quintiles |
| Row count | Rows from the catalog or the sample export |
| Documentation | Fully, partly or not described |
| Owner, Folder, Package, Access, Tag | The values themselves |

Click a legend row to select those nodes; click its eye to hide them.

## Right-click menus

| On | Actions |
| --- | --- |
| A node | Open documentation, focus, expand, trace, select (upstream, downstream, connected, same colour), show columns, paths from the selection, analyze (impact, downstream in SQL, preview rows, profile), copy (name, unique id, `ref()`/`source()`, relation, dbt selectors, `dbt build` command, link), hide |
| A column | Trace upstream, downstream or both; where it comes from (recursive SQL); value distribution; nulls and distinct values; copy |
| The canvas | Add a node, fit, lay out again, layout and direction, colour by, show every node, columns on every node, clear trace, undo, redo, export (dbt selector, Mermaid, link), shortcuts |
| A selection | Show columns, show only these, hide, expand all, paths between two, copy names or selector |

The same node menu opens from the sidebar tree, search results and every node link on other pages.

## Shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | Select parents / children |
| `⇧←` / `⇧→` | Select everything upstream / downstream |
| `[` / `]` | Show parents / children of the selection |
| `T` | Trace (two selected: paths between them) |
| `C` | Show or hide columns |
| `I` | Impact analysis |
| `F` | Focus |
| `H`, `Delete` | Hide |
| `↵` | Open documentation |
| `⌘A`, `⌘I` | Select all, invert selection |
| `0`, `Home` | Fit to screen |
| `L` | Lay out again |
| `?` | Show shortcuts |
| `Esc` | Clear the trace, then the selection |

## Layouts

*Flow* places nodes by dependency (dagre). *Layers* puts each layer in its own band, left to right, so a project reads as sources → staging → intermediate → marts → exposures. Both work left to right or top to bottom.
