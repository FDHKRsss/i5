import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressToImages, MAX_FULL_EDGE, MAX_THUMB_EDGE } from "./image.ts";

/**
 * M9 -- real image compression.
 *
 * jsdom is a "headless" runtime for `image.ts`: its `navigator.userAgent`
 * contains "jsdom" and its canvas `toBlob`/`getContext("2d")` are stubs that
 * log "not implemented" and never invoke the callback. To validate the real
 * downscale + JPEG encode path we bypass that guard and install a working
 * `toBlob` + 2D context, then assert the bounded dimensions and JPEG type.
 */

interface EncodeCall {
  width: number;
  height: number;
  type: string;
  quality: number;
}

const drawImage = vi.fn();

function installWorkingCanvas(): () => EncodeCall[] {
  const encodeCalls: EncodeCall[] = [];

  // Remove the "jsdom" marker so `isHeadless()` takes the real path.
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });

  // Replace jsdom's no-op toBlob with one that records the resized canvas and
  // resolves with a JPEG blob, like a real browser.
  (
    HTMLCanvasElement.prototype as unknown as {
      toBlob?: (
        cb: (blob: Blob | null) => void,
        type?: string,
        quality?: number
      ) => void;
    }
  ).toBlob = function (
    this: HTMLCanvasElement,
    cb: (blob: Blob | null) => void,
    type?: string,
    quality?: number
  ) {
    encodeCalls.push({
      width: this.width,
      height: this.height,
      type: String(type),
      quality: Number(quality),
    });
    cb(new Blob(["jpeg"], { type: "image/jpeg" }));
  };

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);

  return () => encodeCalls;
}

function makeVideoSource(width: number, height: number): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
  return video;
}

function makeCanvasSource(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

let getEncodeCalls: (() => EncodeCall[]) | null = null;

beforeEach(() => {
  drawImage.mockClear();
  getEncodeCalls = installWorkingCanvas();
});

afterEach(() => {
  getEncodeCalls = null;
  vi.restoreAllMocks();
  delete (HTMLCanvasElement.prototype as unknown as { toBlob?: unknown }).toBlob;
  delete (navigator as unknown as { userAgent?: unknown }).userAgent;
});

describe("compressToImages (M9 -- real)", () => {
  it("returns a JPEG full/thumbnail pair through the real encode path", async () => {
    const images = await compressToImages(makeVideoSource(2000, 1000));

    expect(images.full).toBeInstanceOf(Blob);
    expect(images.thumbnail).toBeInstanceOf(Blob);
    expect(images.full.type).toBe("image/jpeg");
    expect(images.thumbnail.type).toBe("image/jpeg");
  });

  it("downscales the full photo to the bounded longest edge", async () => {
    const calls = getEncodeCalls!();
    await compressToImages(makeVideoSource(2000, 1000));

    // Full first, thumbnail second.
    expect(calls[0].width).toBe(MAX_FULL_EDGE); // 2000 -> 1280
    expect(calls[0].height).toBe(640); // 1000 -> 640
    expect(calls[0].type).toBe("image/jpeg");
    expect(calls[0].quality).toBe(0.85);
  });

  it("downscales the thumbnail to the bounded longest edge", async () => {
    const calls = getEncodeCalls!();
    await compressToImages(makeVideoSource(2000, 1000));

    expect(calls[1].width).toBe(360); // 2000 -> 360
    expect(calls[1].height).toBe(180); // 1000 -> 180
    expect(calls[1].type).toBe("image/jpeg");
    expect(calls[1].quality).toBe(0.72);
  });

  it("never upscales a source smaller than the maximum", async () => {
    const calls = getEncodeCalls!();
    await compressToImages(makeCanvasSource(800, 600));

    // Longest edge 800 < 1280, so the full stays 1:1; the thumbnail still
    // shrinks to the 360 edge.
    expect(calls[0].width).toBe(800);
    expect(calls[0].height).toBe(600);
    expect(calls[1].width).toBe(360);
    expect(calls[1].height).toBe(270);
  });

  it("draws the source into the resized canvas once per output", async () => {
    const source = makeVideoSource(2000, 1000);
    await compressToImages(source);

    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawImage).toHaveBeenNthCalledWith(
      1,
      source,
      0,
      0,
      MAX_FULL_EDGE,
      640
    );
    expect(drawImage).toHaveBeenNthCalledWith(2, source, 0, 0, 360, 180);
  });

  it("uses the thumbnail bound for a source already at the full bound", async () => {
    const calls = getEncodeCalls!();
    await compressToImages(makeCanvasSource(MAX_THUMB_EDGE, MAX_THUMB_EDGE));

    // A 360x360 source is below MAX_FULL_EDGE (no full downscale) and equals
    // MAX_THUMB_EDGE (thumbnail scale = 1).
    expect(calls[0].width).toBe(MAX_THUMB_EDGE);
    expect(calls[0].height).toBe(MAX_THUMB_EDGE);
    expect(calls[1].width).toBe(MAX_THUMB_EDGE);
    expect(calls[1].height).toBe(MAX_THUMB_EDGE);
  });
});
