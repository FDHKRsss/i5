# Runbook — verify `docker compose up` end-to-end + HTTPS via Cloudflare Quick Tunnel

> Purpose: confirm on a plain Unix box that the whole stack (Vite/React frontend,
> Express API, local PostgreSQL 16, and the single `pgdata` volume) builds,
> starts, serves, persists a photo report, serves the stored image/thumbnail,
> survives a teardown/re-up cycle — and is reachable over **HTTPS** through a
> Cloudflare Quick Tunnel with no domain, no Let's Encrypt, and no inbound 443.

The frontend uses the **real camera** and **real GPS** on a phone (with a
permission-denied/headless fallback so it still runs where capture is
impossible). The backend stores the compressed photo **and** a small thumbnail
as `BYTEA` in Postgres — there is no uploads volume and no files-on-disk image
store.

> **HTTPS via Cloudflare Quick Tunnel.** `getUserMedia` and
> `navigator.geolocation` only work in a **secure context** — over **HTTPS** or
> on **localhost**. The simplest way to get HTTPS for a quick test is a
> Cloudflare **Quick Tunnel**:
>
> ```sh
> cloudflared tunnel --url http://127.0.0.1:81
> ```
>
> This prints a random `https://<random>.trycloudflare.com` URL. **No Cloudflare
> account, no custom domain, no Let's Encrypt, and no inbound port 443** are
> required — `cloudflared` dials *out* to Cloudflare and the TLS terminates at
> Cloudflare's edge. The app itself keeps serving plain HTTP on `127.0.0.1:81`.

---

## 0. Prerequisites

- Docker Engine (with the Compose v2 plugin: `docker compose version`).
- A Unix shell (`bash`/`sh`).
- Nothing listening on the host port you choose (default `81`).
- `cloudflared` installed (see step 10) for the HTTPS Quick Tunnel — or use
  `http://localhost:81/` during local development.

> Workspace note: if Docker is not available where you develop (e.g. this
> agent workspace), validate the backend/API behavior with the Node test suite
> instead — `npm test` and `npm run typecheck` — and run this runbook on the
> target box (EC2/any Unix host).

## 1. Configure

```sh
cp .env.example .env
```

The defaults work out of the box. The knobs you are most likely to touch:

| Variable           | Default    | Meaning                                                   |
| ------------------ | ---------- | --------------------------------------------------------- |
| `APP_PORT`         | `81`       | Host port the app is published on (change it if `81` is taken). This is the Quick Tunnel origin port. |
| `POSTGRES_USER`    | `civil42`  | Postgres user (also used by the app).                     |
| `POSTGRES_PASSWORD`| `civil42`  | Postgres password.                                        |
| `POSTGRES_DB`      | `civil42`  | Database name.                                            |
| `GEO_PROVIDER`     | `mock`     | Backend reverse-geocode provider; only `mock` is implemented. |
| `MAX_UPLOAD_BYTES` | `15728640` | Multipart upload size cap (15 MB).                        |

Postgres is **internal only** (no host port is published), so it never clashes
with a local `5432`.

## 2. Build and start

```sh
docker compose up --build -d
```

This builds the multi-stage image (frontend bundle + compiled server) and starts
`db` first, then `app` (the app waits for the DB healthcheck via `depends_on`).

## 3. Wait until both services are healthy

```sh
docker compose ps
```

Expected: two services, `db` and `app`, both showing `healthy`. If `app` is
still `starting`, wait a few seconds and re-run — the first boot runs
`db/init.sql`, and the app healthcheck only flips green once `/health` returns
`db: "up"`.

## 4. Health check

```sh
curl -s http://localhost:81/health
# {"ok":true,"db":"up"}
```

- `db: "up"` means the app reached Postgres with `SELECT 1`.
- `db: "down"` means the app booted but the database is not reachable yet —
  wait for the DB healthcheck, or inspect `docker compose logs db`.

(If you changed `APP_PORT`, use that port in every URL below.)

## 5. Frontend is served

```sh
curl -s http://localhost:81/ | grep -o '<title>[^<]*</title>'
# <title>Civil42</title>
```

Open the URL in a browser (via the Quick Tunnel HTTPS URL from step 10, or
`http://localhost:81/`): **Home → "Report issue" → Camera → Location →
Description → Review → submit → Reports**. On a phone over HTTPS this uses the
real camera and real GPS; in a headless/denied context it falls back so the flow
still completes.

## 6. End-to-end: submit → reverse-geocode → persist → list

The frontend uploads the canvas-compressed photo (`image`, required JPEG) and an
optional `thumbnail`. To exercise the API without a phone, create two tiny
stand-in JPEG files:

```sh
printf '\xff\xd8\xff\xd9' > /tmp/photo.jpg
printf '\xff\xd8\x01\x02' > /tmp/thumb.jpg
```

Submit a report (multipart; `image` required, `thumbnail` optional):

```sh
curl -s -X POST "http://localhost:81/api/report" \
  -F "image=@/tmp/photo.jpg;type=image/jpeg" \
  -F "thumbnail=@/tmp/thumb.jpg;type=image/jpeg" \
  -F "lat=52.2297" \
  -F "lon=21.0122" \
  -F "description=Zepsuta latarnia"
# Report received successfully
```

List the persisted reports:

```sh
curl -s "http://localhost:81/api/reports?limit=5"
```

Expected: a JSON array whose newest entry contains

- `id` — a UUID string,
- `created_at` — an ISO timestamp,
- `lat` / `lon` — `52.2297` / `21.0122`,
- `geo_desc` — `mock location (52.22970, 21.01220)`,
- `description` — `Zepsuta latarnia`,
- `thumbnailUrl` — `/api/reports/<id>/thumbnail`,
- `imageUrl` — `/api/reports/<id>/image`.

The `image`/`thumbnail` BYTEA bytes are **not** inlined into this payload — the
client fetches them through the URLs above.

## 7. Verify persistence in Postgres

```sh
docker compose exec db psql -U civil42 -d civil42 \
  -c "SELECT id, lat, lon, geo_desc, description, octet_length(image) AS image_bytes, octet_length(thumbnail) AS thumb_bytes FROM reports ORDER BY created_at DESC LIMIT 5;"
```

You should see the row you just submitted, with non-zero `image_bytes` (and
`thumb_bytes` when a thumbnail was uploaded). The schema (`reports` table and
the `reports_created_at_idx` index) is created by `db/init.sql` on first boot.

## 8. Verify the stored image and thumbnail are served

Copy the newest `id` from step 6, then:

```sh
curl -s -o /dev/null -w "image:     %{http_code} %{content_type}\n" \
  "http://localhost:81/api/reports/<id>/image"
curl -s -o /dev/null -w "thumbnail: %{http_code} %{content_type}\n" \
  "http://localhost:81/api/reports/<id>/thumbnail"
```

Expected: `200 image/jpeg` for both (and `404` if the id is unknown or the
thumbnail was not uploaded).

## 9. Tear-down and restart (data survives)

```sh
docker compose down      # stops containers; keeps the pgdata volume
docker compose up -d     # starts again — the report is still there
curl -s "http://localhost:81/api/reports?limit=5"   # still lists the report
```

For a **clean reset** (drop the database, including stored photos):

```sh
docker compose down -v   # also deletes the pgdata volume (fresh start)
docker compose up --build -d
```

## 10. HTTPS via Cloudflare Quick Tunnel (no domain, no Let's Encrypt, no 443)

Install `cloudflared` once on the host (pick your OS):

```sh
# macOS
brew install cloudflared
# Debian/Ubuntu (as root)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb
```

Then, with the app already up (steps 1–3), start a **Quick Tunnel** at the app's
origin:

```sh
cloudflared tunnel --url http://127.0.0.1:81
```

`cloudflared` dials **out** to Cloudflare (no inbound port needs to be open, not
even 443) and prints a banner like:

```text
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://<random-words>.trycloudflare.com
```

Open that `https://…trycloudflare.com` URL on a phone. The page is served over
HTTPS, so the camera and GPS prompts appear (a secure context). Stop the tunnel
with `Ctrl-C`; the URL is ephemeral and a new one is issued on every run.

> The Quick Tunnel is **for testing/development only** (Cloudflare says so). For
> a permanent hostname later, switch to a named Cloudflare Tunnel — that is a
> separate, out-of-scope step and still needs no Let's Encrypt or inbound 443.

---

## Troubleshooting

- **`bind: address already in use`** — set a different `APP_PORT` in `.env` and
  run `docker compose up -d` again. Never assume `81` is free. (Remember to
  point the tunnel at the new port too.)
- **`EACCES` binding port 81** — port 81 is a privileged port (< 1024). The
  Docker image runs as root so `docker compose up` binds it fine; if you run
  bare `npm start` on 81 as a non-root user, run it as root or grant the binary
  `CAP_NET_BIND_SERVICE` (`sudo setcap 'cap_net_bind_service=+ep' $(which node)`).
- **`app` stays `unhealthy`** — `docker compose logs app`; the app only reports
  healthy when `/health` returns `db: "up"`, so first confirm `docker compose ps`
  shows `db` healthy.
- **`db` never becomes healthy** — `docker compose logs db`; the most common
  cause is a leftover `pgdata` volume from an old Postgres major version — remove
  it with `docker compose down -v`.
- **DB down at app start** — by design the app still boots and `/health` returns
  `{"ok":true,"db":"down"}` (HTTP `503`); report POST returns `500` rather than
  hanging until the DB comes back.
- **Camera/GPS never prompt on a phone** — the page must be served over
  **HTTPS** (a secure context). Open the `https://…trycloudflare.com` URL from
  the Quick Tunnel (step 10), or test on `localhost`. Insecure `http://` origins
  (other than localhost) fall back to the permission-denied mock/manual paths.
- **Tunnel prints a URL but the browser can't reach it yet** — Quick Tunnel
  hostnames can take a few seconds to become routable; wait and retry. If it
  still fails, confirm outbound egress is allowed (cloudflared needs to reach
  Cloudflare's edge; no *inbound* ports are required).
