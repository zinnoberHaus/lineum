"""Documentation and testing coverage, scored, with findings that point at specific nodes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from lineum.model import Node, Project

MODEL_TYPES = ("model", "snapshot", "seed")


@dataclass
class Dimension:
    id: str
    label: str
    weight: float
    hit: int = 0
    total: int = 0
    hint: str = ""
    missing: list[str] = field(default_factory=list)

    @property
    def score(self) -> float | None:
        return None if self.total == 0 else round(100 * self.hit / self.total, 1)

    def to_json(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "weight": self.weight, "hit": self.hit,
                "total": self.total, "score": self.score, "hint": self.hint, "missing": self.missing}


@dataclass
class Finding:
    rule: str
    severity: str  # info | warn | error
    title: str
    detail: str
    nodes: list[str]

    def to_json(self) -> dict[str, Any]:
        return {"rule": self.rule, "severity": self.severity, "title": self.title,
                "detail": self.detail, "nodes": self.nodes}


def assess(project: Project) -> dict[str, Any]:
    nodes = list(project.nodes.values())
    models = [n for n in nodes if n.type == "model"]
    documented_models = [n for n in nodes if n.type in MODEL_TYPES or n.type == "source"]

    model_docs = Dimension("model_docs", "Models and sources described", 20,
                           hint="Add a description in the YAML file next to each model or source.")
    for node in documented_models:
        model_docs.total += 1
        if node.description:
            model_docs.hit += 1
        else:
            model_docs.missing.append(node.id)

    column_docs = Dimension("column_docs", "Columns described", 15,
                            hint="Describe columns under `columns:`; start with primary keys and metrics.")
    for node in documented_models:
        for column in node.columns:
            column_docs.total += 1
            if column.description:
                column_docs.hit += 1
        if node.columns and not any(c.description for c in node.columns):
            column_docs.missing.append(node.id)

    tested = Dimension("tested", "Models with at least one test", 20,
                       hint="Add data tests (unique, not_null, relationships) or unit tests.")
    primary_keys = Dimension("primary_keys", "Models with a tested primary key", 15,
                             hint="Test the grain: unique and not_null on the key, or a primary_key constraint.")
    for node in models:
        if node.materialized == "ephemeral":
            continue
        tested.total += 1
        if node.tests:
            tested.hit += 1
        else:
            tested.missing.append(node.id)
        primary_keys.total += 1
        if any(c.primary_key for c in node.columns):
            primary_keys.hit += 1
        else:
            primary_keys.missing.append(node.id)

    freshness = Dimension("freshness", "Sources with freshness checks", 10,
                          hint="Set `loaded_at_field` and `freshness` on sources that load on a schedule.")
    for node in nodes:
        if node.type != "source":
            continue
        freshness.total += 1
        if node.freshness and node.freshness.get("configured"):
            freshness.hit += 1
        else:
            freshness.missing.append(node.id)

    ownership = Dimension("ownership", "Marts with an owner", 10,
                          hint="Assign marts to a dbt group or set `meta.owner`.")
    for node in models:
        if node.layer != "marts":
            continue
        ownership.total += 1
        if node.owner:
            ownership.hit += 1
        else:
            ownership.missing.append(node.id)

    contracts = Dimension("contracts", "Public models with enforced contracts", 10,
                          hint="Models other teams depend on (`access: public`) should enforce a contract.")
    for node in models:
        if node.access != "public":
            continue
        contracts.total += 1
        if node.contract:
            contracts.hit += 1
        else:
            contracts.missing.append(node.id)

    dimensions = [model_docs, column_docs, tested, primary_keys, freshness, ownership, contracts]
    scored = [d for d in dimensions if d.score is not None]
    weight = sum(d.weight for d in scored)
    score = round(sum(d.weight * (d.score or 0) for d in scored) / weight, 1) if weight else 0.0

    return {
        "score": score,
        "grade": _grade(score),
        "dimensions": [d.to_json() for d in dimensions],
        "findings": [f.to_json() for f in _findings(project)],
    }


def _grade(score: float) -> str:
    for threshold, grade in ((90, "A"), (80, "B"), (70, "C"), (60, "D")):
        if score >= threshold:
            return grade
    return "F"


def _findings(project: Project) -> list[Finding]:
    nodes = project.nodes
    findings: list[Finding] = []

    failing = [n.id for n in nodes.values() if any(t.status in ("fail", "error") for t in n.tests)]
    if failing:
        findings.append(Finding("failing-tests", "error", "Failing tests",
                                "These nodes have tests that failed or errored in the last run.", failing))
    warning = [n.id for n in nodes.values() if any(t.status == "warn" for t in n.tests) and n.id not in failing]
    if warning:
        findings.append(Finding("warning-tests", "warn", "Tests with warnings",
                                "These nodes have tests that returned warnings in the last run.", warning))
    run_errors = [n.id for n in nodes.values() if (n.run or {}).get("status") in ("error", "fail")]
    if run_errors:
        findings.append(Finding("run-errors", "error", "Models that failed to build",
                                "The last run reported an error for these nodes.", run_errors))
    stale = [n.id for n in nodes.values() if (n.freshness or {}).get("status") in ("warn", "error", "runtime error")]
    if stale:
        findings.append(Finding("stale-sources", "warn", "Stale sources",
                                "Source freshness checks warned or errored: their downstream data may be out of date.",
                                stale))

    def is_layer(node: Node, layer: str) -> bool:
        return node.type == "model" and node.layer == layer

    direct = [
        n.id for n in nodes.values()
        if n.type == "model" and n.layer in ("intermediate", "marts")
        and any(nodes[p].type == "source" for p in n.parents)
    ]
    if direct:
        findings.append(Finding("source-outside-staging", "warn", "Sources read outside staging",
                                "Intermediate models and marts select from a source directly. Route sources "
                                "through a staging model so renames and casts happen once.", direct))
    staging_chain = [
        n.id for n in nodes.values()
        if is_layer(n, "staging") and any(is_layer(nodes[p], "staging") for p in n.parents)
    ]
    if staging_chain:
        findings.append(Finding("staging-on-staging", "info", "Staging models built on staging models",
                                "Staging models usually map one-to-one onto a source. Joins belong in "
                                "intermediate models.", staging_chain))
    marts_on_staging_only = [
        n.id for n in nodes.values()
        if is_layer(n, "marts") and n.parents and all(nodes[p].layer == "source" for p in n.parents)
    ]
    if marts_on_staging_only:
        findings.append(Finding("marts-on-sources", "warn", "Marts built only from sources",
                                "These marts read sources without any staging layer.", marts_on_staging_only))
    fan_out = [n.id for n in nodes.values() if n.type == "model" and len(n.children) >= 8]
    if fan_out:
        findings.append(Finding("high-fan-out", "info", "Models with many direct dependents",
                                "Eight or more models read these directly. A change here has a wide blast "
                                "radius; consider a contract and tests on every column.", fan_out))
    dead_ends = [
        n.id for n in nodes.values()
        if n.type == "model" and not n.children and n.layer in ("staging", "intermediate")
    ]
    if dead_ends:
        findings.append(Finding("unused-models", "info", "Unused staging and intermediate models",
                                "Nothing depends on these models. They may be dead code, or a mart is missing.",
                                dead_ends))
    unanalysed = [
        n.id for n in nodes.values()
        if n.type == "model" and n.column_lineage not in (None, "ok") and n.materialized != "ephemeral"
    ]
    if unanalysed:
        findings.append(Finding("column-lineage-gaps", "info", "Models without column lineage",
                                "Lineum could not trace columns for these models; their column lineage shows as "
                                "unknown. Open each model to see why.", unanalysed))
    return findings
