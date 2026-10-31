#!/usr/bin/env python3
"""Read-only football-data.org v4 API probe for Leveli.

Prompts for the API token without echo when FOOTBALL_KEY is unset.
Only free-plan endpoints are queried. No Firebase writes or files.
"""
import argparse
import getpass
import json
import os
import sys

from adapter import FootballDataClient, ProviderError
from normalize import LEAGUES

ENDPOINTS = ("standings", "matches")


def describe_error(error):
    if error.status == 401:
        return "ключ не принят (HTTP 401)"
    if error.status == 403:
        return "доступ к методу или соревнованию закрыт вашим тарифом (HTTP 403)"
    if error.status == 404:
        return "данные для соревнования или сезона недоступны (HTTP 404)"
    if error.status == 429:
        return "достигнут лимит запросов (HTTP 429)"
    if error.status is not None:
        return f"ошибка API HTTP {error.status}"
    if error.retryable:
        return "не удалось подключиться после повторов; проверьте интернет"
    return str(error)


def main():
    parser = argparse.ArgumentParser(description="Проверка бесплатных методов football-data.org")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--league", choices=sorted(LEAGUES))
    selection.add_argument("--all", action="store_true")
    parser.add_argument("--season", type=int, default=2026,
                        help="год начала сезона (по умолчанию: 2026)")
    args = parser.parse_args()

    token = os.environ.get("FOOTBALL_KEY") or getpass.getpass("API-ключ (ввод скрыт): ")
    if not token.strip():
        parser.error("Не указан API-ключ")
    try:
        client = FootballDataClient(token.strip())
    except ProviderError as error:
        parser.error(str(error))

    leagues = sorted(LEAGUES) if args.all else [args.league]
    total = len(leagues) * len(ENDPOINTS)
    completed = 0
    failed = False
    for league in leagues:
        for endpoint in ENDPOINTS:
            completed += 1
            print(f"[{completed}/{total}] Запрос {league}/{endpoint}…", flush=True)
            try:
                payload = client.fetch(league, endpoint, args.season)
                records = payload.get(endpoint)
                if not isinstance(records, list):
                    raise ValueError("ответ API не содержит ожидаемый список данных")
                result = {"league": league, "endpoint": endpoint, "http": 200, "count": len(records)}
                if endpoint == "standings":
                    result["types"] = [item.get("type") for item in records if isinstance(item, dict)]
                    result["teams_in_total"] = next(
                        (len(item.get("table", [])) for item in records
                         if isinstance(item, dict) and item.get("type") == "TOTAL"), 0)
                else:
                    statuses = {}
                    for match in records:
                        if isinstance(match, dict):
                            state = match.get("status", "UNKNOWN")
                            statuses[state] = statuses.get(state, 0) + 1
                    result["statuses"] = statuses
                print(json.dumps(result, ensure_ascii=False), flush=True)
            except (ProviderError, ValueError) as error:
                failed = True
                message = describe_error(error) if isinstance(error, ProviderError) else str(error)
                print(json.dumps({"league": league, "endpoint": endpoint, "error": message},
                                 ensure_ascii=False), flush=True)

    print("Проверка завершена. Firebase и файлы не изменялись.", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
