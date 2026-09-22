import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getReportImage,
  getReportThumbnail,
  listReports,
  ping,
} from "./db.js";
import { handleReport, HttpError } from "./report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Port 81 is the Cloudflare Quick Tunnel origin (see docs/ARCHITECTURE.md):
// `cloudflared tunnel --url http://127.0.0.1:81` publishes this plain-HTTP
// origin as an https://*.trycloudflare.com URL. Overridable via PORT.
export const PORT = Number(process.env.PORT ?? 81);
const DIST_DIR = process.env.DIST_DIR ?? path.resolve(__dirname, "../dist");

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get("/health", async (_req, res) => {
  const dbUp = await ping();
  res.status(dbUp ? 200 : 503).json({ ok: true, db: dbUp ? "up" : "down" });
});

// `/api/report` accepts only POST (multipart). Non-POST methods get a 405,
// per the API contract in docs/ARCHITECTURE.md.
app.all("/api/report", async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    await handleReport(req, res);
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 500;
    if (status >= 500) {
      // Internal details are logged, never leaked to the client.
      console.error(err);
      if (!res.headersSent) {
        res.status(status).send("Internal server error");
      }
      return;
    }
    if (!res.headersSent) {
      res.status(status).send(err instanceof Error ? err.message : "Bad request");
    }
  }
});

app.get("/api/reports", async (req, res) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 50, 1), 100);
    const rows = await listReports(limit);
    // Public contract: metadata only, plus URLs the client fetches the image
    // bytes from. `created_at` is exposed (ISO string) so the list can sort
    // and display the timestamp; the `image`/`thumbnail` BYTEA columns are
    // never inlined into this payload.
    const publicRows = rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      lat: row.lat,
      lon: row.lon,
      geo_desc: row.geo_desc,
      description: row.description,
      thumbnailUrl: `/api/reports/${row.id}/thumbnail`,
      imageUrl: `/api/reports/${row.id}/image`,
    }));
    res.json(publicRows);
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: "Database unavailable" });
  }
});

app.get("/api/reports/:id/image", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(404).send("Not found");
    return;
  }
  try {
    const image = await getReportImage(req.params.id);
    if (!image) {
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(image);
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: "Database unavailable" });
  }
});

app.get("/api/reports/:id/thumbnail", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(404).send("Not found");
    return;
  }
  try {
    const thumbnail = await getReportThumbnail(req.params.id);
    if (!thumbnail) {
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(thumbnail);
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: "Database unavailable" });
  }
});

app.use(express.static(DIST_DIR));

app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

// Start listening only when this file is the entry point, so integration
// tests can import `app` without binding a host port.
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Civil42 server listening on http://0.0.0.0:${PORT}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`Failed to start server on port ${PORT}: ${err.message}`);
    process.exit(1);
  });
}
