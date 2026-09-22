# Project context (durable directives all agents must always honor)

- Repo `i3` (Express + Vite/React + PostgreSQL 16 incident-reporting app) is cloned at `app/`; work there.
- Goal: serve it over **HTTPS via a Cloudflare Quick Tunnel** — no custom domain, no Let's Encrypt, no inbound 443.
- Origin runs plain HTTP on **port 81** (configurable via `APP_PORT` host / `PORT` container), bound to **`0.0.0.0:81`** (all interfaces — never loopback-only); tunnel: `cloudflared tunnel --url http://127.0.0.1:81` → `https://<random>.trycloudflare.com`.
- TLS terminates at Cloudflare's edge; the app itself stays an HTTP origin — that is the Quick Tunnel model.
- Never write `README.md` (owned by the human gate). Validate with `npm test` + `npm run typecheck` (no Docker here; the runbook runs on the target EC2 box).
