# Failures

_Regressions: what broke, the proven root cause, and the fix._

- `GET /api/reports` returned the raw `pg` row, leaking the internal `created_at` (a `Date`); the
  HTTP-layer test pins the public shape to `{ id }`, so the extra key broke deep-equal. Fix: map each
  row to an explicit public object in `server/index.ts` that strips `created_at` (kept only as an
  internal SQL ordering detail).
- M6 was marked complete without its named `docs/RUNBOOK.md` deliverable (the `docker compose up`
  end-to-end verification): Docker being unavailable led to substituting the Node suite for the doc.
  Fix: write the runbook anyway — a validation method is not a substitute for a named deliverable.
