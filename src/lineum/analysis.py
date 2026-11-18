"""Graph analytics over the project: reach, depth, impact and the build's critical path."""

from __future__ import annotations

from collections import Counter
from typing import Any

from lineum.model import Node, Project

TIMED_TYPES = {"model", "seed", "snapshot"}


def analyse(project: Project) -> dict[str, Any]:
    """Store per-node metrics on each node and return project-level analytics."""
    order = _topological_ids(project)
    index = {uid: i for i, uid in enumerate(order)}
    nodes = project.nodes

    # Ancestor and descendant sets as integer bitsets: fast enough for tens of thousands of nodes.
    ancestors: dict[str, int] = {}
    for uid in order:
        bits = 0
        for parent in nodes[uid].parents:
            bits |= ancestors[parent] | (1 << index[parent])
        ancestors[uid] = bits
    descendants: dict[str, int] = {}
    for uid in reversed(order):
        bits = 0
        for child in nodes[uid].children:
            bits |= descendants[child] | (1 << index[child])
        descendants[uid] = bits

    exposure_bits = 0
    for uid in order:
        if nodes[uid].type == "exposure":
            exposure_bits |= 1 << index[uid]

    depth: dict[str, int] = {}
    for uid in order:
        depth[uid] = max((depth[p] + 1 for p in nodes[uid].parents), default=0)
    height: dict[str, int] = {}
    for uid in reversed(order):
        height[uid] = max((height[c] + 1 for c in nodes[uid].children), default=0)

    total = max(1, len(order) - 1)
    for uid in order:
        node = nodes[uid]
        up = ancestors[uid].bit_count()
        down = descendants[uid].bit_count()
        exposures = (descendants[uid] & exposure_bits).bit_count()
        node.metrics = {
            "up": up,
            "down": down,
            "depth": depth[uid],
            "height": height[uid],
            "fanIn": len(node.parents),
            "fanOut": len(node.children),
            "exposures": exposures,
            # Share of the project that changes when this node changes, weighting exposures (things
            # people look at) three times as heavily as models.
            "impact": round(min(1.0, (down + 2 * exposures) / total), 4),
        }

    critical = _critical_path(project, order)
    for uid in critical["nodes"]:
        nodes[uid].metrics["critical"] = True

    keystones = sorted(
        (n for n in nodes.values() if n.type in ("model", "source", "seed", "snapshot")),
        key=lambda n: (-n.metrics["down"], -n.metrics["exposures"], n.name),
    )[:10]
    slowest = sorted(
        (n for n in nodes.values() if n.run and n.run.get("seconds") is not None),
        key=lambda n: -float(n.run["seconds"]),  # type: ignore[index]
    )[:10]
    tests = Counter(test.status for node in nodes.values() for test in node.tests)
    run_status = Counter((node.run or {}).get("status") for node in nodes.values() if node.run)
    return {
        "counts": dict(Counter(node.type for node in nodes.values())),
        "layers": dict(Counter(node.layer for node in nodes.values())),
        "materializations": dict(Counter(node.materialized for node in nodes.values() if node.type == "model")),
        "columns": sum(len(node.columns) for node in nodes.values()),
        "edges": len(project.edges),
        "columnEdges": len(project.column_edges),
        "tests": dict(tests),
        "testCount": sum(tests.values()),
        "runStatus": {str(k): v for k, v in run_status.items()},
        "maxDepth": max(depth.values(), default=0),
        "criticalPath": critical,
        "keystones": [n.id for n in keystones if n.metrics["down"] > 0],
        "slowest": [n.id for n in slowest],
        "orphans": [
            n.id for n in nodes.values()
            if n.type == "model" and not n.children and n.layer not in ("marts",)
        ],
        "totalSeconds": round(sum(float((n.run or {}).get("seconds") or 0) for n in nodes.values()), 3),
    }


def _topological_ids(project: Project) -> list[str]:
    indegree = {uid: len(node.parents) for uid, node in project.nodes.items()}
    ready = sorted(uid for uid, degree in indegree.items() if degree == 0)
    order: list[str] = []
    while ready:
        uid = ready.pop()
        order.append(uid)
        for child in project.nodes[uid].children:
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
    if len(order) < len(project.nodes):
        remaining = [uid for uid in project.nodes if uid not in set(order)]
        project.warnings.append(f"The dependency graph has a cycle through {remaining[0]}; analytics may be partial.")
        order.extend(remaining)
    return order


def _critical_path(project: Project, order: list[str]) -> dict[str, Any]:
    """The chain of runs with the largest total execution time: the floor on build duration."""

    def cost(node: Node) -> float:
        if node.type not in TIMED_TYPES or not node.run:
            return 0.0
        return float(node.run.get("seconds") or 0.0)

    best: dict[str, float] = {}
    previous: dict[str, str | None] = {}
    for uid in order:
        node = project.nodes[uid]
        parent = max(node.parents, key=lambda p: best.get(p, 0.0), default=None)
        best[uid] = cost(node) + (best[parent] if parent else 0.0)
        previous[uid] = parent
    if not best or max(best.values()) <= 0:
        return {"nodes": [], "seconds": 0.0}
    end: str | None = max(best, key=lambda uid: best[uid])
    path: list[str] = []
    while end is not None:
        path.append(end)
        end = previous[end]
    path.reverse()
    path = [uid for uid in path if cost(project.nodes[uid]) > 0 or project.nodes[uid].type in TIMED_TYPES]
    return {"nodes": path, "seconds": round(max(best.values()), 3)}


def upstream(project: Project, node_id: str, depth: int | None = None) -> list[tuple[str, int]]:
    return _walk(project, node_id, "parents", depth)


def downstream(project: Project, node_id: str, depth: int | None = None) -> list[tuple[str, int]]:
    return _walk(project, node_id, "children", depth)


def _walk(project: Project, node_id: str, direction: str, depth: int | None) -> list[tuple[str, int]]:
    seen = {node_id: 0}
    frontier = [node_id]
    level = 0
    while frontier and (depth is None or level < depth):
        level += 1
        following = []
        for uid in frontier:
            for neighbour in getattr(project.nodes[uid], direction):
                if neighbour not in seen:
                    seen[neighbour] = level
                    following.append(neighbour)
        frontier = following
    return [(uid, distance) for uid, distance in seen.items() if uid != node_id]


def column_upstream(project: Project, node_id: str, column: str) -> list[tuple[str, str, str, int]]:
    return _column_walk(project, node_id, column, upstream=True)


def column_downstream(project: Project, node_id: str, column: str) -> list[tuple[str, str, str, int]]:
    return _column_walk(project, node_id, column, upstream=False)


def _column_walk(project: Project, node_id: str, column: str, upstream: bool) -> list[tuple[str, str, str, int]]:
    """Breadth-first walk of column edges: returns (node, column, transform, distance)."""
    index: dict[tuple[str, str], list[tuple[str, str, str]]] = {}
    for edge in project.column_edges:
        if upstream:
            index.setdefault((edge.target, edge.target_column.lower()), []).append(
                (edge.source, edge.source_column, edge.transform))
        else:
            index.setdefault((edge.source, edge.source_column.lower()), []).append(
                (edge.target, edge.target_column, edge.transform))
    seen = {(node_id, column.lower())}
    frontier = [(node_id, column)]
    result: list[tuple[str, str, str, int]] = []
    distance = 0
    while frontier:
        distance += 1
        following = []
        for uid, name in frontier:
            for other, other_column, transform in index.get((uid, name.lower()), []):
                key = (other, other_column.lower())
                if key in seen:
                    continue
                seen.add(key)
                result.append((other, other_column, transform, distance))
                following.append((other, other_column))
        frontier = following
    return result
