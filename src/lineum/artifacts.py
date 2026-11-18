"""Locate and load dbt artifacts.

Lineum reads the JSON files dbt writes to ``target/``:

* ``manifest.json`` (required): every node, its config, SQL and dependencies.
* ``catalog.json`` (optional, from ``dbt docs generate``): warehouse column types and table stats.
* ``run_results.json`` (optional): status and timing of the last run, build or test.
* ``sources.json`` (optional, from ``dbt source freshness``): source freshness results.

Only the fields Lineum uses are read, so artifacts from dbt Core 1.5 onwards (manifest v9+) load.
Unknown fields are ignored; missing optional fields fall back to empty values.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

JSON = dict[str, Any]

OPTIONAL_FILES = ("catalog.json", "run_results.json", "sources.json")
OLDEST_MANIFEST = 9  # dbt Core 1.5


class ArtifactError(Exception):
    """An artifact is missing, unreadable or of an unsupported version."""


@dataclass
class Artifacts:
    target_dir: Path
    manifest: JSON
    catalog: JSON | None = None
    run_results: JSON | None = None
    sources: JSON | None = None
    compiled_dir: Path | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def manifest_version(self) -> int | None:
        return schema_version(self.manifest)

    def versions(self) -> dict[str, str]:
        found = {"manifest": self.manifest, "catalog": self.catalog,
                 "runResults": self.run_results, "sources": self.sources}
        result: dict[str, str] = {}
        for key, artifact in found.items():
            if artifact is not None:
                version = schema_version(artifact)
                result[key] = f"v{version}" if version is not None else "unknown"
        return result


def schema_version(artifact: JSON) -> int | None:
    url = str(artifact.get("metadata", {}).get("dbt_schema_version", ""))
    match = re.search(r"/v(\d+)\.json$", url)
    return int(match.group(1)) if match else None


def find_target_dir(project_dir: Path, target_dir: Path | None = None) -> Path:
    """Return the directory holding manifest.json.

    Accepts a dbt project directory (uses ``target/`` or the ``target-path`` in dbt_project.yml),
    a target directory, or a path to manifest.json itself.
    """
    if target_dir is not None:
        candidate = target_dir if target_dir.is_absolute() else project_dir / target_dir
        return candidate
    if project_dir.is_file() and project_dir.name == "manifest.json":
        return project_dir.parent
    if (project_dir / "manifest.json").exists():
        return project_dir
    configured = _configured_target_path(project_dir)
    return project_dir / (configured or "target")


def _configured_target_path(project_dir: Path) -> str | None:
    config = project_dir / "dbt_project.yml"
    if not config.exists():
        return None
    match = re.search(r"^target-path:\s*['\"]?([^'\"\n#]+)", config.read_text(errors="replace"), re.M)
    return match.group(1).strip() if match else None


def _read_json(path: Path) -> JSON:
    try:
        with path.open("rb") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as error:
        raise ArtifactError(f"{path} is not valid JSON ({error.msg} at line {error.lineno}).") from error
    except OSError as error:
        raise ArtifactError(f"Cannot read {path}: {error.strerror}.") from error
    if not isinstance(data, dict):
        raise ArtifactError(f"{path} does not contain a JSON object.")
    return data


def load(project_dir: Path | str = ".", target_dir: Path | str | None = None) -> Artifacts:
    """Load the artifacts of a dbt project. Raises ArtifactError when manifest.json is unusable."""
    project = Path(project_dir).expanduser().resolve()
    target = find_target_dir(project, Path(target_dir) if target_dir else None)
    manifest_path = target / "manifest.json"
    if not manifest_path.exists():
        raise ArtifactError(
            f"No manifest.json in {target}. Run `dbt parse`, `dbt compile` or `dbt docs generate` "
            "in the dbt project first (compiled SQL is needed for column lineage)."
        )
    manifest = _read_json(manifest_path)
    if "nodes" not in manifest or "metadata" not in manifest:
        raise ArtifactError(f"{manifest_path} does not look like a dbt manifest.")
    version = schema_version(manifest)
    if version is not None and version < OLDEST_MANIFEST:
        raise ArtifactError(
            f"manifest.json is schema v{version}; Lineum reads v{OLDEST_MANIFEST} (dbt Core 1.5) and later."
        )

    artifacts = Artifacts(target_dir=target, manifest=manifest)
    if version is None:
        artifacts.warnings.append("manifest.json has no schema version; reading it as the latest format.")
    for name in OPTIONAL_FILES:
        path = target / name
        if not path.exists():
            continue
        try:
            data = _read_json(path)
        except ArtifactError as error:
            artifacts.warnings.append(f"Skipped {name}: {error}")
            continue
        if name == "catalog.json":
            artifacts.catalog = data
        elif name == "run_results.json":
            artifacts.run_results = data
        else:
            artifacts.sources = data
    compiled = target / "compiled"
    if compiled.is_dir():
        artifacts.compiled_dir = compiled
    if artifacts.catalog is None:
        artifacts.warnings.append(
            "No catalog.json: column types and table sizes are unavailable. Run `dbt docs generate` to add them."
        )
    return artifacts
