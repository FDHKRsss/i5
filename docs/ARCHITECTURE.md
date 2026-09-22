# Architecture

## Overview

The goal is to take the existing `i3` app (cloned at `app/`, a working
Express + Vite/React + PostgreSQL 16 incident-reporting PWA) and serve it over
**HTTPS** with the least possible setup. We use a **Cloudflare Quick Tunnel**
instead of a domain + Let's Encrypt reverse proxy.

```
Phone ──HTTPS──> Cloudflare edge (https://<random>.trycloudflare.com)
                   │  outbound-only tunnel (cloudflared, QUIC/HTTP2)
                   ▼
             cloudflared on host  ──HTTP──>  app (Express) on 127.0.0.1:81
                                                └─ PostgreSQL (internal)
```

Key points:

- **No domain**: Cloudflare issues a random `https://<random>.trycloudflare.com`
  hostname; you do not add a site to Cloudflare DNS.
- **No Let's Encrypt**: TLS terminates at Cloudflare's edge; the app itself
  stays a plain-HTTP origin.
- **No inbound 443**: `cloudflared` makes an *outbound* connection to
  Cloudflare, so the EC2 security group does not need port 443 (nor any other
  inbound port) for the tunnel to work.
- **Port 81**: the app binds `0.0.0.0:81` (host + container), and the tunnel
  command is `cloudflared tunnel --url http://127.0.0.1:81`.

## Chosen approach

| Concern | Choice | Why (vs. alternatives) |
|---|---|---|
| HTTPS | **Cloudflare Quick Tunnel** (`cloudflared tunnel --url …`) | zero setup (no account/domain/DNS), random `trycloudflare.com` URL; matches "najprostsze na test". |
| TLS termination | Cloudflare edge | the browser sees HTTPS → camera/GPS (secure context) work; no Let's Encrypt. |
| Origin port | **81** (env-configurable) | the user already runs it on 81 and has it open in EC2. |
| Inbound ports | **none required** for the tunnel | cloudflared dials out; Quick Tunnel = "no open ports required". |
| Reverse proxy / Caddy / Let's Encrypt | **removed from the docs** | the goal explicitly forbids them ("bez lets encrypt"). |

## Port & resource handling

- `APP_PORT` (host mapping, default `81`) and `PORT` (container, default `81`).
  Never assume a fixed port is free — change `APP_PORT` if `81` is taken.
- Port 81 is a privileged port (< 1024) on Linux. The container runs as root
  (the stock `node:22-alpine` image), so it can bind it; running bare
  `npm start` on 81 requires root or `CAP_NET_BIND_SERVICE` (see the runbook).
- Postgres stays internal-only (no host port) to avoid `5432` conflicts.

## What is in the code (after this change)

- `app/server/index.ts` — `PORT` default `81` (listens on `0.0.0.0:81`).
- `app/Dockerfile` — `ENV PORT=81`, `EXPOSE 81`.
- `app/docker-compose.yml` — `"${APP_PORT:-81}:81"`, healthcheck on `:81`.
- `app/.env.example` — `APP_PORT=81`.
- `app/vite.config.ts` — dev proxy targets `81`.
- `app/docs/RUNBOOK.md` — Quick Tunnel run steps (install cloudflared → run →
  open the printed URL).
- `app/docs/ARCHITECTURE.md` — Quick Tunnel model + port 81.
- `app/tests/quicktunnel.spec.ts` — pins the runtime `PORT=81` default and the
  Dockerfile / compose / Vite wiring so the origin port cannot silently drift.
- `app/tests/workspace-architecture.spec.ts` — pins the workspace-root
  `docs/ARCHITECTURE.md` "Key points" bind-address bullet to the real
  `app.listen(PORT, "0.0.0.0")` call (wildcard bind, never loopback-only).

## Status (final this turn)

- All milestones (M16–M18, stub + real) are complete and committed.
- `npm test` → **186 passed** (24 files); `npm run typecheck` → green (Node 22).
- The whole HTTPS-via-Cloudflare-Quick-Tunnel goal is delivered: port-81 origin
  + `cloudflared tunnel --url http://127.0.0.1:81` → `https://*.trycloudflare.com`,
  with no custom domain, no Let's Encrypt, and no inbound 443.

## Critic feedback (this turn) — all accepted

1. **"No deliverable at all."** Accepted — this turn writes `docs/PLAN.md` and
   `docs/ARCHITECTURE.md` (this document) with the Cloudflare Quick Tunnel goal.
2. **"Docs still mandate Let's Encrypt + domain reverse proxy, none describe a
   Quick Tunnel."** Accepted — `app/docs/RUNBOOK.md` and
   `app/docs/ARCHITECTURE.md` now describe `cloudflared tunnel --url
   http://127.0.0.1:81` and drop the Let's Encrypt / reverse-proxy mandate.
3. **"Nothing binds port 81 or runs the tunnel."** Accepted — port 81 is now
   the default everywhere and the Quick Tunnel command is in the runbook.
4. **"The architecture documents the origin bind as loopback-only, but the
   code listens on all interfaces."** Accepted — the bind-address bullet is
   corrected to `0.0.0.0:81` (the wildcard bind keeps both the tunnel's
   loopback dial and the EC2 TCP exposure working), `docs/CONTEXT.md` records
   the "never loopback-only" constraint, and a new
   `tests/workspace-architecture.spec.ts` pins it mechanically.

None of the points push the project out of scope — they are exactly the goal —
so nothing is rejected.

## Sources

- Cloudflare One docs — "Quick Tunnels":
  https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- Cloudflare Quick Tunnels landing ("No account, DNS, or open ports required"):
  https://try.cloudflare.com/
