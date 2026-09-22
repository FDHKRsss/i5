# Known issues

_Recurring walls/gotchas and how to get past them. One bullet each._

- Node/npm are NOT on the default PATH. Prepend `/home/op/.local/node-v22.23.2-linux-x64/bin`
  (matches `.nvmrc` = `22`) before `npm test` / `npm run typecheck`, else `command not found: node`.
- Docker is unavailable in this workspace (`docker: not found`). Validate backend/API behavior with
  the Node test suite (`npm test` + `npm run typecheck`) instead of relying on `docker compose`.
- `npm test` prints `Error: db down` to stderr; this is EXPECTED — the two negative-path specs mock
  `listReports`/`insertReport` rejection (GET `/api/reports` → `503`, POST `/api/report` → `500`).
  Exit code 0 + all tests passing means the suite is green, not broken.
- Doc test-count claims are pinned to the **committed** tree, but `npm test` runs the **working**
  tree. Verify against the working tree (the runner's `N passed`, or `grep -c '^\\s*it('` /
  `^\\s*test(`), NOT `git show HEAD`: a reviewer read HEAD (`43`) as "matching" while the
  runner/working tree had `46`.
- Critic verdicts are unreliable — even when handed the goal, `docs/PLAN.md`, and the prior actor's
  output, the critic can still emit a non-verdict (`approved:false` with `Could not parse the
  critic's verdict as JSON`, `No task/goal, plan, or actor output`, or `need more steps`). Treat any
  reply that is not a single strict-JSON `{approved, blocking_issues, cosmetic_issues, notes}` object
  as "not reviewed"; always include the goal + plan + last actor output when invoking a reviewer.
- The seed's `src/app.spec.tsx` smoke test pinned the seed's capture-screen copy; a UI milestone that
  replaces that copy (M8 → Home) makes it fail legitimately. It is a test-owned file — rewrite it to
  pin the new flow rather than leaving it red or touching production code.
