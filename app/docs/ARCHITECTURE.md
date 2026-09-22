# Architecture

## Overview

`i3` starts as a self-contained Unix-runnable seed (Express + Vite/React +
PostgreSQL 16 under Docker Compose). The **new direction** turns it into a
**real, phone-friendly incident-reporting PWA**: open the URL on a phone →
capture a **real photo** and **real GPS** → review a two-column location +
map/pin screen → write (or generate) a description → review three readable
tiles → submit. Every report is stored in **PostgreSQL**, including the photo.

```
Phone browser ──HTTPS──> Cloudflare Quick Tunnel (https://*.trycloudflare.com) ──HTTP──> app (Express, :81)
                                                                       ├─ POST /api/report                → busboy parse → validate → geocode
                                                                       │                                    → INSERT image+thumbnail+metadata into Postgres
                                                                       ├─ GET  /api/reports               → SELECT metadata (no image bytes)
                                                                       ├─ GET  /api/reports/:id/image     → SELECT image  BYTEA → image/jpeg
                                                                       ├─ GET  /api/reports/:id/thumbnail → SELECT thumbnail BYTEA → image/jpeg
                                                                       ├─ GET  /health                    → SELECT 1
                                                                       └─ /*                              → static files from dist/

                                                                       app ──TCP 5432──> db (postgres:16-alpine)  volume: pgdata
```

Key decisions vs. the previous seed:

| Concern | Previous seed | New direction |
|---|---|---|
| Camera | mock canvas only | **real `getUserMedia`** (front camera), with mock fallback |
| GPS | fixed mock | **real `navigator.geolocation`**, with manual-entry fallback |
| Photos | files on `uploads` volume + path in DB | **`BYTEA` in Postgres** (compressed full + thumbnail), served via API |
| Flow | single capture screen | 6-step wizard + separate reports page (hash-routed) |
| Audio | synthetic WAV | **removed** (not in the requested steps; re-addable module) |
| Map | none | self-contained `MapPin` tile grid derived from lat/lon |

## Implementation status (living)

- **M8 (Home & navigation shell) — done (stub + real).** Hash mini-router
  (`#/`, `#/new`, `#/reports`); Home with real Polish copy, the numbered
  4-step list and "Report issue" / "Zgłoszenia" links; a wizard with a 4-step
  indicator (`aria-current` tracking) and back/next navigation; and a Reports
  page with loading / error / empty / ready states. Covered by
  `src/app.spec.tsx`, `src/pages/NewReport.spec.tsx`,
  `src/pages/Reports.spec.tsx`.
- **M9 (Camera step) — real done.** The wizard's camera step now mounts
  `src/capture/Camera.tsx`, the real `getUserMedia` camera: rear camera
  (`facingMode: "environment"`, no audio), a live `<video>` preview, and a
  shutter gated on the live state. On shutter it calls
  `src/capture/image.ts` → `compressToImages()`, which downscales the frame to a
  JPEG **full** (≤1280 px @ 0.85) + **thumbnail** (≤360 px @ 0.72); when the
  camera is unavailable or permission is denied it falls back to `MockCamera`,
  and tracks are stopped on unmount. Covered by `src/capture/Camera.spec.tsx`,
  `src/capture/image.real.spec.ts`, `src/capture/image.spec.ts` and
  `src/pages/NewReport.spec.tsx`.
- **M10 (Location step) — real done.** The wizard's location step now mounts
  the real `navigator.geolocation` wrapper (`src/capture/location.ts`): high
  accuracy + 10 s timeout + `maximumAge: 0`, a typed `GeolocationError` mapping
  (permission-denied / position-unavailable / timeout / unsupported / unknown),
  a retry button and a validated manual lat/lon fallback. On capture it renders
  the required two-column screen — left: coordinates + reverse-geocoded address
  + accuracy, right: `MapPin` (3×3 OSM tile grid + centered pin from
  `src/map/`). Reverse-geocoding is `src/capture/geo.ts` (deterministic mock
  default; `nominatim` opt-in). Covered by `src/capture/location.spec.ts`,
  `src/capture/geo.spec.ts`, `src/map/MapPin.spec.tsx`, `src/map/tiles.spec.ts`
  and `src/pages/NewReport.spec.tsx`.
- **M11 (Description step) — real done.** The wizard's description step now
  mounts `src/description.ts` → `generateDescription()`, a deterministic,
  A.I.-style generator: it always starts with the fixed default
  `"test default description A.I. generated based on the incident picture"` and
  appends short annotations for the captured photo / coordinates / time. The
  step renders an editable textarea plus a "Generate" button that fills it, and
  gates "Dalej" until the text is non-empty. No network or API key is involved
  (a real LLM remains a marked later swap). Covered by
  `src/description.spec.ts` and `src/pages/NewReport.spec.tsx`.
- **M12 (Review & submit) — real done.** The review step renders the three
  required side-by-side tiles — **photo thumbnail**, **map + pin thumbnail**,
  **summary** (description + coordinates + address) — and submits the report
  via `src/send.tsx` (`sendReport`): a multipart POST (`image`, `thumbnail`,
  `lat`, `lon`, `description`) to `/api/report`. On success it redirects to
  `#/reports`; a network failure / 4xx / 5xx shows a short, non-leaky error
  with a retry. Covered by `src/pages/NewReport.review.spec.tsx` and
  `tests/send.spec.ts`.
- **M13 (Reports list) — real done.** The reports page now renders the full
  list: every report with a photo thumbnail (`thumbnailUrl`, falling back to
  `imageUrl`), a map + pin tile (`MapPin` from lat/lon), and a summary
  (description + coordinates + address + timestamp), newest-first by
  `created_at`, plus loading / error / empty states — and it degrades
  gracefully against the older seed backend rows (no `description` /
  `thumbnailUrl` / `imageUrl` / `created_at`). Covered by
  `src/pages/Reports.spec.tsx`.
- **M14 (Backend & DB) — real done.** The backend is now BYTEA-backed and
  implements the M12/M13 contract. `db/init.sql` defines the new `reports`
  table (audio columns dropped; `description TEXT`, `image BYTEA` required,
  `thumbnail BYTEA` optional); `db.ts` provides insert/list/getImage/
  getThumbnail; `report.ts` parses multipart (`image` required, `thumbnail`
  optional, `lat`/`lon` validated finite + in-range, `description`) and
  reverse-geocodes via `geo.ts`; `index.ts` serves `GET
  /api/reports/:id/image` and `/api/reports/:id/thumbnail` as `image/jpeg`,
  keeps `GET /api/reports` metadata-only (returning `description`,
  `created_at`, `thumbnailUrl`, `imageUrl`), and preserves `/health`. The old
  `voice`/`audio_path` shape is gone. Covered by `tests/app.spec.ts` and
  `tests/report.spec.ts`.
- **M15 (Compose, tests & docs) — done.** The final compose/tests/docs pass
  shipped: `docker-compose.yml` drops the `uploads` volume and the `UPLOAD_DIR`
  env (BYTEA storage) and keeps `pgdata` + `APP_PORT`; the now-dead
  `server/store.ts` + `tests/store.spec.ts` are removed (upload-volume
  persistence is obsolete once `BYTEA` is the storage); the HTTPS
  reverse-proxy requirement for mobile camera/GPS is documented in the
  RUNBOOK; and `tests/runbook.spec.ts` / `tests/docs.spec.ts` are re-pinned to
  the new compose / runbook / schema / contract facts.
- **M16 (HTTPS via Cloudflare Quick Tunnel on port 81) — real done.** The
  app now binds port `81` everywhere (`server/index.ts` default, `Dockerfile`
  `EXPOSE`, compose `"${APP_PORT:-81}:81"` + healthcheck, `.env.example`,
  Vite dev proxy). HTTPS is provided by a Cloudflare Quick Tunnel
  (`cloudflared tunnel --url http://127.0.0.1:81` → `https://*.trycloudflare.com`)
  — no domain, no Let's Encrypt, no inbound 443 (see "Cloudflare Quick Tunnel").

## Source & git

- `i3_ref/` is a local clone of `https://github.com/FDHKRsss/i3.git` (the repo
  we are asked to work on). Milestone-acceptance commits target its own origin.
- `civil42pwa_ref/` is a **read-only reference** (the protoplast). It is never
  configured as a git remote and **never pushed to**.
- Neither `README.md` (workspace or `i3_ref/README.md`) is written by agents; the
  goal/human gate owns them.

## Tooling (chosen, and why)

| Concern | Choice | Why (vs. alternatives) |
|---|---|---|
| Runtime | Node.js **22 LTS** | already in use; LTS. |
| Frontend | **Vite 5 + React 18 + TS** (already present) | keep the working app; minimal change. |
| Backend | **Express** + **busboy** + **pg** | already present; busboy parses multipart, `pg` drives Postgres. |
| DB | **PostgreSQL 16** (alpine) | already present; `BYTEA` + `gen_random_uuid()`. |
| Image processing | **none on the server** (no `sharp`) | the browser downscales/compresses via `<canvas>`; keeps the image lean and avoids a native dep. |
| Routing | **hash mini-router** (~40 LOC, no dependency) | real URLs + back-button on mobile without adding `react-router`. |
| Map | **self-contained `MapPin`** using OSM raster tiles | no dependency (rejects `leaflet`); tile math is ~30 LOC and the pin is CSS/SVG. |
| AI description | **deterministic template module** | no API key/network; LLM API is a marked later swap. |
| Package manager | **npm** | already present. |

## What will be in the code

```
i3_ref/
├─ src/                        # frontend (Vite + React, TypeScript)
│  ├─ main.tsx                 # entry + error boundary
│  ├─ app.tsx                  # hash router → Home / New wizard / Reports
│  ├─ pages/
│  │  ├─ Home.tsx              # numbered steps + "Report issue" + "Zgłoszenia"
│  │  ├─ NewReport.tsx         # wizard state machine (camera→location→description→review)
│  │  └─ Reports.tsx           # lists all reports from Postgres
│  ├─ capture/
│  │  ├─ Camera.tsx            # real getUserMedia camera + shutter + fallback
│  │  ├─ MockCamera.tsx        # kept as the permission-denied/headless fallback
│  │  ├─ location.ts           # navigator.geolocation + manual fallback
│  │  ├─ geo.ts                # reverse-geocode (mock default; nominatim opt-in)
│  │  └─ image.ts              # canvas downscale/compress → full + thumbnail blobs
│  ├─ map/
│  │  ├─ MapPin.tsx            # OSM tile grid + centered pin (interactive + thumb sizes)
│  │  └─ tiles.ts              # slippy-map tile math (tileCoords / wrapTileX / clampTileY)
│  ├─ description.ts           # generateDescription() (deterministic A.I.-style text)
│  ├─ send.tsx                 # multipart POST (image, thumbnail, lat, lon, description)
│  └─ ...
├─ server/                     # backend (TypeScript, compiled to server-dist/)
│  ├─ index.ts                 # routes incl. /api/reports/:id/image|thumbnail
│  ├─ report.ts                # multipart parse + validation + orchestration
│  ├─ db.ts                    # insert/list/getImage/getThumbnail/ping
│  └─ geo.ts                   # backend reverse-geocode provider (mock only; real provider is a later swap)
├─ db/
│  └─ init.sql                 # reports table (description + image/thumbnail BYTEA)
├─ Dockerfile                  # multi-stage: build frontend+server → runtime
├─ docker-compose.yml          # app + db, pgdata volume, APP_PORT env
├─ .env.example                # APP_PORT, POSTGRES_*, GEO_PROVIDER, MAX_UPLOAD_BYTES
└─ docs/                       # PLAN + ARCHITECTURE + CONTEXT + RUNBOOK
```

## Mobile reporting flow (the 6 user steps)

1. **Home** (`#/`) — short app description, the steps as a numbered list
   (1 camera → 2 location/map → 3 description → 4 review → submit), and two
   buttons: **"Report issue"** (`#/new`) and **"Zgłoszenia"** (`#/reports`).
2. **Camera** — live preview from the rear camera; tap shutter → downscale +
   JPEG-compress → keep `full` (≤1280 px) and `thumbnail` (≤360 px) blobs in
   the wizard state.
3. **Location** — `navigator.geolocation` (high accuracy, ~10 s timeout);
   on success show a two-column screen: **left = coordinates + address +
   accuracy**, **right = map with pin**. On failure: retry + manual lat/lon.
4. **Description** — editable textarea + **"Generate"** button → fills the
   default AI-style description (see "Description generation").
5. **Review** — three side-by-side tiles: **photo thumbnail**, **map+pin
   thumbnail**, **summary** (description + coordinates + address). A submit
   button persists and redirects to `#/reports`.
6. **Reports** (`#/reports`) — every report from Postgres, newest first, each
   showing photo thumbnail, map thumbnail, description, coordinates, timestamp.

> Interpretation note: the user wrote *"miniaturki 3 obok siebie czytelne"*.
> The two images the flow produces are the **photo** and the **map/pin**, so the
> third tile is the **summary** (description + coordinates), which keeps all
> captured data readable in a 3-up layout. If a third *image* is later wanted,
> the review page is a single component and the tile set is trivial to change.

## Database schema (`db/init.sql`)

```sql
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat         DOUBLE PRECISION,
  lon         DOUBLE PRECISION,
  geo_desc    TEXT,
  description TEXT NOT NULL DEFAULT '',
  image       BYTEA NOT NULL,
  thumbnail   BYTEA
);

CREATE INDEX IF NOT EXISTS reports_created_at_idx
  ON reports (created_at DESC);
```

- **How photos are stored**: the browser uploads the compressed photo and a
  small thumbnail; both are stored as `BYTEA` in Postgres. `image` is required,
  `thumbnail` optional (derived server-side is not needed). List queries select
  **only** metadata + `thumbnail` (or only metadata) — never the full `image` —
  so the reports list stays cheap.
- **Why `BYTEA` and not files-on-volume + path**: single source of truth in the
  one DB (matches "zapisywal w postgresie"), no orphaned files, no separate
  image volume/static route to secure, `pg_dump` backs up everything, and
  PostgreSQL TOAST handles the (already compressed) sizes comfortably.
  Full-resolution originals (~several MB) are **not** stored; the client
  compresses to a bounded size first. A future swap to object storage (S3) is
  noted below.

## API contract

- `POST /api/report` — `multipart/form-data`.
  - `image` (file, **required**, JPEG) — the compressed photo (the client always
    uploads a canvas-compressed JPEG; see "Capture & permissions").
  - `thumbnail` (file, optional) — small JPEG.
  - `lat` / `lon` (strings, optional but validated as finite, in-range).
  - `description` (string, optional) — defaults to `""`.
  - `200` → `Report received successfully` (or the created id); `400` on
    malformed/missing image/invalid coords; `405` non-POST; `500` on server/DB
    failure (message logged, not leaked).
- `GET /api/reports?limit=50` — JSON list, newest first; each item returns
  `id`, `created_at`, `lat`, `lon`, `geo_desc`, `description`, and
  `thumbnailUrl` / `imageUrl` (no inline image bytes).
- `GET /api/reports/:id/image` → `image/jpeg` (or `404` if absent).
- `GET /api/reports/:id/thumbnail` → `image/jpeg` (or `404` if absent).
- `GET /health` → `{ ok: true, db: "up"|"down" }` after `SELECT 1`.

## Capture & permissions (replaces the old "Mocking strategy")

The previous mandate *"all device capture is mocked so no permission is
requested"* is **removed** — it directly contradicts the goal. The new rules:

| Capability | Primary (real) | Fallback (still runs headless/denied) |
|---|---|---|
| Camera | `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` | `MockCamera` canvas placeholder, with a clear "camera unavailable" note |
| GPS | `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })` | manual lat/lon entry + retry (no silent fake location) |
| Reverse geocode | `geo.ts` → `nominatim` (opt-in via `GEO_PROVIDER=nominatim`) | deterministic `mock` provider (default) |

- The fallbacks keep the module interfaces identical to the originals so each
  real implementation can be swapped in/out one file at a time.
- **Secure context**: `getUserMedia` and `geolocation` only work over **HTTPS**
  (or `localhost`). The app logs a clear in-page error otherwise. Deployment
  must be served over **HTTPS**. The simplest way for a quick test is a
  **Cloudflare Quick Tunnel** (`cloudflared tunnel --url http://127.0.0.1:81`),
  which publishes the local HTTP origin as an `https://*.trycloudflare.com` URL
  with no custom domain, no Let's Encrypt and no inbound port 443 (see
  "Port & resource handling").

## Map & pin

- `MapPin` renders a small, non-interactive-by-default map from a `{lat,lon}`:
  it computes the OSM slippy-map tile for a fixed zoom (~16), lays out an N×N
  grid of `https://tile.openstreetmap.org/{z}/{x}/{y}.png` `<img>`s around the
  center tile, and overlays a centered pin (SVG/CSS) using the fractional pixel
  offset of the coordinate inside the center tile. A tiny "© OpenStreetMap"
  attribution is included.
- This gives the *"zrzut ekranu z mapą i pinezką"* look without persisting any
  map image: it is always derived from the stored coordinates, so the same
  component powers the location step, the review tile, and each reports-list
  row. Tile requests are made by the phone browser directly to OSM.

## Description generation

- `generateDescription({ hasImage, lat, lon, at })` returns a deterministic,
  AI-style string (the requested default
  `"test default description A.I. generated based on the incident picture"`,
  optionally annotated with the captured time/coordinates). The "Generate"
  button fills the textarea; the user can edit before submitting.
- A real LLM call is deliberately out of scope (needs an API key + network);
  the module is the single swap point for a real provider later.

## Port & resource handling

- **Host port is configurable**: `APP_PORT` env (default `81`) maps to the
  container's fixed `81`. Never assume the host port is free. Port 81 is the
  requested Cloudflare Quick Tunnel origin.
- Postgres is **internal only** (no host port published) to avoid `5432`
  conflicts.
- `DATABASE_URL` is injected (default
  `postgres://civil42:civil42@db:5432/civil42`).
- Upload size is capped (`MAX_UPLOAD_BYTES`, default 15 MB) and `lat`/`lon` are
  validated finite + in-range. Images are expected to be small because the
  client pre-compresses them; a too-large image is a `400`.
- **HTTPS for phones**: the container serves plain HTTP on `APP_PORT` (default
  `81`). For HTTPS, run a **Cloudflare Quick Tunnel** on the host:
  `cloudflared tunnel --url http://127.0.0.1:81`. This gives a random
  `https://<id>.trycloudflare.com` URL — no custom domain, no Let's Encrypt and
  no inbound port 443 (cloudflared dials *out* to Cloudflare). `localhost` needs
  no TLS.

## Cloudflare Quick Tunnel (HTTPS without a domain)

The goal explicitly forbids a domain + Let's Encrypt reverse proxy and opening
port 443. Instead, HTTPS comes from a **Cloudflare Quick Tunnel**:

```sh
cloudflared tunnel --url http://127.0.0.1:81
```

- `cloudflared` (a single static binary) dials **out** to Cloudflare's edge, so
  no inbound port — not even 443 — needs to be opened in the EC2 security group.
- Cloudflare issues a random hostname (`https://<random>.trycloudflare.com`) and
  terminates TLS at its edge; the app stays a plain-HTTP origin on `127.0.0.1:81`.
- No Cloudflare account, no DNS record and no Let's Encrypt certificate are
  involved. The URL is ephemeral (a new one on every run) — fine for "najprostsze
  na test".
- The browser therefore sees HTTPS, which makes `getUserMedia` /
  `navigator.geolocation` (secure contexts) work on a phone.

For a permanent hostname later, switch to a named Cloudflare Tunnel (still no
Let's Encrypt and no inbound 443); that is a marked later step, out of scope now.

## Failure modes & error handling

- DB down at app start → app still boots; `/health` reports `db: "down"`;
  report POST returns `500` (details logged, not leaked).
- Missing/empty image, malformed multipart, bad coordinates → `400` with a
  short message.
- Camera denied / insecure context / no camera → in-page error + fallback to
  mock capture; the flow still completes.
- GPS denied / timeout → in-page error + retry + manual lat/lon entry.
- File insert or DB write fails → `500`; no partial record is left visible as
  success (the single-row insert is atomic).
- Port already bound inside the container → server fails fast with a clear
  message; host-side conflicts are handled by changing `APP_PORT`.

## Critic feedback (previous turn) — all accepted

1. **"No deliverable at all."** Accepted — this turn writes `docs/PLAN.md`
   (new M8–M15) and `docs/ARCHITECTURE.md` (this document).
2. **"New goal absent / architecture contradicts it (mocking mandate)."**
   Accepted — "Capture & permissions" above replaces the mock-only mandate with
   real capture + fallback.
3. **"Schema cannot store the AI description."** Accepted — `description` column
   added (and `image`/`thumbnail` `BYTEA`).
4. **"None of the required UI steps exist."** Accepted — the "Mobile flow"
   section + M8–M13 cover start page, camera, location, description, review,
   and reports list.
5. **"No map/pin capability and no way to serve uploaded images."** Accepted —
   `MapPin` component + `/api/reports/:id/image|thumbnail` endpoints added.

None of the points push the project out of scope; they are exactly the stated
goal, so nothing is rejected.

## Post-approval polish (minor/cosmetic — recorded, no scope change)

The critic approved the plan and flagged two cosmetic doc items; both are
recorded here (and in PLAN "Post-approval polish") so they are not lost:

1. **`RUNBOOK.md` still documents the mock-capture mandate** and cross-references
   the now-renamed "Mocking strategy" section. This is **deferred, not an
   oversight**: the runbook accurately describes the *current* still-mock code,
   and its full rewrite is already scheduled under **M15 -- real** (the dangling
   "Mocking strategy" → now "Capture & permissions" reference is fixed there).
2. **API contract listed `image` as `JPEG/PNG`** while the serving routes return
   `image/jpeg`. **Fixed now**: `image` is JPEG only — M9 -- real commits the
   client to always upload a canvas-compressed JPEG, so PNG is unreachable in
   the real flow. (Applied in "API contract" above.)

## Critic feedback (HTTPS-via-Cloudflare turn) — all accepted

1. **"No deliverable at all."** Accepted — this turn wrote the goal + plan +
   this design around the Cloudflare Quick Tunnel requirement.
2. **"Docs still mandate Let's Encrypt + domain reverse proxy."** Accepted —
   "Port & resource handling", "Capture & permissions" and the RUNBOOK now
   describe `cloudflared tunnel --url http://127.0.0.1:81` and drop the
   Let's Encrypt / reverse-proxy mandate.
3. **"Nothing binds port 81 or runs the tunnel."** Accepted — port 81 is now the
   default everywhere and the Quick Tunnel command is documented in the RUNBOOK.

None of these push the project out of scope — they are exactly the stated goal —
so nothing is rejected.

## Out of scope & future swaps (modular, minimal now)

- **PWA installability / offline** — not required by the steps; re-addable via
  `vite-plugin-pwa` later.
- **Real AI description** — `description.ts` swap point (needs keys/network).
- **Object storage (S3/MinIO)** — `db.ts`/`report.ts` swap point if bytea ever
  outgrows the use case.
- **Audio capture** — removed to match the requested photo+location+description
  flow; the capture-module boundary makes it easy to re-add.
- **Interactive/draggable map** — `MapPin` is intentionally static; a full
  `leaflet`/`maplibre` swap point is isolated in `src/map/`.

## Verification & runbook

- `docs/RUNBOOK.md` will be updated to cover the new flow end-to-end on a plain
  Unix box: build, health, `capture → location → description → review →
  submit → persist → list`, image/thumbnail serving, bytea persistence across
  `down`/`up`, and the HTTPS requirement for real camera/GPS on a phone.
- `npm test` + `npm run typecheck` remain the dev-workspace gate (Docker is not
  available here); `tests/runbook.spec.ts` keeps the runbook pinned to source.
  New tests: description generator, map tile math, geo provider, db row mapping,
  report validation (missing image / bad coords / size), endpoint responses,
  and frontend render tests for Home / wizard / reports.
