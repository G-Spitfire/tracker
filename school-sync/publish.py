#!/usr/bin/env python3
"""Validate, normalize, encrypt and publish the School diary snapshot.

The source JSON and passphrase never enter Git. Only data.enc.json is committed.
Requires: pip install -r requirements.txt
"""
from __future__ import annotations
import argparse, base64, getpass, json, os, subprocess, sys
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

APP_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = Path.home() / "school-diary-data.json"
DATA_BRANCH = "school-data"
DATA_PATH = "data.enc.json"
KEYCHAIN_SERVICE = "SchoolDiarySync"
EXPECTED_CHILDREN = {"polina", "matvey"}

def parse_date(value: str) -> str:
    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            pass
    raise ValueError(f"Unsupported diary date: {value!r}")

def normalize(source: dict) -> dict:
    if not isinstance(source, dict) or not isinstance(source.get("children"), dict):
        raise ValueError("Invalid source: expected an object with children")
    children = source["children"]
    if not EXPECTED_CHILDREN.issubset(children):
        raise ValueError("Both expected child datasets (polina, matvey) are required")
    normalized = {}
    for child_id in sorted(EXPECTED_CHILDREN):
        child = children[child_id]
        marks, lessons = child.get("marks"), child.get("lessons")
        if not isinstance(marks, list) or not isinstance(lessons, list):
            raise ValueError(f"{child_id}: marks/lessons must be arrays")
        if not marks or not lessons:
            raise ValueError(f"{child_id}: empty marks or lessons; refusing to publish")
        clean_marks = []
        seen = set()
        for mark in marks:
            if not isinstance(mark, dict):
                raise ValueError(f"{child_id}: malformed mark")
            value = mark.get("estimate_value_name")
            if value not in {"2", "3", "4", "5"}:
                continue
            item = {
                "id": str(mark.get("id", "")),
                "lessonId": str(mark.get("lesson_id", "")),
                "subjectId": str(mark.get("subject_id", "")),
                "subject": str(mark.get("subject_name") or "Без названия"),
                "date": parse_date(mark.get("date")),
                "value": int(value),
                "typeCode": str(mark.get("estimate_type_code") or ""),
                "type": str(mark.get("estimate_type_name") or ""),
                "comment": mark.get("estimate_comment"),
            }
            key = item["id"] or json.dumps(item, ensure_ascii=False, sort_keys=True)
            if key not in seen:
                seen.add(key)
                clean_marks.append(item)
        clean_lessons = []
        for lesson in lessons:
            if not isinstance(lesson, dict):
                raise ValueError(f"{child_id}: malformed lesson")
            start = datetime.strptime(lesson["datetime_from"], "%d.%m.%Y %H:%M:%S")
            end = datetime.strptime(lesson["datetime_to"], "%d.%m.%Y %H:%M:%S")
            tasks = []
            for task in lesson.get("tasks") or []:
                if not isinstance(task, dict):
                    continue
                tasks.append({
                    "name": str(task.get("task_name") or "").strip(),
                    "kind": str(task.get("task_kind_name") or task.get("task_kind_code") or ""),
                    "files": task.get("files") if isinstance(task.get("files"), list) else [],
                })
            estimates = []
            for estimate in lesson.get("estimates") or []:
                if isinstance(estimate, dict):
                    estimates.append({
                        "value": str(estimate.get("estimate_value_name") or ""),
                        "type": str(estimate.get("estimate_type_name") or ""),
                        "comment": estimate.get("estimate_comment"),
                    })
            clean_lessons.append({
                "id": str((lesson.get("identity") or {}).get("id") or ""),
                "number": lesson.get("number"),
                "from": start.isoformat(timespec="minutes"),
                "to": end.isoformat(timespec="minutes"),
                "subjectId": str(lesson.get("subject_id") or ""),
                "subject": str(lesson.get("subject_name") or "Без названия"),
                "topic": lesson.get("content_name"),
                "description": lesson.get("content_description"),
                "materials": lesson.get("content_additional_material"),
                "tasks": tasks,
                "estimates": estimates,
            })
        normalized[child_id] = {
            "marks": sorted(clean_marks, key=lambda x: (x["date"], x["subject"])),
            "lessons": sorted(clean_lessons, key=lambda x: x["from"]),
        }
    return {
        "schemaVersion": 1,
        "generatedAt": source.get("generated_at"),
        "period": source.get("period") or {},
        "children": normalized,
    }

def get_secret() -> bytes:
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-a", getpass.getuser(), "-s", KEYCHAIN_SERVICE, "-w"],
            check=True, capture_output=True, text=True,
        )
        secret = result.stdout.rstrip("\n")
    except (subprocess.CalledProcessError, FileNotFoundError):
        raise RuntimeError("Encryption passphrase not found in macOS Keychain. Run: python publish.py setup-secret")
    if len(secret) < 12:
        raise RuntimeError("Passphrase must contain at least 12 characters")
    return secret.encode("utf-8")

def setup_secret() -> None:
    first = getpass.getpass("Create encryption passphrase (12+ characters): ")
    second = getpass.getpass("Repeat passphrase: ")
    if first != second or len(first) < 12:
        raise RuntimeError("Passphrases do not match or are shorter than 12 characters")
    subprocess.run([
        "security", "add-generic-password", "-U", "-a", getpass.getuser(),
        "-s", KEYCHAIN_SERVICE, "-w", first,
    ], check=True)
    print("Encryption passphrase saved in macOS Keychain.")

def encrypt(payload: dict, secret: bytes) -> str:
    salt, nonce = os.urandom(16), os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600_000)
    key = kdf.derive(secret)
    plaintext = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, b"school-diary-v1")
    envelope = {
        "format": "school-diary-encrypted",
        "version": 1,
        "kdf": "PBKDF2-SHA256",
        "iterations": 600000,
        "cipher": "AES-256-GCM",
        "salt": base64.b64encode(salt).decode(),
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
    }
    return json.dumps(envelope, separators=(",", ":")) + "\n"

def git(repo: Path, *args: str) -> str:
    p = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)
    return p.stdout.strip()

def publish(repo: Path, encrypted: str) -> None:
    if not (repo / ".git").exists():
        raise RuntimeError(f"Not a git repository: {repo}")
    # Use a dedicated data branch; never publish to main or the application branch.
    branches = git(repo, "branch", "--list", DATA_BRANCH)
    current = git(repo, "branch", "--show-current")
    if current != DATA_BRANCH:
        if branches:
            git(repo, "switch", DATA_BRANCH)
        else:
            git(repo, "switch", "--orphan", DATA_BRANCH)
            # An orphan branch must not inherit source files.
            for p in (repo / ".").iterdir():
                if p.name != ".git":
                    if p.is_dir():
                        import shutil; shutil.rmtree(p)
                    else:
                        p.unlink()
    target = repo / DATA_PATH
    target.write_text(encrypted, encoding="utf-8")
    os.chmod(target, 0o600)
    git(repo, "add", DATA_PATH)
    # Do not create a commit if the ciphertext is byte-identical (normally nonce changes).
    git(repo, "-c", "user.name=School Diary Sync", "-c",
        "user.email=school-sync@users.noreply.github.com",
        "commit", "-m", "chore: publish encrypted school diary snapshot")
    git(repo, "push", "-u", "origin", DATA_BRANCH)
    print(f"Published encrypted snapshot to branch {DATA_BRANCH} (file {DATA_PATH}).")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.home() / "school-sync-test",
                        help="local clone of G-Spitfire/tracker")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("command", nargs="?", choices=["publish", "setup-secret"], default="publish")
    args = parser.parse_args()
    if args.command == "setup-secret":
        setup_secret()
        return
    source = json.loads(args.data.read_text(encoding="utf-8"))
    payload = normalize(source)
    secret = get_secret()
    encrypted = encrypt(payload, secret)
    publish(args.repo.expanduser(), encrypted)
    for child, values in payload["children"].items():
        print(f"{child}: {len(values['marks'])} marks, {len(values['lessons'])} lessons")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
