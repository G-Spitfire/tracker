# School diary sync — integration branch

This directory contains the Mac-side publisher for the encrypted diary snapshot.

## Security model

- The source file `~/school-diary-data.json` is read locally and is never copied into Git.
- The normalized snapshot is encrypted with AES-256-GCM.
- A key is derived with PBKDF2-HMAC-SHA256 (600,000 iterations) and a persistent random 16-byte salt stored locally at `~/Library/Application Support/SchoolDiary/encryption.salt` (mode 0600), so the browser can retain a non-exportable CryptoKey across daily updates.
- The encryption passphrase is stored in macOS Keychain under service `SchoolDiarySync`; it is not stored in this repository or passed on the command line.
- Only `data.enc.json` is committed to the dedicated orphan branch `school-data`. That branch contains no application source files.
- Never put the passphrase in JavaScript, GitHub, shell history, or a support message.

The public encrypted blob is still publicly downloadable if the repository is public. Its confidentiality therefore depends on a strong, unique passphrase of at least 16 characters. Anyone who obtains the passphrase can decrypt it.

## Data semantics

- `marks` is the canonical source for grade records. Lesson-level `estimates` are retained as lesson detail, not added to the grade list.
- The numeric value is taken from `estimate_value_name` (for example, code `4/5` with displayed value `4` becomes numeric 4).
- Homework tasks remain attached to the lesson. The source format shown so far has no explicit due date. The app currently estimates the due date from the next scheduled lesson of the same subject (matched by subject ID), when future schedule data is available. This is an estimate, not an official due date; without matching schedule the task has no estimated due date. Generic placeholders such as `Домашнее задание` and `не задано` are omitted because they contain no actual instruction.
- Empty or malformed child datasets cause publishing to stop, preserving the last published snapshot.

## Mac setup (once)

1. Install the dependency into the existing venv:

```bash
"$HOME/school-diary-venv/bin/python" -m pip install -r school-sync/requirements.txt
```

2. Save a strong passphrase in Keychain. The script prompts twice without echoing it:

```bash
"$HOME/school-diary-venv/bin/python" school-sync/publish.py setup-secret
```

3. Clone the integration branch (or fetch it into the existing test clone):

```bash
git clone --depth 1 --branch feature/real-diary-integration \
  -c core.sshCommand="ssh -i $HOME/.ssh/school_github -o IdentitiesOnly=yes -p 443" \
  git@ssh.github.com:G-Spitfire/tracker.git "$HOME/school-integration"
```

4. Test a publish only after the branch and code have been reviewed:

```bash
"$HOME/school-diary-venv/bin/python" "$HOME/school-integration/school-sync/publish.py" \
  --repo "$HOME/school-integration" publish
```

The publisher uses a separate isolated Git repository at `~/Library/Application Support/SchoolDiary/publish-repo`. It creates/updates an orphan `school-data` branch there; it never switches or deletes files in the application clone, never commits source JSON, and never pushes to `main`.

## Current status

Publisher and browser decryption/cache primitives are committed on the integration branch. The app also includes a live-data mapper and a future-schedule screen (with completed lessons as fallback for dates absent from the schedule). End-to-end Mac collection, automated publishing and mobile-browser validation are not confirmed in this repository. Do not merge into main until a complete two-child collection, encrypted publish, decrypt and UI acceptance test passes.

The local collector.py, Chrome profile, LaunchAgent and its logs live outside GitHub and cannot be audited from this repository alone. A successful GitHub code inspection does not prove that scheduled collection works. The publisher currently requires non-empty marks and lessons for both children, but does not require non-empty future schedules; incomplete schedule exports can therefore pass publication validation. Check this before enabling automatic publication.
