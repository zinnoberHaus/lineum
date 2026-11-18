# CI recipes

## Fail a build when documentation slips

```yaml
# .github/workflows/docs.yml
- run: dbt deps && dbt parse
- run: pipx install "git+https://github.com/zinnoberHaus/lineum"
- run: lineum check --fail-under 70
```

`lineum check` prints the weighted score, each dimension and the findings, and exits with status 1 below the threshold. `--format markdown` writes a table for a job summary; `--format json` is for scripts.

Column lineage needs compiled SQL: use `dbt compile` (or `dbt docs generate`) instead of `dbt parse` when the check should include it.

## Comment the impact of a pull request

```yaml
- name: Impact of changed models
  run: |
    {
      echo "## Lineage impact"
      for model in $(git diff --name-only origin/main -- 'models/**/*.sql' | xargs -n1 basename | sed 's/\.sql$//'); do
        lineum impact "$model" --format markdown || true
      done
    } >> "$GITHUB_STEP_SUMMARY"
```

Each section lists the downstream nodes by distance, the exposures affected and the owners to tell. Post it as a pull request comment with your usual action if you prefer comments to job summaries.

## Publish on merge

See [deploying](deploying.md) for GitHub Pages and other hosts.
