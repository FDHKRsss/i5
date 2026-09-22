/**
 * Image capture helpers (M9 -- real).
 *
 * The camera step needs a compressed photo + thumbnail pair to push into the
 * wizard state. In a real browser `compressToImages` downscales a captured
 * frame (`<video>` or `<canvas>`) to a bounded JPEG (full ≤ `MAX_FULL_EDGE` px)
 * plus a small thumbnail (≤ `MAX_THUMB_EDGE` px) via `<canvas>`. Because jsdom
 * has no `canvas.toBlob` and no real camera, `makePlaceholderImages` stays as
 * the deterministic, headless-safe fallback that keeps the whole flow and the
 * test suite runnable without device capture.
 */
export interface CapturedImages {
  full: Blob;
  thumbnail: Blob;
}

/** Longest edge (px) of the compressed full-size photo. */
export const MAX_FULL_EDGE = 1280;
/** Longest edge (px) of the thumbnail. */
export const MAX_THUMB_EDGE = 360;

export function makePlaceholderImages(): CapturedImages {
  return {
    full: new Blob(["placeholder-photo"], { type: "image/jpeg" }),
    thumbnail: new Blob(["placeholder-thumbnail"], { type: "image/jpeg" }),
  };
}

/**
 * True when the runtime cannot produce a real JPEG (jsdom / no `toBlob`). We
 * test this explicitly because jsdom reports `getContext("2d")` as "not
 * implemented" and its canvas has no `toBlob`, so any real encode attempt
 * would throw or hang the capture.
 */
function isHeadless(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return true;
  }
  try {
    const probe = document.createElement("canvas");
    if (typeof probe.toBlob !== "function") {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function sourceSize(
  source: HTMLCanvasElement | HTMLVideoElement
): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.width, height: source.height };
}

function downscaleToJpeg(
  source: HTMLCanvasElement | HTMLVideoElement,
  maxEdge: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { width, height } = sourceSize(source);
    if (!width || !height) {
      reject(new Error("empty image source"));
      return;
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) {
      reject(new Error("2d context unavailable"));
      return;
    }

    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Downscale + JPEG-compress a captured frame into the full/thumbnail pair the
 * wizard stores. In headless runtimes this returns the deterministic
 * placeholder pair so the flow still completes without a camera/canvas.
 */
export async function compressToImages(
  source: HTMLCanvasElement | HTMLVideoElement
): Promise<CapturedImages> {
  if (isHeadless()) {
    return makePlaceholderImages();
  }
  const full = await downscaleToJpeg(source, MAX_FULL_EDGE, 0.85);
  const thumbnail = await downscaleToJpeg(source, MAX_THUMB_EDGE, 0.72);
  return { full, thumbnail };
}

/**
 * Read a Blob as a `data:` URL so it can be displayed in an `<img>`.
 *
 * The review step (M12) needs to show the captured photo thumbnail. jsdom does
 * not implement `URL.createObjectURL`, so we use `FileReader` (available in
 * both jsdom and browsers) and resolve `null` when the Blob cannot be read,
 * keeping the render headless-safe. A data URL also needs no later
 * `revokeObjectURL` bookkeeping.
 */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof FileReader === "undefined") {
      resolve(null);
      return;
    }
    try {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}
