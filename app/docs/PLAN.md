# Plan

## Goal(s)

1. **Continue the already-working `i3` project** (fetched from
   `https://github.com/FDHKRsss/i3.git`) and turn it into a **real,
   phone-friendly incident-reporting PWA**: when it is exposed at some address,
   a person opening it on a phone can take a **real photo** and have their
   **real GPS** captured — like the protoplast (`civil42pwa-public`), not as a
   mocked desktop-only seed.
2. **Persist everything in PostgreSQL.** Photos must be stored in Postgres
   (decide *how* — see ARCHITECTURE "Database schema": compressed `bytea` +
   thumbnail).
3. Implement the exact **step flow** the user described:
   1. Start page: short description of the app and the numbered steps, plus a
      **"Report issue"** (start) button and a **"Zgłoszenia"** button.
   2. Camera page: take a photo and save it (into Postgres).
   3. Location page: capture GPS; show **coordinates on one side and the image
      on the other** (two-column layout), plus a **map with a pin**.
   4. Description page: a text field and a **"Generate"** button that fills in
      an AI-style default description.
   5. Review page: three **thumbnails side by side, readable**.
   6. Reports page: a separate page listing **all reports from Postgres**.
4. Keep the **two-pass** rule: Pass 1 builds the whole flow with stubs/mocks so
   it runs end-to-end; Pass 2 replaces each stub with the real implementation.

5. **Serve the app over HTTPS via a Cloudflare Quick Tunnel** (the current,
   authoritative goal): no custom domain, no Let's Encrypt, no inbound port 443.
   The app binds port `81` and is published with
   `cloudflared tunnel --url http://127.0.0.1:81` →
   `https://*.trycloudflare.com`.

Everything below is a means to these goals. The plan is a living document:
items are re-checked against the goals at each review and adjusted
incrementally. The previous "mock capture seed" milestones (M1–M7) are complete
and kept below as history; the **new** work was M8–M15, and the **current**
   work is M16–M18 (HTTPS via Cloudflare Quick Tunnel on port 81).

## Human notes & how they are handled

- *"konthynuuj to co zostalo juz zaczete, bo obecna wersja jest wersja dzialajaca"* —
  we keep the working Express + Postgres + Vite/React foundation and evolve it;
  M8–M15 replace the mocked capture flow with the real mobile flow.
- *"zrob ja bardziej jak z repo protoplasty … zeby z komorki mogl zrobic zdjecie,
  zeby pobralo jego gps"* — M9 replaces the mock camera with real `getUserMedia`;
  M10 replaces the mock GPS with real `navigator.geolocation`. Both keep a
  permission-denied fallback so the app still runs where capture is impossible.
- *"zrzut ekranu … z mapa i np pinezka … zeby to wizualnie mialo sens"* — M10 adds a
  self-contained `MapPin` component (OSM tile grid + centered pin) rendered from
  the captured coordinates; it is derived from lat/lon, so no map image needs to
  be persisted. (Interpretation recorded in ARCHITECTURE "Map & pin".)
- *"teraz to trzymamy w postgresie, nie wiem jak tam sie przechowuje zdjecia,
  wymysl cos"* — M14 stores the compressed photo **and** a small thumbnail as
  `BYTEA` columns in Postgres and serves them via `/api/reports/:id/image` and
  `/api/reports/:id/thumbnail` (ARCHITECTURE "Database schema").
- *"przycisk 'generate' ktory bedzie generowal opis"* — M11 implements a
  `generateDescription()` module producing the default A.I.-style text; no
  external LLM/API key is required (real LLM is a marked later swap).
- *"miniaturki 3 obok siebie czytelne"* — M12 renders the review page as three
  side-by-side tiles: **photo**, **map+pin**, **summary** (description +
  coordinates). (Interpretation recorded in ARCHITECTURE "Mobile flow".)
- *"dodatkowy przycisk 'zgloszenia' … listuje wszystkie zgloszenia w postgresie"* —
  M8 adds the button, M13 renders the list from `GET /api/reports`.
- *"nie pushuj nic do tego repo"* (about `civil42pwa-public`) — that repo remains a
  read-only reference at `civil42pwa_ref/`; it is never configured as a git
  remote and never pushed to. See ARCHITECTURE "Source & git".

## Constraints (non-negotiable)

- Do **not** push to `civil42pwa-public`. Do not add it as a git remote.
- Do **not** write `README.md` (owned by the goal / human gate) — neither the
  workspace one nor `i3_ref/README.md`.
- Host port must be configurable via env with a default; never assume a fixed
  host port is free.
- Real capture is the goal, but the app must still boot and be testable where
  camera/GPS are unavailable (permission denied, headless test): every capture
  module has a deterministic fallback.
- Camera + geolocation require a **secure context** (HTTPS, or `localhost`);
  the docs must state this clearly.
- Photos are stored in Postgres (no orphaned files, no separate image volume).

## Completed milestones (previous seed — history, kept as `[x]`)

Pass 1 = every milestone as a stub/mock so the whole app runs end-to-end.
Pass 2 = replace each stub with the real implementation.

- [x] M1 -- stub   Bootstrap: directory skeleton (src/ server/ db/) + no-op server + placeholder Dockerfile/compose so the repo boots.
- [x] M1 -- real   Source copied in; Firebase, Snowflake, `.github` CI, surge/PWA asset gen removed; single root `package.json`.

- [x] M2 -- stub   DB layer mocked: in-memory store returning canned rows.
- [x] M2 -- real   PostgreSQL 16 via compose, `db/init.sql` (`reports` table), `pg` pool + insert/list.

- [x] M3 -- stub   Backend API stubbed: `/health`, `POST /api/report`, `GET /api/reports` with canned responses.
- [x] M3 -- real   Backend real: multipart parse (busboy), validation, mock geo, uploads volume, persist + list via `pg`, serve `dist/`.

- [x] M4 -- stub   Frontend stub: App renders and submits a hard-coded Blob.
- [x] M4 -- real   Frontend real: mock camera, mock audio, mock GPS, submit multipart, result label.

- [x] M5 -- stub   Compose stub: minimal compose + Dockerfile placeholder.
- [x] M5 -- real   Compose real: multi-stage build, `app` + `db`, `pgdata`/`uploads` volumes, `APP_PORT`, healthchecks.

- [x] M6 -- stub   Tests stub: vitest/supertest smoke + RUNBOOK placeholder.
- [x] M6 -- real   Tests real: backend validation + geo-mock unit tests, frontend smoke, runbook pins.

- [x] M7 -- real   Fresh-clone robustness: `pretest` builds `dist/`; `typecheck` covers `tests/**`; SPA fallback + non-numeric `limit` + lat-only geocode specs.

## Current milestones (new mobile-reporting flow)

- [x] M8 -- stub   **Home & navigation shell.** Hash mini-router (`#/`, `#/new`, `#/reports`); Home renders the numbered step list and the two buttons ("Report issue" → `#/new`, "Zgłoszenia" → `#/reports`); wizard and reports are placeholders.
- [x] M8 -- real   Real copy (PL), wired navigation, step indicator in the wizard, reports page shell with empty/error states. No placeholder text left.

- [x] M9 -- stub   **Camera step.** Reuse the canvas mock to push a placeholder photo + thumbnail Blob into the wizard state; "Retake"/"Continue" buttons.
- [x] M9 -- real   **Camera step.** Real `getUserMedia({video:{facingMode:'environment'}})` live preview + shutter; canvas downscale → compressed JPEG (≤1280 px) + thumbnail (≤360 px); permission/error fallback to the mock; stop tracks on unmount.

- [x] M10 -- stub  **Location step.** Mock GPS + grey placeholder map with a pin; two-column layout (coordinates | map). *(Subsumed by M10 -- real, delivered together this turn: the real module already keeps the headless-safe path — manual lat/lon entry + deterministic mock reverse-geocode — so no separate stub step was needed.)*
- [x] M10 -- real  **Location step.** `navigator.geolocation.getCurrentPosition` (high accuracy, timeout), error + retry + manual lat/lon fallback; `MapPin` (OSM tile grid + centered pin); two columns (left: coordinates + address + accuracy, right: map); reverse-geocode via `geo.ts` (mock default, `nominatim` opt-in). *(Done this turn — `npm test` 120 passed + `npm run typecheck` green.)*

- [x] M11 -- stub  **Description step.** Textarea + "Generate" button that sets the fixed default `"test default description A.I. generated based on the incident picture"`. *(Subsumed by M11 -- real, delivered together this turn: the real module already renders the textarea + "Generate" default and is headless-safe, so no separate stub pass was needed.)*
- [x] M11 -- real  **Description step.** `generateDescription()` builds a deterministic A.I.-style description from the picture/location metadata; editable textarea; non-empty validation before continuing. *(Done this turn — `npm test` 139 passed + `npm run typecheck` green.)*

- [x] M12 -- stub  **Review & submit.** Three placeholder tiles (photo, map, summary) from wizard state; "Submit" posts to `/api/report` and shows a canned success. *(Subsumed by M12 -- real, delivered directly this turn: the real review step already renders the three tiles and is headless-safe, so no separate stub pass was needed.)*
- [x] M12 -- real  **Review & submit.** Real photo thumbnail, real map thumbnail, summary tile (description + coordinates); multipart POST (`image`, `thumbnail`, `lat`, `lon`, `description`); 4xx/5xx handling; success → `#/reports`. *(Done this turn — `npm test` 152 passed + `npm run typecheck` green.)*

- [x] M13 -- stub  **Reports list.** `/api/reports` returns canned rows; list renders placeholders. *(Subsumed by M8 -- real's shell + M13 -- real, delivered together this turn: the shell already fetched `/api/reports` and rendered loading/error/empty/ready states, so no separate stub pass was needed.)*
- [x] M13 -- real  **Reports list.** Fetch `/api/reports`; render each report with photo thumbnail, map thumbnail, description, coordinates, timestamp; newest first; empty/error states. *(Done this turn — `npm test` 160 passed + `npm run typecheck` green.)*

- [x] M14 -- stub  **Backend & DB.** Endpoints `/api/reports`, `/api/reports/:id/image`, `/api/reports/:id/thumbnail` with canned data; in-memory store with the new shape. *(Subsumed by M14 -- real, delivered together this turn: the real `db.ts`/`report.ts`/`index.ts` already implement the BYTEA contract end-to-end and are covered by tests, so no separate stub pass was needed.)*
- [x] M14 -- real  **Backend & DB.** `db/init.sql` new `reports` table (drop audio, add `description`, `image BYTEA`, `thumbnail BYTEA`); `db.ts` insert/list/get image/get thumbnail; `report.ts` multipart parse (`image` required, `thumbnail` optional, `lat`, `lon`, `description`) + validation; image-serving routes; health. *(Done this turn — `npm test` 177 passed + `npm run typecheck` green.)*

- [x] M15 -- stub  **Compose, tests & docs.** Compose still boots `app`+`db`; smoke tests pass with stubs; RUNBOOK placeholder.
- [x] M15 -- real  **Compose, tests & docs.** Compose drops the `uploads` volume and the `UPLOAD_DIR` env (bytea storage), removes the now-dead `server/store.ts` + `tests/store.spec.ts`, keeps `pgdata` + `APP_PORT` env; documents the HTTPS reverse-proxy requirement for mobile camera/GPS; unit + frontend tests for description generator, map tile math, geo, db row mapping, report validation, endpoints, Home/wizard/reports; RUNBOOK rewritten to the real photo/GPS/description flow; `tests/runbook.spec.ts` re-pinned to the new compose/runbook/schema/contract facts (no `uploads`/`UPLOAD_DIR`/`audio_path`/`image_path`) and `tests/docs.spec.ts` updated to the M15 state; `npm test` + `npm run typecheck` green.

- [x] M16 -- stub  **HTTPS via Cloudflare Quick Tunnel (port 81).** Keep the
  old `8080` default and only document the intended `81` + `cloudflared tunnel
  --url http://127.0.0.1:81` target. *(Subsumed by M16 -- real, delivered
  together this turn.)*
- [x] M16 -- real  **HTTPS via Cloudflare Quick Tunnel (port 81).** Bind port
  `81` everywhere: `server/index.ts` default, `Dockerfile` `EXPOSE`,
  `docker-compose.yml` `"${APP_PORT:-81}:81"` + healthcheck, `.env.example`,
  Vite dev proxy.
- [x] M17 -- stub  **Quick Tunnel docs.** Note the tunnel command. *(Subsumed by
  M17 -- real, delivered together this turn.)*
- [x] M17 -- real  **Quick Tunnel docs.** `docs/RUNBOOK.md` adds an
  "HTTPS via Cloudflare Quick Tunnel" section and replaces the Let's Encrypt /
  reverse-proxy mandate with the tunnel command; `docs/ARCHITECTURE.md`
  documents the Quick Tunnel model (no domain, no Let's Encrypt, no inbound 443).
- [x] M18 -- stub  **Test re-pin.** Tests still assert `8080`. *(Done with
  M18 -- real this turn.)*
- [x] M18 -- real  **Test re-pin.** `tests/runbook.spec.ts` and
  `tests/docs.spec.ts` re-pinned to port `81`, the Quick Tunnel wording and
  the M16–M18 state; `npm test` + `npm run typecheck` green.

## Current status

- The previous seed (M1–M7) is complete and green; it is the baseline we evolve.
- **M8 (stub + real) — done.** Home renders real Polish copy + the numbered
  4-step list + "Report issue" / "Zgłoszenia" links; the wizard renders a
  4-step indicator with `aria-current` tracking and working back/next
  navigation; the Reports page renders loading / error / empty / ready states
  from `GET /api/reports`.
- **M9 -- real — done (previous turn).** The camera step now uses the real
  `getUserMedia({ video: { facingMode: "environment" }, audio: false })` camera
  with a live `<video>` preview and a shutter gated on the live state.
  `compressToImages()` downscales the captured frame to a JPEG **full**
  (≤1280 px @ 0.85) + **thumbnail** (≤360 px @ 0.72) pair; camera
  unavailability / permission denial falls back to `MockCamera`, and tracks are
  stopped on unmount. `npm test` (85 passed at that milestone) + `npm run typecheck` were green.
- **M10 (stub + real) — done (this turn).** The location step now uses the real
  `navigator.geolocation.getCurrentPosition` (high accuracy, 10 s timeout,
  `maximumAge: 0`) with a typed `GeolocationError` mapping, a retry button and
  a validated manual lat/lon fallback. On capture it renders the required
  two-column screen — left: coordinates + reverse-geocoded address + accuracy,
  right: `MapPin` (3×3 OSM tile grid + centered pin). Reverse-geocoding goes
  through `src/capture/geo.ts` (deterministic mock default; `nominatim`
  opt-in). `npm test` (120 passed) + `npm run typecheck` are green. The stub
  line is subsumed by this real implementation (see milestone list).
- **M11 (stub + real) — done (this turn).** The description step now renders
  an editable textarea plus a "Generate" button that fills it via
  `generateDescription()` — a deterministic, A.I.-style default (always the
  fixed `"test default description A.I. generated based on the incident
  picture"` plus short annotations for the captured photo / coordinates /
  time) — and gates "Dalej" until the text is non-empty. No network or API
  key is involved. `npm test` (139 passed) + `npm run typecheck` are green.
  The stub line is subsumed by this real implementation (see milestone list).
- **M12 (stub + real) — done (this turn).** The review step now renders the
  three required side-by-side tiles — **photo thumbnail**, **map + pin
  thumbnail**, **summary** (description + coordinates + address) — and a
  "Wyślij" submit that POSTs the multipart payload (`image`, `thumbnail`,
  `lat`, `lon`, `description`) to `/api/report` via `src/send.tsx`
  (`sendReport`). On success it redirects to `#/reports`; on a network failure
  / 4xx / 5xx it shows a short, non-leaky error with a retry. The stub line is
  subsumed by this real implementation (see milestone list). `npm test`
  (152 passed) + `npm run typecheck` are green.
- **M13 (stub + real) — done (this turn).** The reports page now renders the
  full list — every report with its photo thumbnail (`thumbnailUrl`, falling
  back to `imageUrl`), map + pin (`MapPin` from lat/lon), summary (description
  + coordinates + address + timestamp), newest-first by `created_at`, plus
  loading / error / empty states — while degrading gracefully against the
  older seed backend rows (no `description` / `thumbnailUrl` / `imageUrl` /
  `created_at`). `npm test` (160 passed) + `npm run typecheck` are green. The
  stub line is subsumed by M8 -- real's shell + this real list (see milestone
  list).
- **M14 (stub + real) — done (this turn).** The backend is now BYTEA-backed
  and implements the M12/M13 contract. `db/init.sql` defines the new `reports`
  table (audio columns dropped; `description TEXT`, `image BYTEA` required,
  `thumbnail BYTEA` optional); `db.ts` provides insert/list/getImage/
  getThumbnail; `report.ts` parses multipart (`image` required, `thumbnail`
  optional, `lat`/`lon` validated finite + in-range, `description`) and
  reverse-geocodes via `geo.ts`; `index.ts` serves `GET
  /api/reports/:id/image` and `/api/reports/:id/thumbnail` as `image/jpeg`,
  keeps `GET /api/reports` metadata-only (returning `description`,
  `created_at`, `thumbnailUrl`, `imageUrl`), and preserves `/health`. The old
  `voice`/`audio_path` contract is gone. `npm test` (177 passed) + `npm run
  typecheck` are green. The stub line is subsumed by this real implementation
  (see milestone list).
- **M12/M13 → M14 contract dependency — resolved.** M12 (submit) and M13
  (reports list) were delivered frontend-first against the M14 backend contract
  (`POST /api/report` accepts `image`/`thumbnail`/`lat`/`lon`/`description`;
  `GET /api/reports` returns `description`, `created_at`, `thumbnailUrl`), and
  that contract is now implemented server-side by M14 -- real.
- **M15 (stub + real) — done.** The final compose/tests/docs pass shipped:
  `docker-compose.yml` drops the `uploads` volume and the `UPLOAD_DIR` env
  (BYTEA storage) and keeps `pgdata` + `APP_PORT`; the now-dead
  `server/store.ts` and `tests/store.spec.ts` are removed; the HTTPS
  reverse-proxy requirement for mobile camera/GPS is documented; the RUNBOOK
  is rewritten to the real photo/GPS/description flow and
  `tests/runbook.spec.ts` is re-pinned; and `tests/docs.spec.ts` is updated
  to the M15 state. `npm test` + `npm run typecheck` are green.
- **M16–M18 (HTTPS via Cloudflare Quick Tunnel) — done (this turn).** The
  app now binds port `81` everywhere (server, Dockerfile, compose, env example,
  Vite dev proxy), the runbook/architecture describe the Quick Tunnel path
  (`cloudflared tunnel --url http://127.0.0.1:81` → `https://*.trycloudflare.com`)
  with no domain / Let's Encrypt / inbound 443, and the tests are re-pinned.
  `npm test` + `npm run typecheck` are green. Live HTTPS verification runs
  on the target EC2 box per `docs/RUNBOOK.md`.
- Review signal: `ALL_MILESTONES_DONE`.

## Post-approval polish (minor — recorded, no scope change)

The critic approved the plan and flagged two cosmetic doc items; both are
recorded here (and in ARCHITECTURE "Post-approval polish") so they are not lost:

- **`RUNBOOK.md` still states the mock-capture mandate** and cross-references the
  renamed ARCHITECTURE section. This is **deferred** (not an oversight): the
  runbook accurately describes the *current* still-mock code, and its rewrite is
  already scheduled under **M15 -- real** (the dangling "Mocking strategy" → now
  "Capture & permissions" reference is fixed there).
- **ARCHITECTURE API contract listed `image` as `JPEG/PNG`** while serving routes
  always return `image/jpeg`. **Fixed now**: `image` is JPEG only — M9 -- real
  commits the client to always upload a canvas-compressed JPEG, so PNG is
  unreachable in the real flow.
