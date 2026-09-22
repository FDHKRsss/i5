// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

vi.mock("../server/db.js", () => ({
  ping: vi.fn(async () => true),
  listReports: vi.fn(async () => []),
  insertReport: vi.fn(async () => ({})),
  getReportImage: vi.fn(async () => null),
  getReportThumbnail: vi.fn(async () => null),
}));

vi.mock("../server/geo.js", () => ({
  whatIsAtLocation: vi.fn(
    async ({ lat, lon }: { lat: number; lon: number }) => `mock ${lat},${lon}`
  ),
}));

import { app } from "../server/index.js";
import {
  getReportImage,
  getReportThumbnail,
  insertReport,
  listReports,
  ping,
} from "../server/db.js";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Bind an OS-chosen (ephemeral) port so the test never collides with a
  // process already listening on a fixed port.
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** Build a minimal, valid multipart/form-data report body (image + coords). */
function buildReportBody(boundary: string): string {
  return [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="lat"\r\n\r\n`,
    `52.2\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="lon"\r\n\r\n`,
    `21.0\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="image"; filename="photo.jpg"\r\n`,
    `Content-Type: image/jpeg\r\n\r\n`,
    `fake-jpeg-bytes`,
    `\r\n--${boundary}--\r\n`,
  ].join("");
}

describe("Express app (HTTP layer)", () => {
  it("GET /health returns 200 and db up when the database responds", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up" });
  });

  it("GET /health returns 503 and db down when ping fails", async () => {
    vi.mocked(ping).mockResolvedValueOnce(false);
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: true, db: "down" });
  });

  it("does not expose the x-powered-by header", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("serves the built frontend at / and falls back to index.html for SPA routes", async () => {
    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    const rootHtml = await root.text();
    expect(rootHtml).toContain('<div id="app"></div>');
    expect(rootHtml).toContain('<title>Civil42</title>');

    // Unknown client-side routes must fall back to the SPA shell, not 404.
    const spaRoute = await fetch(`${baseUrl}/some/client/route`);
    expect(spaRoute.status).toBe(200);
    expect(await spaRoute.text()).toContain('<div id="app"></div>');
  });

  it("GET /api/reports returns the public contract and clamps an oversized limit to 100", async () => {
    vi.mocked(listReports).mockResolvedValueOnce([
      {
        id: REPORT_ID,
        created_at: new Date("2026-09-09T12:00:00Z"),
        lat: 52.2297,
        lon: 21.0122,
        geo_desc: "mock location (52.22970, 21.01220)",
        description: "Zepsuta latarnia",
      },
    ] as never);
    const res = await fetch(`${baseUrl}/api/reports?limit=9999`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: REPORT_ID,
        created_at: "2026-09-09T12:00:00.000Z",
        lat: 52.2297,
        lon: 21.0122,
        geo_desc: "mock location (52.22970, 21.01220)",
        description: "Zepsuta latarnia",
        thumbnailUrl: `/api/reports/${REPORT_ID}/thumbnail`,
        imageUrl: `/api/reports/${REPORT_ID}/image`,
      },
    ]);
    expect(listReports).toHaveBeenCalledWith(100);
  });

  it("never inlines the image/thumbnail BYTEA columns into the list payload", async () => {
    vi.mocked(listReports).mockResolvedValueOnce([
      {
        id: REPORT_ID,
        created_at: new Date("2026-09-09T12:00:00Z"),
        lat: null,
        lon: null,
        geo_desc: null,
        description: "",
        image: Buffer.from("secret-image-bytes"),
        thumbnail: Buffer.from("secret-thumb-bytes"),
      },
    ] as never);

    const res = await fetch(`${baseUrl}/api/reports?limit=10`);
    const body = await res.json();
    expect(body[0].image).toBeUndefined();
    expect(body[0].thumbnail).toBeUndefined();
    expect(body[0].imageUrl).toBe(`/api/reports/${REPORT_ID}/image`);
    expect(body[0].thumbnailUrl).toBe(`/api/reports/${REPORT_ID}/thumbnail`);
  });

  it("defaults the report limit to 50 and enforces a minimum of 1", async () => {
    await fetch(`${baseUrl}/api/reports`);
    expect(listReports).toHaveBeenCalledWith(50);

    vi.mocked(listReports).mockClear();
    await fetch(`${baseUrl}/api/reports?limit=0`);
    expect(listReports).toHaveBeenCalledWith(1);
  });

  it("falls back to the default limit when limit is not a number", async () => {
    await fetch(`${baseUrl}/api/reports?limit=abc`);
    expect(listReports).toHaveBeenCalledWith(50);
  });

  it("GET /api/reports returns 503 when the database is unavailable", async () => {
    vi.mocked(listReports).mockRejectedValueOnce(new Error("db down"));
    const res = await fetch(`${baseUrl}/api/reports`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Database unavailable" });
  });

  it("GET /api/report returns 405 with an Allow: POST header", async () => {
    const res = await fetch(`${baseUrl}/api/report`);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(await res.text()).toBe("Method not allowed");
  });

  it("POST /api/report rejects non-multipart content with 400", async () => {
    const res = await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Expected multipart/form-data");
  });

  it("POST /api/report accepts a valid multipart report end-to-end", async () => {
    const boundary = "----civil42testboundary";
    const body = buildReportBody(boundary);

    const res = await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Report received successfully");
  });

  it("POST /api/report returns a generic 500 (no leaked details) when the DB insert fails", async () => {
    vi.mocked(insertReport).mockRejectedValueOnce(new Error("db down"));
    const boundary = "----civil42testboundary500";
    const body = buildReportBody(boundary);

    const res = await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal server error");
  });

  it("POST /api/report returns 400 when the image is missing", async () => {
    const boundary = "----civil42testboundarynoimage";
    const body = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="lat"\r\n\r\n`,
      `52.2\r\n`,
      `--${boundary}--\r\n`,
    ].join("");

    const res = await fetch(`${baseUrl}/api/report`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing image");
  });

  it("GET /api/reports/:id/image serves the stored JPEG bytes", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    vi.mocked(getReportImage).mockResolvedValueOnce(bytes);

    const res = await fetch(`${baseUrl}/api/reports/${REPORT_ID}/image`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(getReportImage).toHaveBeenCalledWith(REPORT_ID);
  });

  it("GET /api/reports/:id/image returns 404 when the image is absent", async () => {
    vi.mocked(getReportImage).mockResolvedValueOnce(null);
    const res = await fetch(`${baseUrl}/api/reports/${REPORT_ID}/image`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("GET /api/reports/:id/image returns 404 for a malformed id", async () => {
    const res = await fetch(`${baseUrl}/api/reports/not-a-uuid/image`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(getReportImage).not.toHaveBeenCalled();
  });

  it("GET /api/reports/:id/image returns 503 when the database is unavailable", async () => {
    vi.mocked(getReportImage).mockRejectedValueOnce(new Error("db down"));
    const res = await fetch(`${baseUrl}/api/reports/${REPORT_ID}/image`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Database unavailable" });
  });

  it("GET /api/reports/:id/thumbnail serves the stored thumbnail bytes", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0x01, 0x02]);
    vi.mocked(getReportThumbnail).mockResolvedValueOnce(bytes);

    const res = await fetch(`${baseUrl}/api/reports/${REPORT_ID}/thumbnail`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(getReportThumbnail).toHaveBeenCalledWith(REPORT_ID);
  });

  it("GET /api/reports/:id/thumbnail returns 404 when the thumbnail is absent", async () => {
    vi.mocked(getReportThumbnail).mockResolvedValueOnce(null);
    const res = await fetch(`${baseUrl}/api/reports/${REPORT_ID}/thumbnail`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("GET /api/reports/:id/thumbnail returns 404 for a malformed id", async () => {
    const res = await fetch(`${baseUrl}/api/reports/not-a-uuid/thumbnail`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(getReportThumbnail).not.toHaveBeenCalled();
  });
});
