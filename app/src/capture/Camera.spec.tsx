import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Camera } from "./Camera.tsx";
import { compressToImages } from "./image.ts";

/**
 * M9 -- real camera component.
 *
 * These tests exercise the real `getUserMedia` path (not the mock fallback):
 * the exact constraint object, the live `<video>` wiring, the shutter gate,
 * the shutter -> compressToImages -> onCapture contract, track cleanup on
 * unmount, and the permission-denied fallback. `compressToImages` is mocked so
 * the real canvas JPEG encode is tested separately in `image.real.spec.ts`.
 */

vi.mock("./image.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./image.ts")>();
  return { ...actual, compressToImages: vi.fn() };
});

const mockedCompress = vi.mocked(compressToImages);

const FULL = new Blob(["full-jpeg"], { type: "image/jpeg" });
const THUMB = new Blob(["thumb-jpeg"], { type: "image/jpeg" });

function makeStream() {
  const track = { stop: vi.fn() };
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    track,
  };
}

function installMediaDevices(getUserMedia: () => Promise<MediaStream>): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

function removeMediaDevices(): void {
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
}

beforeEach(() => {
  mockedCompress.mockReset();
  mockedCompress.mockResolvedValue({ full: FULL, thumbnail: THUMB });
  // jsdom does not implement media playback; make `play()` resolve so the
  // live path settles deterministically.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  removeMediaDevices();
  vi.restoreAllMocks();
});

describe("Camera (M9 -- real, getUserMedia path)", () => {
  it("requests the rear camera with no audio and wires the live video preview", async () => {
    const { stream } = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installMediaDevices(getUserMedia);

    render(<Camera onCapture={() => {}} />);

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: "environment" },
        audio: false,
      })
    );

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect((video as HTMLVideoElement).srcObject).toBe(stream);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    // The shutter unlocks once the stream is live.
    const shutter = screen.getByRole("button", { name: "Zrób zdjęcie" });
    expect(shutter.hasAttribute("disabled")).toBe(false);
  });

  it("keeps the shutter disabled while the camera is still starting", () => {
    // A never-resolving getUserMedia keeps the component in the "starting"
    // state, where a shot must not be possible yet.
    const getUserMedia = vi.fn().mockReturnValue(new Promise<MediaStream>(() => {}));
    installMediaDevices(getUserMedia);

    render(<Camera onCapture={() => {}} />);

    expect(
      screen.getByRole("button", { name: "Zrób zdjęcie" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("compresses the current video frame and hands the pair to onCapture on shutter", async () => {
    const { stream } = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installMediaDevices(getUserMedia);
    const onCapture = vi.fn();

    render(<Camera onCapture={onCapture} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Zrób zdjęcie" }).hasAttribute("disabled")
      ).toBe(false)
    );

    fireEvent.click(screen.getByRole("button", { name: "Zrób zdjęcie" }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const video = document.querySelector("video");
    expect(mockedCompress).toHaveBeenCalledWith(video);
    expect(onCapture).toHaveBeenCalledWith({ full: FULL, thumbnail: THUMB });
  });

  it("stops the camera tracks on unmount", async () => {
    const { stream, track } = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installMediaDevices(getUserMedia);

    const { unmount } = render(<Camera onCapture={() => {}} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Zrób zdjęcie" }).hasAttribute("disabled")
      ).toBe(false)
    );

    unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("falls back to the mock camera when permission is denied", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    installMediaDevices(getUserMedia);
    const onCapture = vi.fn();

    const { container } = render(<Camera onCapture={onCapture} />);

    await waitFor(() =>
      expect(screen.getByText(/Aparat niedostępny/i)).toBeTruthy()
    );

    // The fallback renders the click-to-capture mock surface, not a live
    // shutter button.
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Zrób zdjęcie" })).toBeNull();
  });

  it("falls back when the runtime has no mediaDevices (headless/jsdom)", () => {
    // No mediaDevices installed: jsdom's default, matching a headless run.
    const { container } = render(<Camera onCapture={() => {}} />);

    expect(screen.getByText(/Aparat niedostępny/i)).toBeTruthy();
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Zrób zdjęcie" })).toBeNull();
  });
});
