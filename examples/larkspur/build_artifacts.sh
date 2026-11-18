#!/usr/bin/env sh
# Rebuild the example's dbt artifacts from scratch.
# Requires dbt-core and dbt-duckdb (pip install dbt-duckdb). Run from this directory.
set -eu
export DBT_SEND_ANONYMOUS_USAGE_STATS=false
rm -f larkspur.duckdb
python generate_data.py
# Freshness first: every dbt command rewrites manifest.json, and only docs generate keeps compiled SQL.
dbt source freshness --profiles-dir . || true   # some sources are stale by design
cp target/sources.json target/sources.keep.json
dbt build --profiles-dir . || true              # one singular test warns by design
cp target/run_results.json target/run_results.keep.json
dbt docs generate --profiles-dir .
mv target/run_results.keep.json target/run_results.json
mv target/sources.keep.json target/sources.json
# Drop machine-specific absolute paths before the artifacts are committed.
python - <<'PY'
import json, os
root = os.getcwd()
for name in ("manifest.json", "run_results.json", "catalog.json", "sources.json"):
    path = os.path.join("target", name)
    text = open(path).read().replace(root, ".")
    json.loads(text)  # still valid JSON
    open(path, "w").write(text)
PY
echo "Artifacts written to target/: manifest.json, catalog.json, run_results.json, sources.json"
