"""The ``lineum`` command line."""

from __future__ import annotations

import argparse
import json
import os
import sys
import webbrowser
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from lineum import __version__
from lineum import analysis as graph
from lineum.artifacts import ArtifactError
from lineum.config import Config, ConfigError
from lineum.config import load as load_config
from lineum.data import DataError
from lineum.model import Project
from lineum.site import SiteError

EXIT_ERROR = 2
EXIT_CHECK_FAILED = 1


def _color(enabled: bool) -> dict[str, str]:
    if not enabled:
        return {k: "" for k in ("bold", "dim", "green", "yellow", "red", "blue", "orange", "reset")}
    return {"bold": "\033[1m", "dim": "\033[2m", "green": "\033[32m", "yellow": "\033[33m", "red": "\033[31m",
            "blue": "\033[34m", "orange": "\033[38;5;173m", "reset": "\033[0m"}


C = _color(sys.stdout.isatty() and not os.environ.get("NO_COLOR"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lineum",
        description="Lineage-first documentation for dbt projects. Reads the artifacts in target/ and "
                    "writes a static site you can host anywhere.",
    )
    parser.add_argument("--version", action="version", version=f"lineum {__version__}")
    commands = parser.add_subparsers(dest="command", metavar="command")

    def project_args(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("project_dir", nargs="?", default=".", help="dbt project directory (default: .)")
        sub.add_argument("--target-dir", "-t", type=Path, help="Directory with manifest.json (default: target/)")
        sub.add_argument("--no-column-lineage", action="store_true", help="Skip parsing SQL for column lineage.")
        sub.add_argument("--exclude-package", action="append", default=[], metavar="PACKAGE",
                         help="Leave out nodes from a dbt package. Repeatable.")
        sub.add_argument("--workers", type=int, help="Processes for column lineage (default: automatic).")

    def site_args(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--title", help="Site title (default: the dbt project name).")
        sub.add_argument("--base-url", help="Public URL of the site. Enables canonical links and sitemap.xml.")
        sub.add_argument("--noindex", action="store_true", help="Ask search engines not to index the site.")
        sub.add_argument("--no-sql", action="store_true", help="Leave SQL out of the site (smaller, more private).")
        sub.add_argument("--data", metavar="DUCKDB_FILE",
                         help="Export sample rows and column profiles from this DuckDB database.")
        sub.add_argument("--data-rows", type=int, default=None, help="Rows per table to export (default: 5000).")
        sub.add_argument("--head-html", type=Path, metavar="FILE",
                         help="HTML file to insert into every page's <head> (analytics, fonts).")

    build = commands.add_parser("build", help="Generate the documentation site.")
    project_args(build)
    site_args(build)
    build.add_argument("--out", "-o", type=Path, help="Output directory (default: <project>/target/lineum).")
    build.add_argument("--quiet", "-q", action="store_true")

    serve = commands.add_parser("serve", help="Preview a generated site in the browser.")
    serve.add_argument("site_dir", nargs="?", help="Site directory (default: target/lineum).")
    serve.add_argument("--port", "-p", type=int, default=8000)
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--no-open", action="store_true", help="Do not open a browser.")

    dev = commands.add_parser("dev", help="Build, serve, and rebuild when dbt rewrites its artifacts.")
    project_args(dev)
    site_args(dev)
    dev.add_argument("--port", "-p", type=int, default=8000)
    dev.add_argument("--host", default="127.0.0.1")
    dev.add_argument("--no-open", action="store_true")

    check = commands.add_parser("check", help="Score documentation and test coverage (for CI).")
    project_args(check)
    check.add_argument("--fail-under", type=float, help="Exit with status 1 when the score is below this.")
    check.add_argument("--format", choices=("text", "json", "markdown"), default="text")

    impact = commands.add_parser("impact", help="List everything downstream of a node or column.")
    impact.add_argument("node", help="Model name, unique id, source_name.table, or type:name.")
    project_args(impact)
    impact.add_argument("--column", "-c", help="Trace one column instead of the whole node.")
    impact.add_argument("--format", choices=("text", "json", "markdown"), default="text")

    lineage = commands.add_parser("lineage", help="Print a node's upstream and downstream lineage.")
    lineage.add_argument("node", help="Model name, unique id, source_name.table, or type:name.")
    project_args(lineage)
    lineage.add_argument("--up", type=int, default=None, help="Levels upstream (default: all).")
    lineage.add_argument("--down", type=int, default=None, help="Levels downstream (default: all).")
    lineage.add_argument("--column", "-c", help="Trace one column.")
    lineage.add_argument("--format", choices=("text", "json", "mermaid"), default="text")

    export = commands.add_parser("export", help="Export the lineage graph as JSON, Mermaid or Graphviz DOT.")
    project_args(export)
    export.add_argument("--format", choices=("json", "mermaid", "dot"), default="json")
    export.add_argument("--focus", help="Only this node and its neighbourhood.")
    export.add_argument("--up", type=int, default=None)
    export.add_argument("--down", type=int, default=None)
    export.add_argument("--output", "-o", type=Path, help="Write to a file instead of stdout.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 0
    try:
        return {
            "build": cmd_build, "serve": cmd_serve, "dev": cmd_dev, "check": cmd_check,
            "impact": cmd_impact, "lineage": cmd_lineage, "export": cmd_export,
        }[args.command](args)
    except (ArtifactError, ConfigError, SiteError, DataError, OSError) as error:
        print(f"{C['red']}error:{C['reset']} {error}", file=sys.stderr)
        return EXIT_ERROR
    except KeyboardInterrupt:
        return 130


# ----------------------------------------------------------------------------------------------


def _config(args: argparse.Namespace) -> tuple[Path, Config]:
    project_dir = Path(args.project_dir).expanduser().resolve()
    if project_dir.is_file():
        project_dir = project_dir.parent
    config = load_config(project_dir)
    config.exclude_packages += list(getattr(args, "exclude_package", []) or [])
    for flag, attribute in (("title", "title"), ("base_url", "base_url")):
        value = getattr(args, flag, None)
        if value:
            setattr(config, attribute, value)
    if getattr(args, "noindex", False):
        config.noindex = True
    if getattr(args, "no_sql", False):
        config.include_sql = False
    if getattr(args, "data", None):
        config.data_duckdb = str(Path(args.data).expanduser().resolve())
        config.data_required = True
    if getattr(args, "data_rows", None):
        config.data_rows = args.data_rows
    head = getattr(args, "head_html", None)
    if head:
        config.head_html = Path(head).read_text()
    return project_dir, config


def _analyse(args: argparse.Namespace) -> tuple[Project, dict[str, Any], dict[str, Any]]:
    from lineum.build import analyse

    project_dir, config = _config(args)
    analysed = analyse(project_dir, args.target_dir, config, column_lineage=not args.no_column_lineage,
                       workers=args.workers)
    for warning in analysed.project.warnings:
        print(f"{C['yellow']}warning:{C['reset']} {warning}", file=sys.stderr)
    return analysed.project, analysed.summary, analysed.health


def _default_out(project_dir: Path, args: argparse.Namespace) -> Path:
    if getattr(args, "out", None):
        return Path(args.out).expanduser().resolve()
    from lineum.artifacts import find_target_dir

    return find_target_dir(project_dir, args.target_dir) / "lineum"


def cmd_build(args: argparse.Namespace) -> int:
    from lineum.build import build_site

    project_dir, config = _config(args)
    out_dir = _default_out(project_dir, args)
    result = build_site(project_dir, out_dir, config, target_dir=args.target_dir,
                        column_lineage=not args.no_column_lineage, workers=args.workers)
    project = result.analysed.project
    for warning in project.warnings:
        print(f"{C['yellow']}warning:{C['reset']} {warning}", file=sys.stderr)
    if not args.quiet:
        counts = result.analysed.summary["counts"]
        stats = result.analysed.column_stats
        print(f"{C['bold']}Lineum {__version__}{C['reset']} · {project.name} · dbt {project.dbt_version or '?'}")
        print(f"  {counts.get('model', 0)} models, {counts.get('source', 0)} sources, "
              f"{counts.get('exposure', 0)} exposures, {len(project.edges)} edges")
        if stats:
            print(f"  column lineage: {stats['edges']} column edges across {stats['with_lineage']} of "
                  f"{stats['models']} SQL models")
        if result.data:
            print(f"  sample data: {len(result.data['tables'])} tables exported")
        print(f"  health score {result.analysed.health['score']} ({result.analysed.health['grade']})")
        size = result.payload_bytes / 1_000_000
        print(f"{C['green']}Wrote {result.pages} pages ({size:.1f} MB of data) to {out_dir} "
              f"in {result.seconds:.1f}s{C['reset']}")
        print(f"  preview: lineum serve {_relative(out_dir)}")
    return 0


def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def cmd_serve(args: argparse.Namespace) -> int:
    from lineum.serve import serve

    site_dir = Path(args.site_dir) if args.site_dir else Path("target/lineum")
    if not (site_dir / "index.html").exists():
        print(f"{C['red']}error:{C['reset']} no Lineum site in {site_dir}. Run `lineum build` first.",
              file=sys.stderr)
        return EXIT_ERROR

    def ready(url: str) -> None:
        print(f"Serving {site_dir} at {C['bold']}{url}{C['reset']} (Ctrl+C to stop)")
        if not args.no_open:
            webbrowser.open(url)

    serve(site_dir.resolve(), host=args.host, port=args.port, on_ready=ready)
    return 0


def cmd_dev(args: argparse.Namespace) -> int:
    from lineum.artifacts import find_target_dir
    from lineum.build import build_site
    from lineum.serve import serve

    project_dir, config = _config(args)
    target = find_target_dir(project_dir, args.target_dir)
    out_dir = target / "lineum"

    def rebuild() -> None:
        result = build_site(project_dir, out_dir, config, target_dir=args.target_dir,
                            column_lineage=not args.no_column_lineage, workers=args.workers)
        print(f"{C['green']}Rebuilt{C['reset']} {result.pages} pages in {result.seconds:.1f}s")

    rebuild()
    watched = [target / name for name in ("manifest.json", "catalog.json", "run_results.json", "sources.json")]

    def ready(url: str) -> None:
        print(f"Serving at {C['bold']}{url}{C['reset']}; rebuilding when dbt writes new artifacts (Ctrl+C to stop)")
        if not args.no_open:
            webbrowser.open(url)

    serve(out_dir, host=args.host, port=args.port, on_ready=ready, watch=rebuild, watch_paths=watched)
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    project, summary, report = _analyse(args)
    passed = args.fail_under is None or report["score"] >= args.fail_under
    if args.format == "json":
        print(json.dumps({"project": project.name, **report, "passed": passed}, indent=2))
    elif args.format == "markdown":
        print(_check_markdown(project, report, args.fail_under, passed))
    else:
        print(_check_text(project, report, args.fail_under, passed))
    return 0 if passed else EXIT_CHECK_FAILED


def _bar(score: float | None, width: int = 20) -> str:
    if score is None:
        return " " * width
    filled = round(width * score / 100)
    color = C["green"] if score >= 80 else C["yellow"] if score >= 60 else C["red"]
    return f"{color}{'█' * filled}{C['dim']}{'░' * (width - filled)}{C['reset']}"


def _check_text(project: Project, report: dict[str, Any], fail_under: float | None, passed: bool) -> str:
    lines = [f"{C['bold']}{project.name}{C['reset']} health {C['bold']}{report['score']}{C['reset']} "
             f"({report['grade']})", ""]
    for dimension in report["dimensions"]:
        score = dimension["score"]
        shown = "  n/a" if score is None else f"{score:5.1f}"
        lines.append(f"  {_bar(score)} {shown}  {dimension['label']} ({dimension['hit']}/{dimension['total']})")
    if report["findings"]:
        lines.append("")
        for finding in report["findings"]:
            mark = {"error": C["red"] + "✗", "warn": C["yellow"] + "!", "info": C["blue"] + "i"}[finding["severity"]]
            names = ", ".join(project.nodes[n].display_name for n in finding["nodes"][:4] if n in project.nodes)
            more = f" and {len(finding['nodes']) - 4} more" if len(finding["nodes"]) > 4 else ""
            lines.append(f"  {mark}{C['reset']} {finding['title']}: {names}{more}")
    if fail_under is not None:
        lines.append("")
        verdict = f"{C['green']}passed" if passed else f"{C['red']}failed"
        lines.append(f"{verdict}{C['reset']}: score {report['score']} against --fail-under {fail_under}")
    return "\n".join(lines)


def _check_markdown(project: Project, report: dict[str, Any], fail_under: float | None, passed: bool) -> str:
    lines = [f"### Lineum health: {report['score']} ({report['grade']})", "",
             "| Check | Score | Covered |", "| --- | ---: | ---: |"]
    for d in report["dimensions"]:
        lines.append(f"| {d['label']} | {'n/a' if d['score'] is None else d['score']} | {d['hit']}/{d['total']} |")
    for finding in report["findings"]:
        names = ", ".join(f"`{project.nodes[n].display_name}`" for n in finding["nodes"][:8] if n in project.nodes)
        lines.append(f"\n**{finding['title']}** ({len(finding['nodes'])}): {names}")
    if fail_under is not None:
        lines.append(f"\n{'✅ Passed' if passed else '❌ Failed'}: threshold {fail_under}.")
    return "\n".join(lines)


def _require(project: Project, reference: str) -> Any:
    node = project.resolve(reference)
    if node is None:
        names = sorted(n.display_name for n in project.nodes.values() if reference.lower() in n.name.lower())[:8]
        hint = f" Did you mean: {', '.join(names)}?" if names else ""
        raise ArtifactError(f"No node named {reference!r} in {project.name}.{hint}")
    return node


def cmd_impact(args: argparse.Namespace) -> int:
    project, _, _ = _analyse(args)
    node = _require(project, args.node)
    if args.column:
        hits = graph.column_downstream(project, node.id, args.column)
        rows = [{"node": project.nodes[n].display_name, "id": n, "column": col, "transform": t, "distance": d,
                 "type": project.nodes[n].type} for n, col, t, d in hits]
        subject = f"{node.display_name}.{args.column}"
    else:
        rows = [{"node": project.nodes[n].display_name, "id": n, "distance": d, "type": project.nodes[n].type,
                 "owner": project.nodes[n].owner} for n, d in graph.downstream(project, node.id)]
        subject = node.display_name
    rows.sort(key=lambda r: (r["distance"], r["type"], r["node"]))
    if args.format == "json":
        print(json.dumps({"subject": subject, "id": node.id, "downstream": rows}, indent=2))
        return 0
    exposures = [r for r in rows if r["type"] == "exposure"]
    owners = Counter(project.nodes[r["id"]].owner for r in rows if project.nodes[r["id"]].owner)
    types = Counter(r["type"] for r in rows)
    breakdown = ", ".join(f"{count} {kind.replace('_', ' ')}{'s' if count != 1 else ''}"
                          for kind, count in types.most_common())
    if args.format == "markdown":
        out = [f"### Impact of changing `{subject}`", "",
               f"**{len(rows)}** downstream {'columns' if args.column else 'nodes'}" + (f": {breakdown}" if rows else ".")]
        if exposures:
            out += ["", "**Exposures affected**", ""]
            out += [f"- {project.nodes[r['id']].label or r['node']} ({project.nodes[r['id']].extra.get('exposure_type', 'exposure')})"
                    for r in exposures]
        if owners:
            out += ["", "**Owners to notify**: " + ", ".join(f"{o} ({n})" for o, n in owners.most_common())]
        if rows:
            out += ["", "| Distance | Node | Type |" + (" Column | Transform |" if args.column else ""),
                    "| ---: | --- | --- |" + (" --- | --- |" if args.column else "")]
            for r in rows:
                extra = f" `{r['column']}` | {r['transform']} |" if args.column else ""
                out.append(f"| {r['distance']} | `{r['node']}` | {r['type']} |{extra}")
        print("\n".join(out))
        return 0
    print(f"{C['bold']}{subject}{C['reset']}: {len(rows)} downstream" + (f" ({breakdown})" if rows else ""))
    for r in rows:
        label = f"{r['node']}.{r['column']}" if args.column else r["node"]
        transform = f" {C['dim']}{r['transform']}{C['reset']}" if args.column else ""
        print(f"  {C['dim']}{r['distance']:>2}{C['reset']}  {C['orange']}{label}{C['reset']} {C['dim']}{r['type']}{C['reset']}{transform}")
    if exposures:
        print(f"\n{C['bold']}Exposures affected:{C['reset']} " + ", ".join(project.nodes[r['id']].label or r['node'] for r in exposures))
    if owners:
        print(f"{C['bold']}Owners to notify:{C['reset']} " + ", ".join(f"{o} ({n})" for o, n in owners.most_common()))
    return 0


def cmd_lineage(args: argparse.Namespace) -> int:
    project, _, _ = _analyse(args)
    node = _require(project, args.node)
    if args.column:
        up = [(n, c, t, d) for n, c, t, d in graph.column_upstream(project, node.id, args.column)
              if args.up is None or d <= args.up]
        down = [(n, c, t, d) for n, c, t, d in graph.column_downstream(project, node.id, args.column)
                if args.down is None or d <= args.down]
        if args.format == "json":
            print(json.dumps({"node": node.id, "column": args.column,
                              "upstream": [dict(zip(("node", "column", "transform", "distance"), u, strict=True)) for u in up],
                              "downstream": [dict(zip(("node", "column", "transform", "distance"), d, strict=True)) for d in down]},
                             indent=2))
            return 0
        print(f"{C['bold']}{node.display_name}.{args.column}{C['reset']}")
        for n, c, t, d in sorted(up, key=lambda x: x[3]):
            print(f"  {C['blue']}↑ {d}{C['reset']} {project.nodes[n].display_name}.{c} {C['dim']}{t}{C['reset']}")
        for n, c, t, d in sorted(down, key=lambda x: x[3]):
            print(f"  {C['orange']}↓ {d}{C['reset']} {project.nodes[n].display_name}.{c} {C['dim']}{t}{C['reset']}")
        return 0
    up_nodes = graph.upstream(project, node.id, args.up)
    down_nodes = graph.downstream(project, node.id, args.down)
    if args.format == "json":
        print(json.dumps({"node": node.id, "upstream": [{"id": n, "distance": d} for n, d in up_nodes],
                          "downstream": [{"id": n, "distance": d} for n, d in down_nodes]}, indent=2))
        return 0
    if args.format == "mermaid":
        keep = {node.id, *(n for n, _ in up_nodes), *(n for n, _ in down_nodes)}
        print(_mermaid(project, keep, focus=node.id))
        return 0
    print(f"{C['bold']}{node.display_name}{C['reset']} {C['dim']}{node.type}{C['reset']}")
    for n, d in sorted(up_nodes, key=lambda x: (-x[1], project.nodes[x[0]].name)):
        print(f"  {C['blue']}↑ {d}{C['reset']} {project.nodes[n].display_name} {C['dim']}{project.nodes[n].type}{C['reset']}")
    for n, d in sorted(down_nodes, key=lambda x: (x[1], project.nodes[x[0]].name)):
        print(f"  {C['orange']}↓ {d}{C['reset']} {project.nodes[n].display_name} {C['dim']}{project.nodes[n].type}{C['reset']}")
    return 0


def _safe_id(node_id: str) -> str:
    return "n_" + "".join(ch if ch.isalnum() else "_" for ch in node_id)


def _mermaid(project: Project, keep: set[str], focus: str | None = None) -> str:
    lines = ["flowchart LR"]
    for uid in keep:
        node = project.nodes[uid]
        shape = ("[(", ")]") if node.type == "source" else ("([", "])") if node.type == "exposure" else ("[", "]")
        lines.append(f'  {_safe_id(uid)}{shape[0]}"{node.display_name}"{shape[1]}')
    for a, b in project.edges:
        if a in keep and b in keep:
            lines.append(f"  {_safe_id(a)} --> {_safe_id(b)}")
    if focus:
        lines.append(f"  style {_safe_id(focus)} stroke-width:3px")
    return "\n".join(lines)


def _dot(project: Project, keep: set[str]) -> str:
    lines = ["digraph lineage {", "  rankdir=LR;", '  node [shape=box, style="rounded", fontname="Helvetica"];']
    for uid in keep:
        node = project.nodes[uid]
        label = node.display_name.replace('"', '\\"')
        lines.append(f'  "{uid}" [label="{label}"];')
    for a, b in project.edges:
        if a in keep and b in keep:
            lines.append(f'  "{a}" -> "{b}";')
    lines.append("}")
    return "\n".join(lines)


def cmd_export(args: argparse.Namespace) -> int:
    project, summary, report = _analyse(args)
    keep = set(project.nodes)
    if args.focus:
        node = _require(project, args.focus)
        keep = {node.id, *(n for n, _ in graph.upstream(project, node.id, args.up)),
                *(n for n, _ in graph.downstream(project, node.id, args.down))}
    if args.format == "mermaid":
        text = _mermaid(project, keep, focus=project.resolve(args.focus).id if args.focus else None)  # type: ignore[union-attr]
    elif args.format == "dot":
        text = _dot(project, keep)
    else:
        from lineum import payload

        data = payload.build(project, summary, report, title=project.name, base_url=None, include_sql=False)
        if args.focus:
            ids = [n["id"] for n in data["nodes"]]
            kept_index = {i for i, uid in enumerate(ids) if uid in keep}
            data["nodes"] = [n for n in data["nodes"] if n["id"] in keep]
            remap = {old: new for new, old in enumerate(sorted(kept_index))}
            data["edges"] = [[remap[a], remap[b]] for a, b in data["edges"] if a in remap and b in remap]
            data["columnEdges"] = [[remap[e[0]], e[1], remap[e[2]], e[3], e[4]] for e in data["columnEdges"]
                                   if e[0] in remap and e[2] in remap]
        text = json.dumps(data, indent=2)
    if args.output:
        args.output.write_text(text + "\n")
        print(f"Wrote {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
