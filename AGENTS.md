# Repository instructions for coding agents

This repository contains independent static web applications published through GitHub Pages:
- `forma/` — Forma, a personal fitness and workout tracker.
- `wordscene/` — Workscene (directory and existing product documentation use WordScene), an English vocabulary learning PWA.
- **Школа** — a planned school application; do not assume its directory, stack, or implementation exists.

## Scope and sources of truth
- Read the root `README.md` and the affected application's `README.md` before changing code.
- For Workscene, also read `wordscene/SPEC.md` and preserve its product rules. Do not silently rename paths, app titles, or storage keys.
- Keep applications independent: never modify another app's files, storage, service-worker caches, or behavior unless explicitly requested.
- Preserve the existing no-build, GitHub Pages deployment model unless a migration is separately approved.

## Modern web development
- Consult the installed GoogleChrome Modern Web Guidance plugin for relevant implementation choices; its advice is guidance, not a mandate to refactor.
- Prefer established platform APIs, semantic HTML, accessible controls, responsive layouts, and progressive enhancement when they simplify the solution.
- Verify browser support before introducing newer APIs or CSS, especially mobile Safari on iPhone and Chrome.
- Avoid unnecessary dependencies, build tools, frameworks, and abstractions. Explain significant trade-offs before introducing them.
- Consider keyboard access, focus visibility, readable contrast, reduced-motion preferences, safe-area insets, and narrow screens where relevant.
- Treat performance and offline behavior as user-facing requirements; test rather than assume improvements.

## Data and offline safety
- Existing apps store user progress locally. Never reset, rename, migrate, or delete persistent data without an explicit, backward-compatible migration plan and tests.
- For Forma, preserve `forma12_v1`, legacy training history, and JSON export/import compatibility. Respect the separate `forma_theme` preference.
- For Workscene, preserve progress, session recovery, existing saved-data compatibility, and the learning/review rules documented in `SPEC.md`.
- Keep service-worker cache namespaces scoped to their own application; assess update and offline behavior for changes to cached assets.
- Do not add telemetry, third-party data transfer, accounts, or backend synchronization without explicit approval.

## Change process
1. Identify the affected app and read its docs and tests.
2. Make the smallest change that solves the requested problem; preserve current UX and functionality unless changes are requested.
3. For Workscene, run `node --test wordscene/*.test.cjs` when Node.js is available; run relevant browser checks when Playwright is installed.
4. For Forma, manually verify the affected flows, persistence, import/export, theme behavior, and mobile layout as applicable; do not claim automated coverage that does not exist.
5. Verify offline/service-worker updates when touching PWA assets or caching.
6. Summarize what changed, checks actually run, outstanding risks, and any checks that could not be run.

## Future school application
- Refer to the planned product as **Школа**.
- During design, establish requirements, data boundaries, privacy/security expectations, supported browsers, and a test strategy before selecting architecture.
- Do not copy implementation or persistent-data assumptions from the other applications automatically.
