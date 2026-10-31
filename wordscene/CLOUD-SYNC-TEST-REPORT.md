# WordScene cloud sync — test report

**Date:** 31 October 2026
**Branch:** `feature/wordscene-cloud-sync`
**Production deployment:** none

## Changes in this preview

- Local-first Firebase Firestore transport with revision-checked transactions, account-UID path validation, payload validation, nested-array encoding and a 900 KiB payload guard.
- Opt-in two-way snapshot sync on tab return, network recovery and a 30-second interval. Guest learning and local saves remain available offline.
- Remote-only changes are applied only when the local snapshot has not changed and neither copy contains an active session. Both copies are preserved when a conflict is found; no automatic merge is attempted.
- Added conflict download and explicit local/cloud selection. Resolution checks that both snapshots still match the downloaded set; cloud restore backs up the local state first.
- Account buttons regain their enabled state after each operation; sync controls follow the current authenticated UID.
- Added unit tests for sync, transport, offline retries, UID switching, conflict resolution, nested arrays and document-size limits.

## Automated results

Executed locally from the repository root:

```text
node --check wordscene/cloud-ui.js        PASS
node --check wordscene/cloud-sync.js      PASS
node --check wordscene/cloud-firestore.js  PASS
node --test wordscene/tests/*.test.cjs    PASS — 19 tests, 0 failures
git diff --check                          PASS
```

These tests use a deterministic in-memory Firestore adapter. They confirm the client logic; they do not establish that the deployed Firebase project accepts the current rules or Authentication configuration.

## Browser and Firebase checks still required

- The browser tool could not reach the local preview server (`ERR_CONNECTION_REFUSED`). No branch preview URL is configured, so the edited branch has not yet been exercised in a browser.
- Firebase Authentication sign-in and a real Firestore read/write were not performed. The repository contains no Firebase Rules file or Emulator configuration, and no disposable test-account session was available. Existing production rules were not changed.
- Consequently, testing with two real signed-in devices/accounts and the live Firebase project remains pending. Do not treat this report as production approval.

## Limits

- Conflict resolution is explicit snapshot selection with a downloadable backup; the app does not merge simultaneous changes field by field.
- The current Firestore rules must restrict each user's document to their own UID and permit only `users/{uid}/wordscene/state`. Their live state must be inspected before a real write.
- Payloads above 900 KiB are refused client-side. The app does not split large progress into multiple documents.

## One final user check

After making the feature branch available at a test URL (or serving this folder locally over HTTP), use two separate browser profiles signed in to the same test account:

1. On profile A, sign in, inspect the cloud, create the first cloud copy, and enable auto-sync.
2. On profile B, sign in, restore that copy while preserving its local backup, reload, then enable auto-sync.
3. Complete one short word action on A and wait up to 30 seconds for B to receive it. On B, complete a different action and confirm A receives it.
4. Briefly take B offline, make a local change, reconnect, and confirm the change uploads. If both profiles changed while offline, confirm the conflict screen offers a download of both copies and requires an explicit choice.

Use a disposable account and synthetic progress for this check. Do not test with the child's only real progress until the downloadable backup and restore paths have been confirmed.
