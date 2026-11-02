"""Offline adapter, cache and Firebase payload tests. No provider or Firebase calls."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import FootballDataClient, ProviderError, SnapshotCache, prepare_firebase_document, refresh_one
from firebase_sync import assert_emulator_only, import_documents
from normalize import normalize
from probe import BASE_ENDPOINTS, FREE_ENDPOINTS


def curl_result(status=200, payload=None, headers="", returncode=0):
    body = json.dumps(payload or {"matches": []}).encode("utf-8")
    crlf = bytes((13, 10))
    output = (f"HTTP/2 {status}".encode() + crlf + headers.encode() + crlf + crlf + body
              + b"\n__LEVELI_HTTP_STATUS__:" + str(status).encode() + b"\n")
    return subprocess.CompletedProcess([], returncode, output, b"")


class FakeFirebaseAdmin:
    def __init__(self): self.deleted=[]
    def initialize_app(self, **kwargs): self.app=kwargs; return "emulator-app"
    def delete_app(self, app): self.deleted.append(app)


class FakeDocRef:
    def __init__(self, db, collection, document): self.db=db;self.collection_name=collection;self.document=document
    def set(self, value): self.db.values[(self.collection_name,self.document)]=value


class FakeCollection:
    def __init__(self, db, name): self.db=db;self.name=name
    def document(self, document): return FakeDocRef(self.db,self.name,document)


class FakeFirestore:
    def __init__(self): self.values={}
    def client(self, app): return self
    def collection(self, name): return FakeCollection(self,name)


class AdapterTests(unittest.TestCase):
    def test_probe_default_excludes_paid_scorers_endpoint(self):
        self.assertEqual(BASE_ENDPOINTS, ("standings", "matches"))
        self.assertEqual(FREE_ENDPOINTS["CL"], ("matches",))
        self.assertEqual(FREE_ENDPOINTS["PL"], ("standings", "matches"))

    def test_missing_token_fails_closed(self):
        with self.assertRaisesRegex(ProviderError, "FOOTBALL_KEY"):
            FootballDataClient(token="")

    def test_success_passes_token_via_config_stdin_not_argv(self):
        calls = []
        def runner(args, **kwargs):
            calls.append((args, kwargs))
            return curl_result(payload={"matches": []})
        client = FootballDataClient("secret-test-token", runner=runner, min_interval=0)
        self.assertEqual(client.fetch("PL", "matches", 2026), {"matches": []})
        args, kwargs = calls[0]
        self.assertIn("--config", args)
        self.assertIn("--disable", args)
        self.assertNotIn("--location", args)
        self.assertNotIn("secret-test-token", " ".join(args))
        self.assertIn(b"X-Auth-Token: secret-test-token", kwargs["input"])
        self.assertEqual(args[-1], "https://api.football-data.org/v4/competitions/PL/matches?season=2026")

    def test_network_error_retries_then_succeeds(self):
        calls = []
        def runner(args, **kwargs):
            calls.append(args)
            return curl_result(returncode=7) if len(calls) == 1 else curl_result(payload={"matches": []})
        client = FootballDataClient("test-token", runner=runner, sleep=lambda _: None,
                                    min_interval=0, max_retries=1)
        self.assertEqual(client.fetch("PL", "matches", 2026), {"matches": []})
        self.assertEqual(len(calls), 2)

    def test_http_401_and_403_fail_without_retry(self):
        for status in (401, 403):
            with self.subTest(status=status):
                calls = []
                def runner(args, **kwargs):
                    calls.append(args)
                    return curl_result(status=status)
                client = FootballDataClient("test-token", runner=runner, min_interval=0)
                with self.assertRaises(ProviderError) as caught:
                    client.fetch("PL", "matches", 2026)
                self.assertEqual(caught.exception.status, status)
                self.assertEqual(len(calls), 1)

    def test_http_429_obeys_retry_after_and_preserves_final_status(self):
        calls, waits = [], []
        def runner(args, **kwargs):
            calls.append(args)
            return curl_result(status=429, headers="Retry-After: 2") if len(calls) == 1 else curl_result(payload={"matches": []})
        client = FootballDataClient("test-token", runner=runner, sleep=waits.append,
                                    min_interval=0, max_retries=1)
        self.assertEqual(client.fetch("PL", "matches", 2026), {"matches": []})
        self.assertEqual(waits, [2.0])

        client = FootballDataClient("test-token", runner=lambda *_a, **_kw: curl_result(status=429),
                                    sleep=lambda _: None, min_interval=0, max_retries=0)
        with self.assertRaises(ProviderError) as caught:
            client.fetch("PL", "matches", 2026)
        self.assertEqual(caught.exception.status, 429)

    def test_timeout_retries_then_returns_clear_error(self):
        calls = []
        def runner(args, **kwargs):
            calls.append(args)
            raise subprocess.TimeoutExpired(args, timeout=kwargs["timeout"])
        client = FootballDataClient("test-token", runner=runner, sleep=lambda _: None,
                                    min_interval=0, max_retries=1)
        with self.assertRaisesRegex(ProviderError, "timed out"):
            client.fetch("PL", "matches", 2026)
        self.assertEqual(len(calls), 2)

    def test_rate_limit_waits_between_successful_calls(self):
        moment, waits = [0.0], []
        def sleep(seconds):
            waits.append(seconds)
            moment[0] += seconds
        client = FootballDataClient("test-token", runner=lambda *_a, **_kw: curl_result(payload={"matches": []}),
                                    clock=lambda: moment[0], sleep=sleep, min_interval=6.1)
        client.fetch("PL", "matches", 2026)
        client.fetch("PL", "matches", 2026)
        self.assertAlmostEqual(waits[0], 6.1)

    def test_cache_atomic_round_trip_and_stale_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = SnapshotCache(folder)
            snapshot = normalize("PL", 2026, "matches", {"matches": []}, "2026-10-31T08:00:00Z")
            cache.write(snapshot)
            client = type("BrokenClient", (), {"fetch": lambda *_: (_ for _ in ()).throw(
                ProviderError("offline", retryable=True))})()
            value, warning = refresh_one(client, cache, "PL", 2026, "matches")
            self.assertEqual(value, snapshot)
            self.assertEqual(warning, "offline")
            self.assertFalse(list(Path(folder).glob("*.tmp")))

    def test_firestore_document_ids_and_normalized_standings(self):
        raw = {"standings": [{"type": "TOTAL", "stage": "LEAGUE_STAGE", "group": None, "table": [
            {"position": 1, "team": {"id": 7, "name": "Demo"}, "points": 8, "goalsFor": 4}]}]}
        snapshot = normalize("PL", 2026, "standings", raw, "2026-10-31T08:00:00Z")
        document = prepare_firebase_document(snapshot)
        self.assertEqual(document["documentId"], "PL_2026_standings")
        self.assertEqual(document["items"][0]["team"]["name"], "Demo")
        self.assertEqual(document["count"], 1)

    def test_firestore_sync_refuses_non_emulator_targets(self):
        with self.assertRaisesRegex(RuntimeError, "только в локальный"):
            assert_emulator_only("firestore.googleapis.com:443", "demo-leveli-football")
        with self.assertRaisesRegex(RuntimeError, "тестовый проект"):
            assert_emulator_only("127.0.0.1:8080", "family-school-grades")
        assert_emulator_only("localhost:8080", "demo-leveli-football")

    def test_emulator_import_is_idempotent_and_scoped(self):
        with tempfile.TemporaryDirectory() as folder:
            snapshot = normalize("PL", 2026, "matches", {"matches": []}, "2026-10-31T08:00:00Z")
            document = prepare_firebase_document(snapshot)
            Path(folder, "PL_2026_matches.json").write_text(json.dumps(document), encoding="utf-8")
            admin, firestore = FakeFirebaseAdmin(), FakeFirestore()
            for _ in range(2):
                result = import_documents(Path(folder), host="127.0.0.1:8080", project="demo-leveli-football",
                                          firestore_module=(admin, firestore))
            self.assertEqual(result, ["PL_2026_matches"])
            self.assertEqual(list(firestore.values), [("footballSnapshots", "PL_2026_matches")])
            self.assertEqual(admin.deleted, ["emulator-app", "emulator-app"])

    def test_emulator_import_rejects_unknown_collection_shape_before_init(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "bad.json").write_text(json.dumps({"documentId": "profiles_unsafe"}), encoding="utf-8")
            admin, firestore = FakeFirebaseAdmin(), FakeFirestore()
            with self.assertRaisesRegex(RuntimeError, "Недопустимая структура"):
                import_documents(Path(folder), host="localhost:8080", project="demo-leveli-football",
                                 firestore_module=(admin, firestore))
            self.assertFalse(hasattr(admin, "app"))


if __name__ == "__main__":
    unittest.main()
