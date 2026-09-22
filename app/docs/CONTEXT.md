# Project context (durable directives all agents must always honor)

- Transform the working `i3` project into a **real mobile incident-reporting
  PWA**: a phone user can take a **real photo** and have their **real GPS**
  captured, then add a description and submit — like the protoplast, not a
  mocked seed.
- Implement the exact step flow: **Home** (numbered steps + "Report issue" +
  "Zgłoszenia") → **Camera** → **Location** (two columns: coordinates | map+pin)
  → **Description** ("Generate" default) → **Review** (3 side-by-side tiles) →
  **Reports** (all rows from Postgres).
- **Photos are stored in PostgreSQL** as compressed `BYTEA` (full + thumbnail),
  served via `/api/reports/:id/image` and `/api/reports/:id/thumbnail`.
- Real device capture is the goal, but every capture module keeps a
  permission-denied/headless fallback so the app and tests still run without a
  camera/GPS.
- Camera + geolocation require **HTTPS** (or `localhost`). Serve the app over
  **HTTPS with a Cloudflare Quick Tunnel** — `cloudflared tunnel --url
  http://127.0.0.1:81` → `https://*.trycloudflare.com` — with **no custom
  domain, no Let's Encrypt and no inbound port 443**. Keep the app on port
  `81` (env-configurable: `APP_PORT` for the host mapping, `PORT` for the
  container) and document this in the runbook.
- **Never push to `civil42pwa-public` and never add it as a git remote** — it is
  a read-only reference at `civil42pwa_ref/`.
- Keep the existing stack: Node 22 LTS, Vite + React (TS), Express, `pg`,
  PostgreSQL 16, Docker + Compose + named volumes.
- Do **not** write `README.md` (owned by the goal / human gate). Plan →
  `docs/PLAN.md`, design → `docs/ARCHITECTURE.md`, compose runbook →
  `docs/RUNBOOK.md`.
- Dev-workspace environment: Docker is NOT available here (validate with
  `npm test` + `npm run typecheck`; `docker compose up` is verified on the
  target box per `docs/RUNBOOK.md`). Node 22 is not on the default `PATH` —
  prepend `/home/op/.local/node-v22.23.2-linux-x64/bin` before npm commands.
