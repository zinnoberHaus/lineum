# 0001: Architecture of the 0.1 preview

Status: accepted, 2026-11-18.

## Context

Lineum turns dbt artifacts into documentation centred on lineage. Its users run dbt in Python environments and host docs on whatever is at hand, often a static host, sometimes nothing but a shared folder. They expect a modern, interactive lineage view, and many want the docs to be findable by search engines and readable by AI agents.

## Decisions

1. **A Python CLI with no Node at run time.** `lineum` is a Python package with three runtime dependencies: sqlglot, markdown-it-py and PyYAML. The browser app is built from `web/` with Vite and committed to `src/lineum/static/`, so `pip install` from Git or a wheel needs no JavaScript toolchain. CI checks that the committed build matches the source.

2. **Every page is server-rendered HTML.** Python writes one HTML file per page (overview, lineage, health, SQL and every node) with its title, description, columns, links and JSON-LD. The React app then mounts over that content. This gives search engines and agents real content, a working site without JavaScript, and correct deep links on any static host without rewrite rules. The rendering is duplicated in Python and React by design; the Python pages are simple and cover content, not interaction.

3. **One classic script and a data script, so `file://` works.** Browsers block module scripts and `fetch()` from `file://`. The app is built as a single IIFE bundle (`assets/lineum.js`) and the data is assigned in `assets/data.js` (`window.__LINEUM__ = …`). Both load with plain `<script>` tags from relative paths. Over HTTP the app navigates with the History API; from disk it follows links.

4. **Column lineage with sqlglot, never guessed.** Each model's compiled SQL is parsed once with the adapter's dialect and the catalog's columns, and every output column is resolved to source columns in one pass. Ephemeral CTEs are cut out so lineage stops at ephemeral models. Unresolvable columns get no edges. Large projects are parsed in a process pool.

5. **Graph analytics in Python.** Reach counts use integer bitsets over a topological order, which handles tens of thousands of nodes in under a second. The critical path weights nodes by execution time from `run_results.json`.

6. **React Flow and dagre for the explorer.** The explorer is modelled on Palantir Foundry's lineage tool: incremental expansion, colour-by modes with a legend, tracing, path finding, undo, right-click menus and keyboard shortcuts. React Flow renders nodes as DOM, which keeps nodes rich (columns, badges) and accessible; `onlyRenderVisibleElements` keeps large canvases responsive. Layout is dagre (flow) or a band layout by layer.

7. **DuckDB-WASM from a CDN, on demand.** The SQL page imports DuckDB-WASM 1.32.0 from jsDelivr only when opened, with the worker created from a Blob URL. Shipping the 7 MB WebAssembly file inside every site was rejected for 0.1; an offline option is on the roadmap. Project metadata is loaded as tables; exported Parquet samples are attached as views over HTTP range requests.

8. **Safety of generated sites.** Descriptions are rendered from Markdown with raw HTML disabled and unsafe link schemes dropped; all page text is escaped. Lineum never deletes an output directory it did not create.

## Consequences

- The browser bundle (~185 KB gzipped plus 66 KB of CSS with the fonts inlined) loads on every page; the data script grows with the project. `--no-sql` removes the largest part of it.
- Changing what the app reads means changing `payload.py`, `web/src/types.ts` and `docs/payload.md` together, and bumping the schema string for breaking changes.
- The SQL page needs network access to jsDelivr.
