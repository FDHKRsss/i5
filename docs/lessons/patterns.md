# Patterns

_Reusable techniques that worked, so they are reused not rediscovered._

- Pin the *actual runtime defaults* in tests (server `PORT` default, `Dockerfile` `EXPOSE`, compose healthcheck URL, Vite proxy target), not just the docs — otherwise code↔docs port/config drift goes undetected.
- Pin hard constraints that live in the docs too: `app/tests/workspace-architecture.spec.ts` asserts the workspace-root `docs/ARCHITECTURE.md` says the origin binds `0.0.0.0:81` (present) and not `127.0.0.1` (absent), so a "simplification" back to loopback-only is caught mechanically rather than only in review.
