# Contributing

Lineum welcomes issues, documentation, research and code. It is a 0.1 preview: read the [roadmap](docs/roadmap.md) and the [architecture decision](docs/decisions/0001-architecture.md) before proposing a change, and open an issue describing the user problem, the dbt artifacts involved and the observable behaviour you expect.

For a bug, include a reproducible example, expected and actual results, and the Lineum, dbt and Python versions. Remove secrets, credentials and private data (including warehouse names and SQL you may not share). Report vulnerabilities through [SECURITY.md](SECURITY.md).

Work in a branch and submit a focused pull request. Explain what changed, why, and the checks you ran:

```sh
python -m pip install -e ".[dev,data]"
python -m unittest discover -s tests -t .
ruff check src tests

# Browser app (Node 22, pnpm 10)
cd web
pnpm install
pnpm test
pnpm build    # updates src/lineum/static/; commit it with your change
```

To regenerate the example's artifacts, install `dbt-duckdb` and run `examples/larkspur/build_artifacts.sh`.

Update affected documentation. Cite primary sources for research and keep evidence separate from proposals.

Contributions use the repository's license. You must have the right to submit the material and preserve third-party notices. Sign off each commit with `git commit -s` to certify the [Developer Certificate of Origin](https://developercertificate.org/). A signoff is not a copyright transfer. Do not add a signoff for another person.

AI-assisted contributions are welcome. The submitting contributor remains responsible for correctness, provenance, security and validation. Describe meaningful agent involvement and verification in the pull request.

Follow [GOVERNANCE.md](GOVERNANCE.md) and the [code of conduct](CODE_OF_CONDUCT.md).
