"""Local static viewer tests; no Firebase or external network calls."""
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import local_server


class LocalServerTests(unittest.TestCase):
    def test_manifest_only_lists_expected_json_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "PL_2026_matches.json").write_text("{}", encoding="utf-8")
            (root / "CL_2026_standings.json").write_text("{}", encoding="utf-8")
            (root / "notes.txt").write_text("ignore", encoding="utf-8")
            (root / "not-a-snapshot.json").write_text("{}", encoding="utf-8")
            self.assertEqual(local_server.local_snapshot_names(root), ["PL_2026_matches.json"])

    def test_local_routes_serve_manifest_and_json_without_path_traversal(self):
        with tempfile.TemporaryDirectory() as folder:
            export = Path(folder)
            expected = {"league": "PL", "season": 2026, "endpoint": "matches"}
            (export / "PL_2026_matches.json").write_text(json.dumps(expected), encoding="utf-8")
            (export / "ignored.json").write_text("{}", encoding="utf-8")
            with patch.object(local_server, "EXPORT_DIR", export):
                server = local_server.ThreadingHTTPServer(("127.0.0.1", 0), local_server.LocalFootballHandler)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                base = "http://127.0.0.1:" + str(server.server_address[1])
                try:
                    with urllib.request.urlopen(base + local_server.MANIFEST_PATH) as response:
                        self.assertEqual(json.load(response), {"files": ["PL_2026_matches.json"]})
                    with urllib.request.urlopen(base + local_server.SNAPSHOT_PREFIX + "PL_2026_matches.json") as response:
                        self.assertEqual(json.load(response), expected)
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        urllib.request.urlopen(base + local_server.SNAPSHOT_PREFIX + "%2E%2E%2Fsecret.json")
                    self.assertEqual(caught.exception.code, 404)
                finally:
                    server.shutdown()
                    thread.join()
                    server.server_close()


if __name__ == "__main__":
    unittest.main()
