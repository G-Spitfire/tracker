# Five-word memorization prototype

The user's detailed request and approved prior discussion authorize this prototype. Preserve Paper styling. Only mug, fist, moss, fence and puddle get the new introduction layout; other words and screens retain their existing rendering. Long scene values remain untouched.

- [x] Capture baseline desktop/mobile screenshots using real manual selection.
- [x] Add a failing browser regression for immediate translation/cue visibility and unchanged recall/progress.
- [x] In app.js add a five-entry short-scene map and a static Paper introduction with English, IPA, named sound button, translation, cue and SVG. Keep existing learnNext and storage paths.
- [x] Scope responsive CSS to the prototype. Reuse the existing SVG rendering for mug through an optional renderer argument; retain its PNG elsewhere.
- [x] Run all unit tests and browser checks at 1440×900, 375×667 and 390×844; check keyboard, sound invocation, reload, scrolling, text enlargement and recall transition. Capture five examples and before/after screenshots.
- [x] Review the diff for changes outside the permitted scope, commit on the prototype branch and create a draft PR without merge/deployment.

Review focus: old flipped checkpoints, mixed sets containing unmodified words, short phone screens, enlarged text, and unchanged recall answers. Baseline: 90/90 unit tests pass at 91a6d7c.

Review complete: no blocking findings; remaining screen-reader label consideration recorded in wordscene/PROTOTYPE.md. Draft PR preparation follows verified changes.
