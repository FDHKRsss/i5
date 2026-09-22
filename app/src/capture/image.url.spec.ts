import { afterEach, describe, expect, it, vi } from "vitest";
import { blobToDataUrl } from "./image.ts";

/**
 * M12 -- real review preview helper. The review step needs to display the
 * captured photo thumbnail in an `<img>`. Because jsdom does not implement
 * `URL.createObjectURL`, the app reads the Blob via `FileReader.readAsDataURL`
 * and resolves `null` when the runtime cannot read it, so the render stays
 * headless-safe.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blobToDataUrl (M12 -- real)", () => {
  it("returns a data: URL for a JPEG blob", async () => {
    const url = await blobToDataUrl(new Blob(["jpeg"], { type: "image/jpeg" }));

    expect(url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("resolves null when FileReader is unavailable", async () => {
    vi.stubGlobal("FileReader", undefined);

    const url = await blobToDataUrl(new Blob(["jpeg"], { type: "image/jpeg" }));

    expect(url).toBeNull();
  });

  it("resolves null when the reader errors instead of loading", async () => {
    class FailingFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_blob: Blob): void {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);

    const url = await blobToDataUrl(new Blob(["jpeg"], { type: "image/jpeg" }));

    expect(url).toBeNull();
  });
});
