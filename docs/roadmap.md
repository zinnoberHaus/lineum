# Roadmap

A milestone is done only when its acceptance criteria are met and verified in CI. A roadmap entry is not a delivery commitment.

## M0: Placeholder (current)

- [x] Package skeleton, `lineum --version`, unit tests and CI.

## M1: Read dbt artifacts

- Parse `manifest.json` and `catalog.json` from a dbt Core project into a typed in-memory graph of models, sources, seeds, snapshots and columns.
- Acceptance: tests against synthetic fixtures for each supported manifest schema version; a clear error for unsupported versions.

## M2: Static site with model lineage

- `lineum build` writes a static site: model pages and an interactive model-level lineage graph with upstream and downstream tracing.
- Acceptance: the site works when opened from disk and from a static host, with no server; keyboard-accessible graph navigation; a browser test in CI.

## M3: Column-level lineage

- Derive column lineage from compiled SQL and show it on model pages and in the graph.
- Acceptance: documented accuracy limits; tests covering direct, renamed, derived and aggregated columns; unresolved columns shown as unknown rather than guessed.

## M4: First preview release

- Publish to PyPI as a 0.1 preview after the release-readiness checklist passes.
