# Plan

## Goal(s)

1. **Work on the `i3` repo** — cloned at `app/` from
   `https://github.com/FDHKRsss/i3.git` — the existing, working
   Express + Vite/React + PostgreSQL 16 incident-reporting app (latest commits).
2. **Serve the app over HTTPS instead of plain HTTP** via a **Cloudflare Quick
   Tunnel**: the simplest test path — **no custom domain, no Let's Encrypt, no
   opening inbound port 443.** A `cloudflared` process on the host dials
   **out** to Cloudflare and publishes the local HTTP origin as
   `https://<random>.trycloudflare.com`.
3. **Run the app on port 81** (already exposed in the EC2 security group as
   TCP): the origin must be reachable at `http://127.0.0.1:81`, and the tunnel
   command is `cloudflared tunnel --url http://127.0.0.1:81`.

Everything below is a means to these goals. The `app/` project's own PWA
milestones (M1–M15) are already complete and remain as history; the new work is
the **HTTPS-via-Cloudflare-Quick-Tunnel** change (M16–M18 below).

## Constraints (non-negotiable)

- **No Let's Encrypt, no custom domain, no inbound 443.** HTTPS comes from a
  Cloudflare Quick Tunnel (`https://*.trycloudflare.com`): TLS terminates at
  Cloudflare's edge and reaches the app over an **outbound** tunnel.
- **Port 81** is the app's origin port (host + container), configurable via
  `APP_PORT` (host mapping) / `PORT` (container). Never assume a fixed port is
  free.
- The app keeps serving **plain HTTP on the origin** (`http://127.0.0.1:81`);
  the Quick Tunnel supplies the HTTPS. This is exactly the Quick Tunnel model.
- Do **not** write `README.md` (owned by the goal / human gate).
- Validate with `npm test` + `npm run typecheck` (Docker is not available in
  this workspace; the runbook is executed on the target EC2 box).

## Milestones (HTTPS via Cloudflare Quick Tunnel)

Pass 1 = stubs/mocks so the whole thing still runs end-to-end.
Pass 2 = real implementation.

- [x] M16 -- stub  **Port 81 + tunnel origin.** Keep the old `8080` default as
  the "still-works" baseline and only *document* the intended `81` +
  `cloudflared tunnel --url http://127.0.0.1:81` target. *(Subsumed by M16 --
  real, delivered together this turn: the real change is tiny and the old
  `8080` default was itself the stub, so a separate stub pass was not needed.)*
- [x] M16 -- real  **Port 81 + tunnel origin.** `server/index.ts` defaults to
  `PORT=81`; `Dockerfile` runs/exposes `81`; `docker-compose.yml` publishes
  `"${APP_PORT:-81}:81"` with the healthcheck on `81`; `.env.example` sets
  `APP_PORT=81`; `vite.config.ts` dev proxy targets `81`.
  The origin binds **`0.0.0.0:81`** (all interfaces — never loopback-only), so
  both the tunnel's `http://127.0.0.1:81` dial and the pre-existing EC2 TCP
  exposure on 81 work; `tests/workspace-architecture.spec.ts` pins this
  wildcard bind so it cannot drift back to loopback-only.

- [x] M17 -- stub  **Cloudflare Quick Tunnel docs.** Note the intended
  `cloudflared tunnel --url http://127.0.0.1:81` command. *(Subsumed by M17 --
  real, delivered together this turn.)*
- [x] M17 -- real  **Cloudflare Quick Tunnel docs.** `docs/RUNBOOK.md` adds an
  "HTTPS via Cloudflare Quick Tunnel" section and replaces every Let's
  Encrypt / domain / reverse-proxy mandate with the Quick Tunnel command;
  `docs/ARCHITECTURE.md` documents the Quick Tunnel model (no Let's Encrypt, no
  domain, no inbound 443) and the `trycloudflare.com` URL; the in-repo
  `app/docs/*` are updated to match.

- [x] M18 -- stub  **Test re-pin.** Tests still assert the old `8080`. *(Done
  together with M18 -- real this turn.)*
- [x] M18 -- real  **Test re-pin.** `tests/runbook.spec.ts`,
  `tests/docs.spec.ts` and `tests/quicktunnel.spec.ts` re-pinned to port `81`,
  the Quick Tunnel wording, and the M16–M18 state; `npm test` + `npm run
  typecheck` green.

## Current status

- **M16–M18 (stub + real) — complete and green.** The app binds port `81`
  everywhere (server, Dockerfile, compose, env example, Vite dev proxy), the
  runbook/architecture describe the Cloudflare Quick Tunnel path
  (`cloudflared tunnel --url http://127.0.0.1:81` → `https://*.trycloudflare.com`)
  with no domain / Let's Encrypt / inbound 443, and the tests are re-pinned.
  The origin listens on **`0.0.0.0:81`** (all interfaces), and
  `tests/workspace-architecture.spec.ts` pins the workspace-root
  `docs/ARCHITECTURE.md` bind-address wording to that wildcard bind.
  Verified this turn: `npm test` → **186 passed** (24 files) and
  `npm run typecheck` → green (Node 22).
- **Whole goal delivered.** HTTPS is provided by the Cloudflare Quick Tunnel
  with the app kept as a plain-HTTP origin (bound on `0.0.0.0:81`; the tunnel dials `127.0.0.1:81`) — exactly the
  requested model: no custom domain, no Let's Encrypt, no inbound 443. Live
  verification runs on the target EC2 box per `app/docs/RUNBOOK.md`:
  `docker compose up -d` → `cloudflared tunnel --url http://127.0.0.1:81` →
  open the printed `https://…trycloudflare.com` URL on a phone.
- Review signal: `ALL_MILESTONES_DONE`.
