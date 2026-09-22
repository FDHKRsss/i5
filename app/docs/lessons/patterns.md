# Patterns

_Reusable techniques that worked, so they are reused not rediscovered._

- Docs drift from the repo: before marking a milestone done (or editing docs), grep-verify every
  factual claim in `PLAN.md`/`ARCHITECTURE.md` (tool versions like Vite 5 vs 8, status text, test
  counts) against `package.json` and the actual tree — a stale doc misleads the next agent into
  redoing finished work.
- Make a doc's concrete claims self-verifying: a pin-test (e.g. `tests/runbook.spec.ts`) reads the
  real source and asserts the doc's hard facts (env defaults, schema, served title, API outputs), so
  the doc can't silently drift — a committed spec is stronger than a one-off grep check.
- SPA-fallback tests (`tests/app.spec.ts`) need `dist/index.html`, but a pre-built `dist/` is NOT
  required on a fresh clone: `package.json` has `"pretest": "npm run build:frontend"`, so Vite
  regenerates `dist/` before `vitest` runs. Prove it with `rm -rf dist && npm test` — and read the
  `scripts` block before flagging a "missing pretest" concern (a reviewer claimed none existed when
  the hook was already there).
