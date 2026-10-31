#!/usr/bin/env python3
"""Serve Leveli on loopback and expose local football snapshot JSON read-only."""
from __future__ import annotations

import json
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
EXPORT_DIR = ROOT / "leveli" / "football" / ".cache" / "firebase-export"
SNAPSHOT_NAME = re.compile(r"^[A-Z0-9]+_\d{4}_(?:standings|matches|scorers)\.json$")
MANIFEST_PATH = "/__leveli_local__/manifest.json"
SNAPSHOT_PREFIX = "/__leveli_local__/snapshots/"


def local_snapshot_names(directory: Path = EXPORT_DIR) -> list[str]:
    try:
        names = [
            path.name for path in directory.iterdir()
            if SNAPSHOT_NAME.fullmatch(path.name)
            and path.is_file()
            and path.resolve().parent == directory.resolve()
        ]
    except OSError:
        return []
    return sorted(names)


class LocalFootballHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, body: bytes, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == MANIFEST_PATH:
            body = json.dumps({"files": local_snapshot_names()}, ensure_ascii=False).encode("utf-8")
            self._send_json(body)
            return
        if path.startswith(SNAPSHOT_PREFIX):
            name = unquote(path[len(SNAPSHOT_PREFIX):])
            if not SNAPSHOT_NAME.fullmatch(name):
                self._send_json(b'{"error":"not found"}', 404)
                return
            target = (EXPORT_DIR / name).resolve()
            if target.parent != EXPORT_DIR.resolve() or not target.is_file():
                self._send_json(b'{"error":"not found"}', 404)
                return
            try:
                body = target.read_bytes()
            except OSError:
                self._send_json(b'{"error":"unavailable"}', 404)
                return
            self._send_json(body)
            return
        super().do_GET()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), LocalFootballHandler)
    url = "http://127.0.0.1:" + str(server.server_address[1]) + "/leveli/?football-local=1"
    print("Локальный модуль «Левели» запущен: " + url, flush=True)
    print("Сервер доступен только на этом Mac. Остановить: Ctrl+C.", flush=True)
    threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nЛокальный сервер остановлен.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
