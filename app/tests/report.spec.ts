// @vitest-environment node
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/geo.js", () => ({
  whatIsAtLocation: vi.fn(
    async ({ lat, lon }: { lat: number; lon: number }) => `geocoded ${lat},${lon}`
  ),
}));

vi.mock("../server/db.js", () => ({
  insertReport: vi.fn(async () => ({})),
}));

import { handleReport, HttpError } from "../server/report.js";
import { whatIsAtLocation } from "../server/geo.js";
import { insertReport } from "../server/db.js";

interface MultipartFile {
  name: string;
  filename: string;
  contentType: string;
  data: Buffer | string;
}

function buildMultipart(
  fields: Record<string, string> = {},
  files: MultipartFile[] = []
): { body: Buffer; boundary: string } {
  const boundary = `----vitest${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  const push = (s: string) => chunks.push(Buffer.from(s, "utf8"));

  for (const [key, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    push(`${value}\r\n`);
  }

  for (const file of files) {
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`
    );
    push(`Content-Type: ${file.contentType}\r\n\r\n`);
    chunks.push(
      typeof file.data === "string" ? Buffer.from(file.data, "utf8") : file.data
    );
    push("\r\n");
  }

  push(`--${boundary}--\r\n`);
  return { body: Buffer.concat(chunks), boundary };
}

function makeRequest(
  body: Buffer,
  boundary: string
): Readable & { headers: Record<string, string> } {
  const stream = Readable.from([body]) as Readable & {
    headers: Record<string, string>;
  };
  stream.headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
  return stream;
}

function makeResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    headersSent: false,
    body: "",
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end(data?: string) {
      res.body = data ?? "";
    },
  };
  return res;
}

/** Mirrors the POST /api/report error handling in server/index.ts. */
async function dispatch(
  req: Readable & { headers: Record<string, string> },
  res: ReturnType<typeof makeResponse>
) {
  try {
    await handleReport(req as never, res as never);
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Server error";
    if (!res.headersSent) {
      res.statusCode = status;
      res.end(message);
    }
  }
}

const image: MultipartFile = {
  name: "image",
  filename: "image.jpg",
  contentType: "image/jpeg",
  data: Buffer.from("fake-jpeg-bytes"),
};

const thumbnail: MultipartFile = {
  name: "thumbnail",
  filename: "thumbnail.jpg",
  contentType: "image/jpeg",
  data: Buffer.from("fake-thumb-bytes"),
};

describe("handleReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-multipart request with 400", async () => {
    const res = makeResponse();
    const req = Readable.from([Buffer.from("not multipart")]) as Readable & {
      headers: Record<string, string>;
    };
    req.headers = { "content-type": "application/json" };

    await dispatch(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Expected multipart/form-data");
  });

  it("rejects a report without an image with 400", async () => {
    const { body, boundary } = buildMultipart({ lat: "52.2", lon: "21.0" });
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Missing image");
    expect(vi.mocked(insertReport)).not.toHaveBeenCalled();
  });

  it("rejects an empty image file with 400", async () => {
    const emptyImage = { ...image, data: Buffer.alloc(0) };
    const { body, boundary } = buildMultipart({}, [emptyImage]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Missing image");
    expect(vi.mocked(insertReport)).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric latitude", async () => {
    const { body, boundary } = buildMultipart(
      { lat: "not-a-number", lon: "21.0" },
      [image]
    );
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Invalid lat");
  });

  it("rejects a non-finite latitude (Infinity)", async () => {
    const { body, boundary } = buildMultipart(
      { lat: "Infinity", lon: "21.0" },
      [image]
    );
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Invalid lat");
  });

  it("rejects an out-of-range latitude", async () => {
    const { body, boundary } = buildMultipart({ lat: "91", lon: "21.0" }, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Invalid lat");
  });

  it("rejects an out-of-range longitude", async () => {
    const { body, boundary } = buildMultipart({ lat: "52.2", lon: "200" }, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Invalid lon");
  });

  it("accepts an image-only report without coordinates", async () => {
    const { body, boundary } = buildMultipart({}, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("Report received successfully");
    expect(whatIsAtLocation).not.toHaveBeenCalled();
    expect(vi.mocked(insertReport)).toHaveBeenCalledWith({
      lat: null,
      lon: null,
      geoDesc: "",
      description: "",
      image: Buffer.from("fake-jpeg-bytes"),
      thumbnail: null,
    });
  });

  it("treats whitespace-only coordinates as absent", async () => {
    const { body, boundary } = buildMultipart({ lat: "   ", lon: "   " }, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(200);
    expect(whatIsAtLocation).not.toHaveBeenCalled();
    expect(vi.mocked(insertReport)).toHaveBeenCalledWith(
      expect.objectContaining({ lat: null, lon: null, geoDesc: "" })
    );
  });

  it("skips reverse-geocoding when only latitude is provided", async () => {
    const { body, boundary } = buildMultipart({ lat: "52.2297" }, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("Report received successfully");
    expect(whatIsAtLocation).not.toHaveBeenCalled();
    expect(vi.mocked(insertReport)).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 52.2297, lon: null, geoDesc: "" })
    );
  });

  it("persists a valid report with image + thumbnail + coordinates + description", async () => {
    const { body, boundary } = buildMultipart(
      { lat: "52.2297", lon: "21.0122", description: "Zepsuta latarnia" },
      [image, thumbnail]
    );
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("Report received successfully");
    expect(whatIsAtLocation).toHaveBeenCalledWith({ lat: 52.2297, lon: 21.0122 });
    expect(vi.mocked(insertReport)).toHaveBeenCalledWith({
      lat: 52.2297,
      lon: 21.0122,
      geoDesc: "geocoded 52.2297,21.0122",
      description: "Zepsuta latarnia",
      image: Buffer.from("fake-jpeg-bytes"),
      thumbnail: Buffer.from("fake-thumb-bytes"),
    });
  });

  it("returns 500 when the database insert fails", async () => {
    vi.mocked(insertReport).mockRejectedValueOnce(new Error("db down"));
    const { body, boundary } = buildMultipart({ lat: "1", lon: "2" }, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(500);
    expect(vi.mocked(insertReport)).toHaveBeenCalledTimes(1);
  });
});

describe("handleReport edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores no thumbnail when one is not uploaded", async () => {
    const { body, boundary } = buildMultipart({ lat: "1", lon: "2" }, [image]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(insertReport)).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnail: null })
    );
  });

  it("rejects an oversized upload with 400", async () => {
    const prev = process.env.MAX_UPLOAD_BYTES;
    process.env.MAX_UPLOAD_BYTES = "16";
    try {
      const bigImage = { ...image, data: Buffer.alloc(64, 0x61) };
      const { body, boundary } = buildMultipart({}, [bigImage]);
      const res = makeResponse();

      await dispatch(makeRequest(body, boundary), res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toBe("Upload too large");
    } finally {
      if (prev === undefined) delete process.env.MAX_UPLOAD_BYTES;
      else process.env.MAX_UPLOAD_BYTES = prev;
    }
  });

  it("rejects more than two files with 400", async () => {
    const extra = {
      name: "extra",
      filename: "extra.jpg",
      contentType: "image/jpeg",
      data: Buffer.from("extra"),
    };
    const { body, boundary } = buildMultipart({}, [image, thumbnail, extra]);
    const res = makeResponse();

    await dispatch(makeRequest(body, boundary), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toBe("Too many files");
  });
});
