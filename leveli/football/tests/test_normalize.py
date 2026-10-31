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

    def test_invalid_rows_do_not_become_plausible_stats(self):
        payload = {"standings": [{"type": "TOTAL", "table": [
            {"position": -1, "team": {"id": 1, "name": "  North  Club  "}, "points": -3},
            {"position": 1, "team": {"id": 0, "name": "Bad id"}, "points": 8},
        ]}, {"type": "GROUP", "table": None}]}
        items = normalize("PL", 2026, "standings", payload, self.at)["items"]
        self.assertEqual(len(items), 1)
        self.assertIsNone(items[0]["position"])
        self.assertIsNone(items[0]["points"])
        self.assertEqual(items[0]["team"]["name"], "North Club")

    def test_timestamp_normalization_and_invalid_naive_time(self):
        self.assertEqual(normalize("PL", 2026, "matches", {"matches": []}, "2026-10-31T12:00:00+03:00")["fetchedAt"],
                         "2026-10-31T09:00:00Z")
        with self.assertRaises(ValueError):
            normalize("PL", 2026, "matches", {"matches": []}, "2026-10-31T12:00:00")

    def test_entity_text_is_cleaned_and_provider_graphics_are_omitted(self):
        payload = {"scorers": [{"player": {"id": 4, "name": "\n"},
                                "team": {"id": 2, "name": "Team", "crest": "https://crests.example.test/a.svg"}}]}
        item = normalize("PL", 2026, "scorers", payload, self.at)["items"][0]
        self.assertIsNone(item["player"]["name"])
        self.assertNotIn("crest", item["team"])


if __name__ == "__main__":
    unittest.main()
