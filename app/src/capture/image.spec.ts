import { describe, expect, it } from "vitest";
import { makePlaceholderImages } from "./image.ts";

/**
 * M9 -- stub image helpers. `makePlaceholderImages` must return the
 * `{ full, thumbnail }` JPEG Blob pair that the camera step pushes into the
 * wizard state so the report flow runs end-to-end before the real canvas
 * downscale/compress lands (M9 -- real).
 */

/** jsdom's Blob lacks arrayBuffer()/text(); FileReader is the portable way to
 * read one. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("makePlaceholderImages (M9 -- stub)", () => {
  it("returns a full and thumbnail JPEG blob pair", () => {
    const images = makePlaceholderImages();

    expect(images.full).toBeInstanceOf(Blob);
    expect(images.thumbnail).toBeInstanceOf(Blob);
    expect(images.full.type).toBe("image/jpeg");
    expect(images.thumbnail.type).toBe("image/jpeg");
  });

  it("produces distinct, non-empty full and thumbnail payloads", async () => {
    const images = makePlaceholderImages();
    const full = await readBlobText(images.full);
    const thumbnail = await readBlobText(images.thumbnail);

    expect(full).toBe("placeholder-photo");
    expect(thumbnail).toBe("placeholder-thumbnail");
    expect(full).not.toBe(thumbnail);
  });
});
