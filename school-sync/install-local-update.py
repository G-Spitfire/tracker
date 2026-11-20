#!/usr/bin/env python3
"""One-time safe installer for local SchoolDiary collector improvements."""
import ast
import datetime
import os
import pathlib
import re
import shutil
import tempfile

home = pathlib.Path.home()
base = home / "Library/Application Support/SchoolDiary"
sync_path = base / "sync.py"
collector_path = base / "collector.py"
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

sync_code = '''#!/usr/bin/env python3
"""Scheduled SchoolDiary sync: collect, validate, publish."""
import fcntl
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

home = Path.home()
base = home / "Library/Application Support/SchoolDiary"
python = home / "school-diary-venv/bin/python"
collector = base / "collector.py"
publisher = home / "school-integration/school-sync/publish.py"
data = home / "school-diary-data.json"
lock_path = base / "sync.lockfile"

def log(message):
    print(f"[{datetime.now().astimezone().isoformat(timespec='seconds')}] {message}", flush=True)

def run(args, timeout):
    try:
        subprocess.run(args, check=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Превышено время выполнения ({timeout} с): {Path(args[1]).name}") from exc

def main():
    start = time.monotonic()
    with open(lock_path, "a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("Синхронизация уже выполняется; пропускаю повторный запуск.")
            return 0
        try:
            log("Этап 1: сбор данных")
            run([str(python), str(collector), "--non-interactive"], 300)
            log("Этап 2: проверка данных")
            source = json.loads(data.read_text(encoding="utf-8"))
            for name in ("polina", "matvey"):
                child = source["children"][name]
                if not child.get("marks") or not child.get("lessons"):
                    raise RuntimeError(f"{name}: отсутствуют оценки или уроки")
                if not child.get("schedule"):
                    raise RuntimeError(f"{name}: отсутствует расписание")
            log("Этап 3: шифрование и публикация")
            run([str(python), str(publisher), "--repo", str(home / "school-integration"), "publish"], 120)
            log(f"Синхронизация успешно завершена за {time.monotonic()-start:.1f} с.")
            return 0
        except Exception as exc:
            print(f"[{datetime.now().astimezone().isoformat(timespec='seconds')}] Синхронизация остановлена за {time.monotonic()-start:.1f} с: {exc}", file=sys.stderr, flush=True)
            return 1

if __name__ == "__main__":
    sys.exit(main())
'''

original = collector_path.read_text(encoding="utf-8")
# Preserve the collector in full, changing only Chrome launch retry.
pattern = re.compile(
    r"(?P<indent>^[ \t]*)try:\n"
    r"(?P=indent)[ \t]+context = p\.chromium\.launch_persistent_context\(\n"
    r"(?P=indent)[ \t]+[^\n]*user_data_dir=[^\n]*\n"
    r"(?P=indent)[ \t]+[^\n]*channel='chrome'[^\n]*\)\n"
    r"(?P=indent)except Exception as exc:\n"
    r"(?P=indent)[ \t]+print\('Не удалось запустить Chrome:', type\(exc\)\.__name__\)\n"
    r"(?P=indent)[ \t]+print\('Закройте другое окно прототипа, если оно использует тот же профиль\.'\)\n"
    r"(?P=indent)[ \t]+return 2",
    re.MULTILINE
)
match = pattern.search(original)
if not match:
    raise SystemExit("Остановка без изменений: код запуска Chrome отличается от ожидаемого.")
indent = match.group("indent")
replacement = (
    indent + "for chrome_attempt in range(2):\n"
    + indent + "    try:\n"
    + indent + "        context = p.chromium.launch_persistent_context(\n"
    + indent + "            user_data_dir=str(Path(args.profile).expanduser()),\n"
    + indent + "            channel='chrome', headless=True, accept_downloads=False)\n"
    + indent + "        break\n"
    + indent + "    except Exception as exc:\n"
    + indent + "        if chrome_attempt == 0 and 'timeout' in type(exc).__name__.lower():\n"
    + indent + "            print('Chrome не ответил; повторяю запуск через 10 секунд...', flush=True)\n"
    + indent + "            time.sleep(10)\n"
    + indent + "            continue\n"
    + indent + "        print('Не удалось запустить Chrome:', type(exc).__name__)\n"
    + indent + "        print('Закройте другое окно прототипа, если оно использует тот же профиль.')\n"
    + indent + "        return 2"
)
new_collector = original[:match.start()] + replacement + original[match.end():]
ast.parse(sync_code)
ast.parse(new_collector)
for path, contents in ((sync_path, sync_code), (collector_path, new_collector)):
    backup = path.with_name(path.name + ".backup-" + stamp)
    shutil.copy2(path, backup)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(contents)
        temp = pathlib.Path(handle.name)
    os.chmod(temp, path.stat().st_mode & 0o777)
    os.replace(temp, path)
    print(f"Обновлено: {path.name}; резервная копия: {backup.name}")
print("Готово. Расписание и профиль Chrome не изменены.")
