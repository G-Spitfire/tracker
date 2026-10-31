"""Server-side football-data.org adapter and Firebase snapshot preparation.

The API token is read only from FOOTBALL_KEY. This module is never imported by
the browser and contains no Firebase credentials or production write path.
"""
from __future__ import annotations

import email.utils
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from normalize import LEAGUES, normalize

BASE_URL = "https://api.football-data.org/v4"
SCHEMA_VERSION = 1
MAX_RETRIES = 2
MAX_RESPONSE_BYTES = 2_000_000


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Keep X-Auth-Token confined to the configured provider host."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ProviderError(Exception):
    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _retry_after(value: str | None, now: float) -> float:
    if not value:
        return 6.1
    try:
        delay = float(value)
    except ValueError:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            delay = parsed.timestamp() - now
        except (TypeError, ValueError, OverflowError):
            delay = 6.1
    return min(60.0, max(1.0, delay))


class FootballDataClient:
    """Small rate-limited client. Ten calls/min is the provider's free-plan cap."""

    def __init__(self, token: str | None = None, *, opener=None, clock=time.monotonic,
                 sleep=time.sleep, timeout: float = 15, min_interval: float = 6.1,
                 max_retries: int = MAX_RETRIES):
        self.token = (token if token is not None else os.environ.get("FOOTBALL_KEY", "")).strip()
        if not self.token:
            raise ProviderError("FOOTBALL_KEY is not configured")
        self.opener = opener or urllib.request.build_opener(_NoRedirect()).open
        self.clock = clock
        self.sleep = sleep
        self.timeout = timeout
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.last_request_at: float | None = None

    def _pace(self):
        if self.last_request_at is not None:
            wait = self.min_interval - (self.clock() - self.last_request_at)
            if wait > 0:
                self.sleep(wait)
        self.last_request_at = self.clock()

    def fetch(self, league: str, endpoint: str, season: int) -> dict:
        if league not in LEAGUES:
            raise ValueError("Unsupported league")
        if endpoint not in ("standings", "matches", "scorers"):
            raise ValueError("Unsupported endpoint")
        if type(season) is not int or not 2000 <= season <= 2100:
            raise ValueError("Invalid season")
        query = {"season": str(season)}
        if endpoint == "scorers":
            query["limit"] = "20"
        url = f"{BASE_URL}/competitions/{league}/{endpoint}?{urllib.parse.urlencode(query)}"
        request = urllib.request.Request(url, headers={
            "X-Auth-Token": self.token,
            "Accept": "application/json",
            "User-Agent": "Leveli-football/1.0",
        })
        for attempt in range(self.max_retries + 1):
            self._pace()
            try:
                with self.opener(request, timeout=self.timeout) as response:
                    if response.status != 200:
                        raise ProviderError("Provider returned an unexpected status", status=response.status,
                                            retryable=response.status >= 500)
                    raw = response.read(MAX_RESPONSE_BYTES + 1)
                    if len(raw) > MAX_RESPONSE_BYTES:
                        raise ProviderError("Provider response is too large", status=200)
                    try:
                        payload = json.loads(raw.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                        raise ProviderError("Provider returned invalid JSON", status=200) from exc
                    if not isinstance(payload, dict):
                        raise ProviderError("Provider returned an invalid response", status=200)
                    return payload
            except urllib.error.HTTPError as exc:
                if exc.code == 429 and attempt < self.max_retries:
                    self.sleep(_retry_after(exc.headers.get("Retry-After"), time.time()))
                    continue
                if exc.code >= 500 and attempt < self.max_retries:
                    self.sleep(2 ** attempt)
                    continue
                # Never include response body or request headers in surfaced errors.
                raise ProviderError("Provider rejected the request or data is unavailable", status=exc.code,
                                    retryable=exc.code == 429 or exc.code >= 500) from None
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                if attempt < self.max_retries:
                    self.sleep(2 ** attempt)
                    continue
                raise ProviderError("Provider connection failed", retryable=True) from None
        raise ProviderError("Provider retries exhausted", retryable=True)


class SnapshotCache:
    """Atomic local snapshot cache. It keeps the last valid document on failures."""

    def __init__(self, directory: str | Path):
        self.directory = Path(directory)

    @staticmethod
    def key(league: str, season: int, endpoint: str) -> str:
        return f"{league}_{season}_{endpoint}"

    def path(self, league: str, season: int, endpoint: str) -> Path:
        return self.directory / f"{self.key(league, season, endpoint)}.json"

    def read(self, league: str, season: int, endpoint: str) -> dict | None:
        try:
            value = json.loads(self.path(league, season, endpoint).read_text(encoding="utf-8"))
            if (value.get("schemaVersion") == SCHEMA_VERSION and value.get("league") == league
                    and value.get("season") == season and value.get("endpoint") == endpoint
                    and isinstance(value.get("items"), list) and isinstance(value.get("fetchedAt"), str)):
                return value
        except (OSError, ValueError, AttributeError):
            return None
        return None

    def write(self, snapshot: dict):
        self.directory.mkdir(parents=True, exist_ok=True)
        target = self.path(snapshot["league"], snapshot["season"], snapshot["endpoint"])
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, target)


def prepare_firebase_document(snapshot: dict) -> dict:
    """Return a deterministic, public-football-only Firestore document shape."""
    if not isinstance(snapshot, dict) or snapshot.get("source") != "football-data.org":
        raise ValueError("Snapshot source is invalid")
    endpoint = snapshot.get("endpoint")
    items = snapshot.get("items")
    if not isinstance(items, list):
        raise ValueError("Snapshot items are invalid")
    if endpoint == "standings":
        groups = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            key = (item.get("type"), item.get("stage"), item.get("group"))
            if key not in groups:
                groups[key] = {"type": key[0], "stage": key[1], "group": key[2], "table": []}
            groups[key]["table"].append({name: item.get(name) for name in (
                "position", "team", "playedGames", "won", "draw", "lost", "points",
                "goalsFor", "goalsAgainst", "goalDifference")})
        raw_items = list(groups.values())
    elif endpoint == "matches":
        raw_items = [{**{key:item.get(key) for key in ("id", "utcDate", "status", "stage", "group", "matchday")},
                      "homeTeam":item.get("homeTeam"), "awayTeam":item.get("awayTeam"),
                      "score":{"fullTime":item.get("fullTime")}} for item in items if isinstance(item,dict)]
    elif endpoint == "scorers":
        raw_items = items
    else:
        raise ValueError("Snapshot endpoint is invalid")
    normalized = normalize(snapshot.get("league"), snapshot.get("season"), snapshot.get("endpoint"),
                           {endpoint: raw_items}, snapshot.get("fetchedAt"))
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "football-data.org",
        "league": normalized["league"],
        "season": normalized["season"],
        "endpoint": normalized["endpoint"],
        "fetchedAt": normalized["fetchedAt"],
        "count": normalized["count"],
        "items": normalized["items"],
        "documentId": SnapshotCache.key(normalized["league"], normalized["season"], normalized["endpoint"]),
    }
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 900_000:  # retain headroom below Firestore's 1 MiB document limit
        raise ValueError("Snapshot exceeds the safe Firestore document size")
    return document


def refresh_one(client: FootballDataClient, cache: SnapshotCache, league: str, season: int,
                endpoint: str, *, now=utc_now) -> tuple[dict, str | None]:
    try:
        payload = client.fetch(league, endpoint, season)
        snapshot = normalize(league, season, endpoint, payload, now())
        cache.write(snapshot)
        return snapshot, None
    except (ProviderError, ValueError) as exc:
        existing = cache.read(league, season, endpoint)
        if existing:
            return existing, str(exc)
        raise
