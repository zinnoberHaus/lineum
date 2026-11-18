# Contributing

Lineum welcomes issues, documentation, research and code. The project is in planning: read the [roadmap](docs/roadmap.md) before proposing a change, and open an issue describing the user problem, the dbt artifacts involved and the observable behaviour you expect.

For a bug, include a reproducible example, expected and actual results, and the Lineum, dbt and Python versions. Remove secrets, credentials and private data (including warehouse names and SQL you may not share). Report vulnerabilities through [SECURITY.md](SECURITY.md).

Work in a branch and submit a focused pull request. Explain what changed, why, and the checks you ran:

```sh
python -m pip install -e .
python -m unittest discover -s tests
```

Update affected documentation. Cite primary sources for research and keep evidence separate from proposals.

Contributions use the repository's license. You must have the right to submit the material and preserve third-party notices. Sign off each commit with `git commit -s` to certify the [Developer Certificate of Origin](https://developercertificate.org/). A signoff is not a copyright transfer. Do not add a signoff for another person.

AI-assisted contributions are welcome. The submitting contributor remains responsible for correctness, provenance, security and validation. Describe meaningful agent involvement and verification in the pull request.

Follow [GOVERNANCE.md](GOVERNANCE.md) and the [code of conduct](CODE_OF_CONDUCT.md).
