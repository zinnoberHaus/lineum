# Agent operating context

Lineum is a public, Apache-2.0 repository. Everything committed here is visible to anyone.

## Status

Planning. The package is a placeholder CLI. Do not describe planned features as available, and do not claim a PyPI release, user counts, benchmarks or integrations that are not real. Mark the product as planning until an installable implementation has been verified.

## Boundaries

- Keep marketing copy, positioning, internal research and brand source files out of this repository; they live in private repositories.
- Never commit credentials, warehouse connection details, private dbt projects or customer data. Test fixtures must be synthetic.
- Do not publish to PyPI, create releases or change repository settings without the maintainer's explicit approval.

## Checks

```sh
python -m pip install -e .
python -m unittest discover -s tests
```

Pull requests follow `.github/pull_request_template.md`. Sign off commits (`git commit -s`).
