# Lineum

Data lineage documentation for dbt projects. Open source under Apache-2.0.

> **Status: planning.** There is no release and nothing to install from PyPI yet. The code in this repository is a placeholder command-line tool that only reports its version. Nothing described under "Planned" exists today.

## Planned

Lineum aims to turn a dbt project's compiled artifacts (`manifest.json`, `catalog.json`) into a static documentation site you can host anywhere, centred on lineage:

- a model-level lineage graph with upstream and downstream tracing;
- column-level lineage, showing where each column comes from;
- model and column pages with descriptions, types and tests;
- search across models, sources and columns.

Each item becomes real only when it is implemented, tested and listed in [CHANGELOG.md](CHANGELOG.md). The [roadmap](docs/roadmap.md) holds the milestones and their acceptance criteria.

## Try the placeholder

Requires Python 3.10 or later.

```sh
git clone https://github.com/zinnoberHaus/lineum.git
cd lineum
python -m pip install -e .
lineum --version
python -m unittest discover -s tests
```

`lineum build` exists only to reserve the command; it exits with status 2 and says it is not implemented.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/lineum/` | The Python package and CLI entry point |
| `tests/` | Unit tests (standard library `unittest`) |
| `docs/` | Roadmap and design decisions |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). Lineum is a Zinnober Haus project. It is not affiliated with or endorsed by dbt Labs; dbt is a trademark of dbt Labs, Inc.
