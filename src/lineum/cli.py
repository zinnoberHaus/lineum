"""Command-line entry point. Placeholder: only --version works."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from lineum import __version__

NOT_IMPLEMENTED = 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lineum",
        description="Data lineage documentation for dbt projects (planning; placeholder).",
    )
    parser.add_argument("--version", action="version", version=f"lineum {__version__}")
    commands = parser.add_subparsers(dest="command")
    build = commands.add_parser("build", help="Generate a documentation site (not implemented yet).")
    build.add_argument("project_dir", nargs="?", default=".", help="Path to a dbt project.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "build":
        print(
            "lineum build is not implemented yet. See docs/roadmap.md.",
            file=sys.stderr,
        )
        return NOT_IMPLEMENTED
    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
