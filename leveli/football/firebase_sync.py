#!/usr/bin/env python3
"""Optional Firestore Emulator importer. It cannot target production Firebase."""
import argparse
import json
import os
import re
import sys
from pathlib import Path


def assert_emulator_only(host: str | None, project: str | None):
    if not host or not project:
        raise RuntimeError("Для синхронизации нужны FIRESTORE_EMULATOR_HOST и FIREBASE_PROJECT_ID")
    hostname = host.rsplit(":", 1)[0].strip("[]").lower()
    if hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Запись разрешена только в локальный Firestore Emulator")
    if project != "demo-leveli-football":
        raise RuntimeError("Допустим только тестовый проект demo-leveli-football")


def import_documents(directory: Path, *, host: str | None, project: str | None, firestore_module=None):
    assert_emulator_only(host, project)
    files=sorted(directory.glob("*.json"))
    if not files:
        raise RuntimeError("В каталоге нет подготовленных JSON-документов")
    documents=[]
    for path in files:
        data=json.loads(path.read_text(encoding="utf-8"))
        expected=f"{data.get('league')}_{data.get('season')}_{data.get('endpoint')}"
        if (data.get("schemaVersion")!=1 or data.get("source")!="football-data.org"
                or data.get("documentId")!=expected or not re.fullmatch(r"(?:PL|PD|SA|BL1|FL1|CL)_\d{4}_(?:standings|matches|scorers)", expected)):
            raise RuntimeError(f"Недопустимая структура или путь документа: {path.name}")
        documents.append((expected,data))
    if firestore_module is None:
        try:
            import firebase_admin
            from firebase_admin import firestore
            firestore_module=(firebase_admin,firestore)
        except ImportError as exc:
            raise RuntimeError("Для записи в Emulator установите firebase-admin") from exc
    firebase_admin, firestore = firestore_module
    os.environ["FIRESTORE_EMULATOR_HOST"]=host
    app=firebase_admin.initialize_app(options={"projectId":project},name="leveli-football-emulator")
    db=firestore.client(app=app)
    try:
        for document_id,data in documents:
            # Stable document IDs + replacement writes make repeated imports idempotent.
            db.collection("footballSnapshots").document(document_id).set(data)
    finally:
        firebase_admin.delete_app(app)
    return [document_id for document_id,_ in documents]


def main():
    parser=argparse.ArgumentParser(description="Запись только в локальный Firestore Emulator")
    parser.add_argument("--input-dir",type=Path,default=Path(__file__).resolve().parent/".cache"/"firebase-export")
    args=parser.parse_args()
    try:
        ids=import_documents(args.input_dir,host=os.environ.get("FIRESTORE_EMULATOR_HOST"),project=os.environ.get("FIREBASE_PROJECT_ID"))
    except (OSError,ValueError,RuntimeError) as exc:
        print(f"Импорт отменён: {exc}",file=sys.stderr)
        return 2
    print(f"В локальный Emulator записано документов: {len(ids)}")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
