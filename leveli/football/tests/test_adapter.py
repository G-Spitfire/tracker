"""Offline adapter, cache and Firebase payload tests. No provider or Firebase calls."""
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import FootballDataClient, ProviderError, SnapshotCache, _NoRedirect, prepare_firebase_document, refresh_one
from firebase_sync import assert_emulator_only, import_documents
from normalize import normalize
from probe import BASE_ENDPOINTS, FREE_ENDPOINTS


class Response:
    status = 200
    def __init__(self, data): self.data = data
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def read(self, size=-1): return json.dumps(self.data).encode()[:size]


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
        self.assertEqual(BASE_ENDPOINTS,("standings","matches"))
        self.assertEqual(FREE_ENDPOINTS["CL"],("matches",))
        self.assertEqual(FREE_ENDPOINTS["PL"],("standings","matches"))

    def test_missing_token_fails_closed(self):
        with self.assertRaisesRegex(ProviderError, "FOOTBALL_KEY"):
            FootballDataClient(token="")

    def test_api_key_redirects_are_not_followed(self):
        request=urllib.request.Request("https://api.football-data.org/v4/matches",headers={"X-Auth-Token":"test"})
        handler=_NoRedirect()
        self.assertIsNone(handler.redirect_request(request,None,302,"Found",{},"https://attacker.test/collect"))

    def test_retries_429_and_obeys_retry_after(self):
        waits=[]
        calls=[]
        def opener(request, timeout):
            calls.append((request,timeout))
            if len(calls)==1:
                raise urllib.error.HTTPError(request.full_url,429,"rate limit",{"Retry-After":"2"},None)
            return Response({"matches":[]})
        client=FootballDataClient("secret-test-token",opener=opener,sleep=waits.append,min_interval=0,max_retries=1)
        self.assertEqual(client.fetch("PL","matches",2026),{"matches":[]})
        self.assertEqual(len(calls),2)
        self.assertEqual(waits,[2.0])
        self.assertEqual(calls[0][0].get_header("X-auth-token"),"secret-test-token")

    def test_rate_limit_waits_between_successful_calls(self):
        moment=[0.0]
        waits=[]
        def sleep(seconds): waits.append(seconds); moment[0]+=seconds
        client=FootballDataClient("test",opener=lambda *_args,**_kwargs:Response({"matches":[]}),
                                 clock=lambda:moment[0],sleep=sleep,min_interval=6.1)
        client.fetch("PL","matches",2026); client.fetch("PL","matches",2026)
        self.assertAlmostEqual(waits[0],6.1)

    def test_cache_atomic_round_trip_and_stale_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            cache=SnapshotCache(folder)
            snapshot=normalize("PL",2026,"matches",{"matches":[]},"2026-10-31T08:00:00Z")
            cache.write(snapshot)
            client=type("BrokenClient",(),{"fetch":lambda *_: (_ for _ in ()).throw(ProviderError("offline",retryable=True))})()
            value,warning=refresh_one(client,cache,"PL",2026,"matches")
            self.assertEqual(value,snapshot)
            self.assertEqual(warning,"offline")
            self.assertFalse(list(Path(folder).glob("*.tmp")))

    def test_firestore_document_ids_and_normalized_standings(self):
        raw={"standings":[{"type":"TOTAL","stage":"LEAGUE_STAGE","group":None,"table":[
            {"position":1,"team":{"id":7,"name":"Demo"},"points":8,"goalsFor":4}]}]}
        snapshot=normalize("PL",2026,"standings",raw,"2026-10-31T08:00:00Z")
        document=prepare_firebase_document(snapshot)
        self.assertEqual(document["documentId"],"PL_2026_standings")
        self.assertEqual(document["items"][0]["team"]["name"],"Demo")
        self.assertEqual(document["count"],1)

    def test_firestore_sync_refuses_non_emulator_targets(self):
        with self.assertRaisesRegex(RuntimeError,"только в локальный"):
            assert_emulator_only("firestore.googleapis.com:443","demo-leveli-football")
        with self.assertRaisesRegex(RuntimeError,"тестовый проект"):
            assert_emulator_only("127.0.0.1:8080","family-school-grades")
        assert_emulator_only("localhost:8080","demo-leveli-football")

    def test_emulator_import_is_idempotent_and_scoped(self):
        with tempfile.TemporaryDirectory() as folder:
            snapshot=normalize("PL",2026,"matches",{"matches":[]},"2026-10-31T08:00:00Z")
            snapshot=prepare_firebase_document(snapshot)
            Path(folder,"PL_2026_matches.json").write_text(json.dumps(snapshot),encoding="utf-8")
            admin,firestore=FakeFirebaseAdmin(),FakeFirestore()
            for _ in range(2):
                result=import_documents(Path(folder),host="127.0.0.1:8080",project="demo-leveli-football",
                                        firestore_module=(admin,firestore))
            self.assertEqual(result,["PL_2026_matches"])
            self.assertEqual(list(firestore.values),[("footballSnapshots","PL_2026_matches")])
            self.assertEqual(admin.deleted,["emulator-app","emulator-app"])

    def test_emulator_import_rejects_unknown_collection_shape_before_init(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,"bad.json").write_text(json.dumps({"documentId":"profiles_unsafe"}),encoding="utf-8")
            admin,firestore=FakeFirebaseAdmin(),FakeFirestore()
            with self.assertRaisesRegex(RuntimeError,"Недопустимая структура"):
                import_documents(Path(folder),host="localhost:8080",project="demo-leveli-football",
                                 firestore_module=(admin,firestore))
            self.assertFalse(hasattr(admin,"app"))


if __name__=="__main__":
    unittest.main()
