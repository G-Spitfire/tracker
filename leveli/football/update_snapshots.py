#!/usr/bin/env python3
"""Fetch free football snapshots and prepare local JSON files.

No Firebase writes are performed. Prompts for FOOTBALL_KEY without echo if unset.
"""
import argparse
import getpass
import json
import os
from pathlib import Path

from adapter import FootballDataClient, ProviderError, SnapshotCache, prepare_firebase_document, refresh_one
from normalize import LEAGUES

ROOT = Path(__file__).resolve().parent


def describe_error(error):
    if isinstance(error, ProviderError):
        if error.status == 401:
            return "ключ не принят (HTTP 401)"
        if error.status == 403:
            return "доступ закрыт для ключа/тарифа (HTTP 403)"
        if error.status == 404:
            return "данные турнира или сезона недоступны (HTTP 404)"
        if error.status == 429:
            return "достигнут лимит запросов (HTTP 429)"
        if error.status is not None:
            return f"ошибка API HTTP {error.status}"
        if error.retryable:
            return "ошибка соединения после повторов; проверьте интернет"
    return str(error)


def main():
    parser = argparse.ArgumentParser(description="Скачать футбольные данные в локальные JSON")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--league", choices=sorted(LEAGUES), action="append",
                           help="Можно указать несколько раз")
    selection.add_argument("--all", action="store_true", help="Все шесть турниров")
    parser.add_argument("--season", type=int, required=True, help="Год начала сезона")
    parser.add_argument("--endpoint", choices=("standings", "matches", "scorers"), action="append",
                        default=None, help="По умолчанию бесплатные таблицы и матчи")
    parser.add_argument("--allow-deep-data", action="store_true",
                        help="Не используется при первом бесплатном запуске")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".cache" / "snapshots")
    parser.add_argument("--export-dir", type=Path, default=ROOT / ".cache" / "firebase-export")
    args = parser.parse_args()

    endpoints = list(dict.fromkeys(args.endpoint or ["standings", "matches"]))
    if "scorers" in endpoints:
        parser.error("scorers не входит в бесплатные методы; удалите --endpoint scorers")
    token = os.environ.get("FOOTBALL_KEY") or getpass.getpass("API-ключ (ввод скрыт): ")
    if not token.strip():
        parser.error("Не указан API-ключ")
    try:
        client = FootballDataClient(token.strip())
    except ProviderError as error:
        parser.error(str(error))

    leagues = sorted(LEAGUES) if args.all else list(dict.fromkeys(args.league))
    cache = SnapshotCache(args.cache_dir)
    args.export_dir.mkdir(parents=True, exist_ok=True)
    endpoints_by_league = {league: tuple(endpoint for endpoint in requested_endpoints\n        if endpoint != "standings" or league != "CL") for league in leagues}\n    total = sum(len(endpoints) for endpoints in endpoints_by_league.values())
    completed = 0
    failed = False
    for league in leagues:
        if "standings" in requested_endpoints and league == "CL":\n            print("CL/standings: пропущено (метод таблицы недоступен для кубкового турнира)", flush=True)\n        for endpoint in endpoints_by_league[league]:
            completed += 1
            print(f"[{completed}/{total}] Загружаю {league}/{endpoint}…", flush=True)
            try:
                snapshot, warning = refresh_one(client, cache, league, args.season, endpoint)
                document = prepare_firebase_document(snapshot)
                path = args.export_dir / (document["documentId"] + ".json")
                temporary = path.with_suffix(".json.tmp")
                temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(temporary, path)
                freshness = "кеш; API не обновлён" if warning else "загружено"
                print(f"{document['documentId']}: {freshness}, записей {document['count']}", flush=True)
                if warning:
                    print(f"  {warning}", flush=True)
            except (ProviderError, ValueError, OSError) as error:
                failed = True
                print(f"{league}/{endpoint}: {describe_error(error)}", flush=True)
    print(f"Готово. Локальные JSON сохранены в: {args.export_dir}", flush=True)
    print("Firebase и Firestore не изменялись.", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
