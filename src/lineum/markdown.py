"""Render dbt descriptions (Markdown) to safe HTML.

Raw HTML in descriptions is escaped, and links may only use http, https, mailto or relative URLs,
so a description cannot inject script into a generated site.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from markdown_it import MarkdownIt

_SAFE_URL = re.compile(r"^(https?:|mailto:|#|/|\./|\.\./|[^:]*$)", re.I)


def _validate_link(url: str) -> bool:
    return bool(_SAFE_URL.match(url.strip()))


@lru_cache(maxsize=1)
def _renderer() -> MarkdownIt:
    md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False})
    md.enable(["table", "strikethrough"])
    md.validateLink = _validate_link

    def link_open(renderer: Any, tokens: Any, idx: int, options: Any, env: Any) -> str:
        token = tokens[idx]
        href = str(token.attrGet("href") or "")
        if href.startswith(("http://", "https://")):
            token.attrSet("rel", "noopener noreferrer")
            token.attrSet("target", "_blank")
        return str(renderer.renderToken(tokens, idx, options, env))

    md.add_render_rule("link_open", link_open)
    return md


def render(text: str | None) -> str:
    """Render Markdown to HTML. Returns an empty string for empty input."""
    if not text or not text.strip():
        return ""
    return _renderer().render(text).strip()


def plain(text: str | None, limit: int = 300) -> str:
    """A single-line plain-text summary of Markdown, for meta descriptions and tooltips."""
    if not text:
        return ""
    value = re.sub(r"```.*?```", " ", text, flags=re.S)
    value = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"[`*_>#|~]", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) > limit:
        cut = value[: limit - 1].rsplit(" ", 1)[0]
        value = cut.rstrip(",.;:") + "…"
    return value
