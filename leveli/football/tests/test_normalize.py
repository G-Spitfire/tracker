"""Offline unit tests: python3 -m unittest discover -s leveli/football/tests -v"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from normalize import normalize


class NormalizeTests(unittest.TestCase):
    def setUp(self):
        self.at = "2026-10-31T08:00:00Z"

    def test_standings_keep_stage_and_null(self):
        payload = {"standings": [{"type": "TOTAL", "stage": "LEAGUE_STAGE", "group": "A",
                   "table": [{"position": 1, "team": {"id": 1, "name": "A"},
                              "points": None, "goalsFor": 8}]}]}
        data = normalize("CL", 2026, "standings", payload, self.at)
        self.assertEqual(data["items"][0]["stage"], "LEAGUE_STAGE")
        self.assertIsNone(data["items"][0]["points"])
        self.assertEqual(data["items"][0]["goalsFor"], 8)

    def test_matches_preserve_missing_scores(self):
        payload = {"matches": [{"id": 9, "utcDate": "2026-11-01T18:00:00Z",
                   "status": "SCHEDULED", "homeTeam": {"id": 1},
                   "awayTeam": {"id": 2}, "score": {"fullTime": {"home": None, "away": None}}}]}
        item = normalize("PL", 2026, "matches", payload, self.at)["items"][0]
        self.assertEqual(item["fullTime"], {"home": None, "away": None})
        self.assertEqual(item["status"], "SCHEDULED")

    def test_scorers_keep_missing_assists(self):
        payload = {"scorers": [{"player": {"id": 12, "name": "Test"},
                   "team": {"id": 1}, "playedMatches": 5, "goals": 3,
                   "assists": None, "penalties": 0}]}
        item = normalize("PL", 2026, "scorers", payload, self.at)["items"][0]
        self.assertIsNone(item["assists"])
        self.assertEqual(item["penalties"], 0)

    def test_reject_malformed(self):
        with self.assertRaises(ValueError):
            normalize("PL", 2026, "matches", {"matches": {}}, self.at)
        with self.assertRaises(ValueError):
            normalize("XX", 2026, "matches", {"matches": []}, self.at)
        with self.assertRaises(ValueError):
            normalize("PL", 2026, "matches", {"matches": []}, "invalid")

    def test_reject_bool_as_number(self):
        payload = {"scorers": [{"player": {"id": 1}, "goals": True}]}
        self.assertIsNone(normalize("PL", 2026, "scorers", payload, self.at)["items"][0]["goals"])


if __name__ == "__main__":
    unittest.main()
