#!/usr/bin/env python3
"""Read-only football-data.org v4 API probe for Leveli.

No Firebase writes, no persistent API key, no output of personal data.
Usage: python3 leveli/football/probe.py --league PL
       python3 leveli/football/probe.py --league PL --allow-deep-data
       python3 leveli/football/probe.py --all
"""
import argparse
import getpass
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from adapter import _NoRedirect

BASE = "https://api.football-data.org/v4"
LEAGUES = ("PL", "PD", "SA", "BL1", "FL1", "CL")
BASE_ENDPOINTS = ("standings", "matches")


def fetch(league, endpoint, token, season, timeout=25):
    params = {"season": str(season)}
    if endpoint == "scorers":
        params["limit"] = "20"
    url = f"{BASE}/competitions/{league}/{endpoint}?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        "X-Auth-Token": token,
        "Accept": "application/json",
        "User-Agent": "Leveli-football-probe/0.1",
    })
    for attempt in range(3):
        try:
            with urllib.request.build_opener(_NoRedirect()).open(request, timeout=timeout) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            code = error.code
            if code == 429 and attempt < 2:
                wait = error.headers.get("Retry-After", "60")
                try:
                    delay = min(120, max(7, int(wait)))
                except ValueError:
                    delay = 60
                print(f"  HTTP 429, повтор через {delay} с")
                time.sleep(delay)
                continue
            return code, {"error": "HTTP error"}
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            if attempt == 2:
                return None, {"error": type(error).__name__}
            time.sleep(6.1 * (attempt + 1))
    return None, {"error": "Retries exhausted"}


def summarize(league, endpoint, status, payload):
    if status != 200:
        return {"league": league, "endpoint": endpoint, "http": status,
                "error": payload.get("error", "unknown")}
    records = payload.get(endpoint, [])
    result = {"league": league, "endpoint": endpoint, "http": status,
              "count": len(records)}
    if endpoint == "standings":
        result["types"] = [item.get("type") for item in records]
        result["teams_in_total"] = next(
            (len(item.get("table", [])) for item in records if item.get("type") == "TOTAL"), 0)
    elif endpoint == "matches":
        result["statuses"] = {}
        for match in records:
            state = match.get("status", "UNKNOWN")
            result["statuses"][state] = result["statuses"].get(state, 0) + 1
        result["has_matchday"] = any(m.get("matchday") is not None for m in records)
    elif endpoint == "scorers":
        result["fields"] = sorted(set().union(*(set(x.keys()) for x in records))) if records else []
        result["players_with_assists"] = sum(x.get("assists") is not None for x in records)
    return result


def main():
    parser = argparse.ArgumentParser(description="Проверка футбольного API без записи данных")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--league", choices=LEAGUES)
    selection.add_argument("--all", action="store_true")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--delay", type=float, default=7)
    parser.add_argument("--allow-deep-data", action="store_true",
                        help="Дополнительно запросить scorers из платного Deep Data после согласования стоимости")
    args = parser.parse_args()
    token = os.environ.get("FOOTBALL_KEY") or getpass.getpass("API-ключ (не отображается): ")
    if not token.strip():
        parser.error("Не указан API-ключ")
    leagues = LEAGUES if args.all else (args.league,)
    endpoints = BASE_ENDPOINTS + (("scorers",) if args.allow_deep_data else ())
    for league in leagues:
        for endpoint in endpoints:
            status, payload = fetch(league, endpoint, token.strip(), args.season)
            print(json.dumps(summarize(league, endpoint, status, payload), ensure_ascii=False))
            time.sleep(max(6.1, args.delay))
    print("Проверка завершена. Firebase и файлы не изменялись.")


if __name__ == "__main__":
    main()
