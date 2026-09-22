import busboy from "busboy";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { whatIsAtLocation } from "./geo.js";
import { insertReport } from "./db.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface ParsedFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

interface ParsedReport {
  image?: ParsedFile;
  thumbnail?: ParsedFile;
  lat?: string;
  lon?: string;
  description?: string;
}

function maxUploadBytes(): number {
  const raw = Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024);
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 1024 * 1024;
}

function parseCoord(
  value: string | undefined,
  name: "lat" | "lon"
): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  const [min, max] = name === "lat" ? [-90, 90] : [-180, 180];
  if (n < min || n > max) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return n;
}

function parseMultipart(
  req: IncomingMessage,
  maxBytes: number
): Promise<ParsedReport> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    const files: Record<string, ParsedFile> = {};
    const filePromises: Promise<void>[] = [];
    let tooLarge = false;

    const bb = busboy({
      headers: req.headers,
      limits: {
        files: 2,
        fileSize: maxBytes,
        fields: 20,
        fieldSize: 1024 * 1024,
        parts: 30,
      },
    });

    bb.on("field", (name: string, val: string) => {
      fields[name] = val;
    });

    bb.on(
      "file",
      (
        name: string,
        file: Readable & { truncated?: boolean },
        info: { mimetype?: string; mimeType?: string }
      ) => {
        const chunks: Buffer[] = [];
        const mimetype =
          info.mimeType ?? info.mimetype ?? "application/octet-stream";

        const p = new Promise<void>((res, rej) => {
          file.on("limit", () => {
            tooLarge = true;
            rej(new HttpError(400, "Upload too large"));
          });
          file.on("data", (data: Buffer) => {
            chunks.push(data);
          });
          file.on("end", () => {
            if (file.truncated) {
              tooLarge = true;
              rej(new HttpError(400, "Upload too large"));
              return;
            }
            files[name] = {
              buffer: Buffer.concat(chunks),
              filename: `${name}`,
              mimetype,
            };
            res();
          });
          file.on("error", rej);
        });
        filePromises.push(p);
      }
    );

    bb.on("filesLimit", () => {
      reject(new HttpError(400, "Too many files"));
    });
    bb.on("error", (err: unknown) => {
      reject(err);
    });
    bb.on("close", async () => {
      try {
        await Promise.all(filePromises);
        if (tooLarge) {
          reject(new HttpError(400, "Upload too large"));
          return;
        }
        resolve({ ...files, ...fields });
      } catch (err) {
        reject(err);
      }
    });

    req.pipe(bb);
  });
}

/**
 * Handle `POST /api/report` (multipart/form-data).
 *
 * M14 -- real contract: `image` (required, JPEG), `thumbnail` (optional),
 * `lat` / `lon` (optional, validated), `description` (optional). The photo and
 * thumbnail are stored as `BYTEA` in Postgres — no uploads volume, no `voice`.
 */
export async function handleReport(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(400, "Expected multipart/form-data");
  }

  const limit = maxUploadBytes();
  const parsed = await parseMultipart(req, limit);

  const lat = parseCoord(parsed.lat, "lat");
  const lon = parseCoord(parsed.lon, "lon");
  const image = parsed.image;

  if (!image || image.buffer.length === 0) {
    throw new HttpError(400, "Missing image");
  }

  const description = parsed.description ?? "";
  const geoDesc =
    lat !== null && lon !== null ? await whatIsAtLocation({ lat, lon }) : "";

  const thumbnail =
    parsed.thumbnail && parsed.thumbnail.buffer.length > 0
      ? parsed.thumbnail.buffer
      : null;

  await insertReport({
    lat,
    lon,
    geoDesc,
    description,
    image: image.buffer,
    thumbnail,
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Report received successfully");
}
