import { afterEach, describe, expect, it } from "vitest";
import {
  GeolocationError,
  getCurrentPosition,
  parsePosition,
  type GpsPosition,
} from "./location.ts";

/**
 * M10 -- real location module. `getCurrentPosition` wraps the real
 * `navigator.geolocation` API (high accuracy + 10 s timeout) and maps every
 * failure mode to a typed `GeolocationError`; `parsePosition` validates the
 * manual lat/lon fallback. These tests stub `navigator.geolocation` so they run
 * deterministically in jsdom without any real device or permission prompt.
 */

type SuccessCallback = (pos: {
  coords: { latitude: number; longitude: number; accuracy?: number };
}) => void;
type ErrorCallback = (err: { code?: number; message?: string }) => void;

interface GeolocationStub {
  getCurrentPosition?: (
    ok: SuccessCallback,
    err: ErrorCallback,
    opts?: PositionOptions
  ) => void;
}

function stubGeolocation(impl?: GeolocationStub): void {
  Object.defineProperty(window.navigator, "geolocation", {
    value: impl,
    configurable: true,
    writable: true,
  });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected the promise to reject");
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  // Leave no geolocation behind for the next test.
  Object.defineProperty(window.navigator, "geolocation", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe("getCurrentPosition (real GPS)", () => {
  it("resolves with lat/lon/accuracy from the browser position", async () => {
    stubGeolocation({
      getCurrentPosition(ok) {
        ok({
          coords: { latitude: 52.2297, longitude: 21.0122, accuracy: 12 },
        });
      },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      lat: 52.2297,
      lon: 21.0122,
      accuracy: 12,
    });
  });

  it("reports null accuracy when the source omits it", async () => {
    stubGeolocation({
      getCurrentPosition(ok) {
        ok({ coords: { latitude: 1, longitude: 2 } });
      },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      lat: 1,
      lon: 2,
      accuracy: null,
    });
  });

  it("requests high accuracy with a 10 s timeout and no stale cache", async () => {
    const options: PositionOptions[] = [];
    stubGeolocation({
      getCurrentPosition(ok, _err, opts) {
        options.push(opts ?? {});
        ok({ coords: { latitude: 0, longitude: 0 } });
      },
    });

    await getCurrentPosition();

    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });

  it("rejects with an 'unsupported' error when geolocation is unavailable", async () => {
    stubGeolocation(undefined);

    const error = (await captureRejection(
      getCurrentPosition()
    )) as GeolocationError;

    expect(error).toBeInstanceOf(GeolocationError);
    expect(error.name).toBe("GeolocationError");
    expect(error.code).toBe("unsupported");
    expect(error.message).toMatch(/niedostępna/i);
  });

  const ERROR_CASES: Array<{ code: number | undefined; expected: string }> = [
    { code: 1, expected: "permission-denied" },
    { code: 2, expected: "position-unavailable" },
    { code: 3, expected: "timeout" },
    { code: 0, expected: "unknown" },
    { code: undefined, expected: "unknown" },
  ];

  it.each(ERROR_CASES)(
    "maps browser error code $code to '$expected'",
    async ({ code, expected }) => {
      stubGeolocation({
        getCurrentPosition(_ok, err) {
          err({ code, message: "browser refused" });
        },
      });

      const error = (await captureRejection(
        getCurrentPosition()
      )) as GeolocationError;

      expect(error).toBeInstanceOf(GeolocationError);
      expect(error.code).toBe(expected);
    }
  );
});

describe("parsePosition (manual lat/lon fallback)", () => {
  it("parses valid coordinates with null accuracy", () => {
    expect(parsePosition("52.2297", "21.0122")).toEqual({
      lat: 52.2297,
      lon: 21.0122,
      accuracy: null,
    } satisfies GpsPosition);
  });

  it("accepts the extreme in-range corners", () => {
    expect(parsePosition("-90", "-180")).toEqual({
      lat: -90,
      lon: -180,
      accuracy: null,
    });
    expect(parsePosition("90", "180")).toEqual({
      lat: 90,
      lon: 180,
      accuracy: null,
    });
  });

  it("rejects non-numeric and empty input", () => {
    expect(parsePosition("", "21")).toBeNull();
    expect(parsePosition("abc", "21")).toBeNull();
    expect(parsePosition("52", "xyz")).toBeNull();
    expect(parsePosition("52", "")).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(parsePosition("91", "0")).toBeNull();
    expect(parsePosition("-91", "0")).toBeNull();
    expect(parsePosition("0", "181")).toBeNull();
    expect(parsePosition("0", "-181")).toBeNull();
  });
});
