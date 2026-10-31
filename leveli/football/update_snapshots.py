#!/usr/bin/env python3
"""Fetch selected football snapshots and prepare Firestore-safe JSON documents.

Example: FOOTBALL_KEY=... python3 leveli/football/update_snapshots.py --league PL --season 2026
No Firebase writes are performed by this command.
"""
import argparse
import json
import os
from pathlib import Path

from adapter import FootballDataClient, ProviderError, SnapshotCache, prepare_firebase_document, refresh_one
from normalize import LEAGUES

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description="Обновление футбольного кеша и подготовка JSON для Firestore")
    parser.add_argument("--league", choices=sorted(LEAGUES), action="append", required=True,
                        help="Можно указать несколько раз; каждый запуск использует только запрошенные лиги")
    parser.add_argument("--season", type=int, required=True, help="Год начала сезона")
    parser.add_argument("--endpoint", choices=("standings", "matches", "scorers"), action="append",
                        default=None, help="По умолчанию таблицы и матчи; scorers запрашиваются отдельно")
    parser.add_argument("--allow-deep-data", action="store_true",
                        help="Разрешить endpoint scorers после отдельного согласования стоимости")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".cache" / "snapshots")
    parser.add_argument("--export-dir", type=Path, default=ROOT / ".cache" / "firebase-export")
    args = parser.parse_args()

    cache = SnapshotCache(args.cache_dir)
    endpoints = args.endpoint or ["standings", "matches"]
    if "scorers" in endpoints and not args.allow_deep_data:
        parser.error("scorers входит в платный Deep Data. Флаг --allow-deep-data используйте только после отдельного согласования стоимости.")
    try:
        client = FootballDataClient()
    except ProviderError as exc:
        parser.error(str(exc))

    args.export_dir.mkdir(parents=True, exist_ok=True)
    failed = False
    for league in dict.fromkeys(args.league):
        for endpoint in dict.fromkeys(endpoints):
            try:
                snapshot, warning = refresh_one(client, cache, league, args.season, endpoint)
                document = prepare_firebase_document(snapshot)
                path = args.export_dir / (document["documentId"] + ".json")
                temporary = path.with_suffix(".json.tmp")
                temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(temporary, path)
                freshness = "кеш; API не обновлён" if warning else "обновлено"
                print(f"{document['documentId']}: {freshness}, записей {document['count']}")
                if warning:
                    print(f"  Причина: {warning}")
            except (ProviderError, ValueError, OSError) as exc:
                failed = True
                print(f"{league}/{endpoint}: данные недоступны ({exc})")
    print("Подготовлены JSON-документы Firestore. Облачная запись не выполнялась.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
