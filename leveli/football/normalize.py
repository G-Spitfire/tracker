"""Pure, versioned normalization of football-data.org v4 responses.

No network, Firebase, credentials or user data. Missing values remain null.
"""
from datetime import datetime, timezone
import re

SCHEMA_VERSION = 1
LEAGUES = frozenset(("PL", "PD", "SA", "BL1", "FL1", "CL"))
STATUSES = frozenset(("SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED", "POSTPONED", "SUSPENDED", "CANCELLED"))


def _integer(value, *, minimum=0):
    """Accept real API integers only; never turn booleans or numeric strings into data."""
    return value if type(value) is int and value >= minimum else None


def _text(value, *, limit=160):
    if not isinstance(value, str):
        return None
    value = re.sub(r"\s+", " ", value).strip()
    if not value or len(value) > limit or any(ord(char) < 32 for char in value):
        return None
    return value


def _entity(value):
    if not isinstance(value, dict):
        return None
    identifier = _integer(value.get("id"), minimum=1)
    if identifier is None:
        return None
    # Provider graphics are omitted until separate rights are confirmed.
    return {"id": identifier, "name": _text(value.get("name")),
            "shortName": _text(value.get("shortName"), limit=80)}


def _timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def normalize(league, season, endpoint, payload, fetched_at):
    if league not in LEAGUES:
        raise ValueError("Unsupported league")
    if type(season) is not int or not 2000 <= season <= 2100:
        raise ValueError("Invalid season")
    if endpoint not in ("standings", "matches", "scorers"):
        raise ValueError("Unsupported endpoint")
    if not isinstance(payload, dict) or not isinstance(payload.get(endpoint), list):
        raise ValueError("Invalid API response")
    timestamp = _timestamp(fetched_at)
    if timestamp is None:
        raise ValueError("Invalid fetched_at")
    records = payload[endpoint]
    if endpoint == "standings":
        items = []
        for group in records:
            if not isinstance(group, dict) or not isinstance(group.get("table"), list):
                continue
            stage = _text(group.get("stage"), limit=80)
            group_name = _text(group.get("group"), limit=80)
            for row in group["table"]:
                if not isinstance(row, dict) or _entity(row.get("team")) is None:
                    continue
                items.append({"type": _text(group.get("type"), limit=40), "stage": stage, "group": group_name,
                              "position": _integer(row.get("position"), minimum=1), "team": _entity(row.get("team")),
                              "playedGames": _integer(row.get("playedGames")), "won": _integer(row.get("won")),
                              "draw": _integer(row.get("draw")), "lost": _integer(row.get("lost")),
                              "points": _integer(row.get("points")), "goalsFor": _integer(row.get("goalsFor")),
                              "goalsAgainst": _integer(row.get("goalsAgainst")),
                              "goalDifference": _integer(row.get("goalDifference"))})
    elif endpoint == "matches":
        items = []
        for row in records:
            if not isinstance(row, dict) or _integer(row.get("id"), minimum=1) is None:
                continue
            score = row.get("score") if isinstance(row.get("score"), dict) else {}
            full = score.get("fullTime") if isinstance(score.get("fullTime"), dict) else {}
            items.append({"id": row["id"], "utcDate": _timestamp(row.get("utcDate")),
                          "status": row.get("status") if row.get("status") in STATUSES else None,
                          "stage": _text(row.get("stage"), limit=80), "group": _text(row.get("group"), limit=80),
                          "matchday": _integer(row.get("matchday"), minimum=1),
                          "homeTeam": _entity(row.get("homeTeam")), "awayTeam": _entity(row.get("awayTeam")),
                          "fullTime": {"home": _integer(full.get("home")), "away": _integer(full.get("away"))}})
    else:
        items = []
        for row in records:
            if not isinstance(row, dict) or _entity(row.get("player")) is None:
                continue
            items.append({"player": _entity(row.get("player")), "team": _entity(row.get("team")),
                          "playedMatches": _integer(row.get("playedMatches")),
                          "goals": _integer(row.get("goals")), "assists": _integer(row.get("assists")),
                          "penalties": _integer(row.get("penalties"))})
    return {"schemaVersion": SCHEMA_VERSION, "source": "football-data.org",
            "league": league, "season": season, "endpoint": endpoint,
            "fetchedAt": timestamp, "count": len(items), "items": items}
