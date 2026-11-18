"""A small static file server for previewing a generated site, with optional rebuild on change."""

from __future__ import annotations

import functools
import http.server
import socketserver
import threading
import time
from collections.abc import Callable
from pathlib import Path

MIME = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".parquet": "application/vnd.apache.parquet",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json",
    ".xml": "application/xml",
}


class _Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **MIME}

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - stdlib signature
        pass

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
        not_found = Path(self.directory) / "404.html"
        if code == 404 and not_found.exists():
            body = not_found.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve(directory: Path, host: str = "127.0.0.1", port: int = 8000,
          on_ready: Callable[[str], None] | None = None,
          watch: Callable[[], None] | None = None, watch_paths: list[Path] | None = None) -> None:
    handler = functools.partial(_Handler, directory=str(directory))
    server = None
    for candidate in range(port, port + 20):
        try:
            server = _Server((host, candidate), handler)
            break
        except OSError:
            continue
    if server is None:
        raise OSError(f"No free port between {port} and {port + 19}.")
    url = f"http://{host}:{server.server_address[1]}/"
    if watch and watch_paths:
        threading.Thread(target=_watch, args=(watch_paths, watch), daemon=True).start()
    if on_ready:
        on_ready(url)
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def _watch(paths: list[Path], rebuild: Callable[[], None]) -> None:
    def stamp() -> tuple[float, ...]:
        return tuple(p.stat().st_mtime if p.exists() else 0.0 for p in paths)

    last = stamp()
    while True:
        time.sleep(1.0)
        current = stamp()
        if current != last:
            time.sleep(0.5)  # let dbt finish writing every artifact
            last = stamp()
            try:
                rebuild()
            except Exception as error:  # noqa: BLE001 - keep serving the previous build
                print(f"Rebuild failed: {error}")
