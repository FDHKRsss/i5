// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendReport, type ReportPayload } from "../src/send.tsx";

/**
 * M12 -- real multipart submission.
 *
 * `sendReport` is the frontend-half of the M14 backend contract: it POSTs
 * `image` (required), `thumbnail` (optional), `lat`/`lon` (optional, finite)
 * and `description` as `multipart/form-data` to `/api/report`. It returns a
 * typed `SubmitResult` instead of throwing, so the review step can surface a
 * short, non-leaky message for a network failure / 4xx / 5xx. Audio (`voice`)
 * has been removed from the flow, so it must not appear in the payload.
 */

const jpeg = (): Blob => new Blob(["jpeg-bytes"], { type: "image/jpeg" });
const thumb = (): Blob => new Blob(["thumb-bytes"], { type: "image/jpeg" });

function payload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    image: jpeg(),
    thumbnail: thumb(),
    lat: 52.2297,
    lon: 21.0122,
    description: "Zepsuta latarnia",
    ...overrides,
  };
}

describe("sendReport (M12 -- real multipart submission)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs image, thumbnail, coordinates and description and reports success", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("Report received successfully", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReport(payload());

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/report");
    expect(init.method).toBe("POST");

    const body = init.body as FormData;
    expect(body.get("lat")).toBe("52.2297");
    expect(body.get("lon")).toBe("21.0122");
    expect(body.get("description")).toBe("Zepsuta latarnia");

    const imagePart = body.get("image") as File;
    expect(imagePart.name).toBe("image.jpg");
    expect(imagePart.type).toBe("image/jpeg");

    const thumbnailPart = body.get("thumbnail") as File;
    expect(thumbnailPart.name).toBe("thumbnail.jpg");
    expect(thumbnailPart.type).toBe("image/jpeg");

    // Audio is no longer part of the report flow.
    expect(body.has("voice")).toBe(false);
  });

  it("omits the thumbnail and coordinates when they are absent", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("ok", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendReport(payload({ thumbnail: null, lat: null, lon: null }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;

    // The image is always required; the description is always sent.
    expect(body.has("image")).toBe(true);
    expect(body.get("description")).toBe("Zepsuta latarnia");
    // Optional fields are not appended.
    expect(body.has("thumbnail")).toBe(false);
    expect(body.has("lat")).toBe(false);
    expect(body.has("lon")).toBe(false);
  });

  it("omits coordinates that are not finite numbers", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("ok", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendReport(
      payload({ lat: Number.NaN, lon: Number.POSITIVE_INFINITY })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.has("lat")).toBe(false);
    expect(body.has("lon")).toBe(false);
  });

  it("reports a 4xx client error with a short, non-leaky message", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("Bad request", { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReport(payload());

    expect(result).toEqual({
      ok: false,
      status: 400,
      message:
        "Nie udało się zapisać zgłoszenia. Popraw dane i spróbuj ponownie.",
    });
  });

  it("reports a 5xx server error with a distinct message", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("boom", { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReport(payload());

    expect(result).toEqual({
      ok: false,
      status: 503,
      message: "Serwer nie zapisał zgłoszenia. Spróbuj ponownie.",
    });
  });

  it("reports a network failure with a null status", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReport(payload());

    expect(result).toEqual({
      ok: false,
      status: null,
      message: "Nie udało się wysłać zgłoszenia. Sprawdź połączenie.",
    });
  });
});
