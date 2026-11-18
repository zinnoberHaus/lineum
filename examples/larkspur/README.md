# Larkspur Outfitters (example dbt project)

A fictional outdoor-gear retailer that sells online, in five stores and through a membership club. The project is a realistic shape for trying Lineum: 49 models across staging, intermediate (two of them ephemeral) and marts, 21 sources with freshness rules, 2 seeds, a snapshot, 5 exposures, a semantic model with 4 metrics, groups and owners, a model contract, doc blocks, data tests, singular tests and a unit test. All data is synthetic and generated from a fixed seed.

The dbt artifacts in `target/` are committed, so Lineum builds the example without dbt:

```sh
lineum build examples/larkspur --out /tmp/larkspur-docs
lineum serve /tmp/larkspur-docs
```

`lineum.yml` sets the title, the demo's public URL, example queries and the sample data export.

## Rebuild the artifacts

Needs `dbt-core` 1.10 or 1.11 and `dbt-duckdb`:

```sh
pip install "dbt-core>=1.10,<1.12" dbt-duckdb
cd examples/larkspur
./build_artifacts.sh
```

The script generates `larkspur.duckdb` with `generate_data.py`, runs `dbt source freshness`, `dbt build` and `dbt docs generate`, keeps the build's `run_results.json`, and strips machine-specific paths from the artifacts. One singular test warns and some sources are stale on purpose, so the site has something to show.

## The live demo

<https://lineum-demo.vercel.app> is this project, built with the sample data:

```sh
cd examples/larkspur && ./build_artifacts.sh && cd ../..
pip install -e ".[data]"
lineum build examples/larkspur            # writes examples/larkspur/target/lineum
vercel deploy examples/larkspur/target/lineum --prod
```
