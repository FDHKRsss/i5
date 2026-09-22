import { useCallback, useEffect, useRef, useState } from "react";
import { MockCamera } from "./MockCamera.tsx";
import {
  compressToImages,
  makePlaceholderImages,
  type CapturedImages,
} from "./image.ts";

type CameraMode = "starting" | "live" | "fallback";

interface CameraProps {
  /** Called with the compressed full photo + thumbnail once a shot is taken. */
  onCapture: (images: CapturedImages) => void;
}

/**
 * Real camera (M9 -- real). Requests the rear camera via
 * `navigator.mediaDevices.getUserMedia` (requires HTTPS or localhost), shows a
 * live `<video>` preview, and on shutter downscales the frame to a compressed
 * JPEG + thumbnail via `src/capture/image.ts`. When the camera is unavailable
 * or permission is denied it falls back to the deterministic `MockCamera`
 * placeholder, so the flow and the headless test suite still run.
 */
export function Camera({ onCapture }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<CameraMode>("starting");

  useEffect(() => {
    let cancelled = false;
    const mediaDevices = navigator.mediaDevices;

    const fallback = () => {
      if (!cancelled) {
        setMode("fallback");
      }
    };

    // No secure context / browser support / test runtime: go straight to the
    // mock fallback without asking for a permission we cannot honour.
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      fallback();
      return;
    }

    const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

    async function start() {
      try {
        const stream = await getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Autoplay policies may block `play()`; the shutter still captures.
          }
        }
        setMode("live");
      } catch {
        fallback();
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const handleShutter = useCallback(async () => {
    const video = videoRef.current;
    if (!video || mode !== "live") {
      return;
    }
    try {
      const images = await compressToImages(video);
      onCapture(images);
    } catch {
      // Frame not ready / encode failed: keep the flow alive with the
      // deterministic placeholder rather than dropping the capture.
      onCapture(makePlaceholderImages());
    }
  }, [mode, onCapture]);

  const handleFallbackCapture = useCallback(
    (_canvas: HTMLCanvasElement) => {
      onCapture(makePlaceholderImages());
    },
    [onCapture]
  );

  if (mode === "fallback") {
    return (
      <>
        <MockCamera onCapture={handleFallbackCapture} />
        <p className="camera__fallback-note">
          Aparat niedostępny — użyto widoku zastępczego.
        </p>
      </>
    );
  }

  return (
    <div className="camera">
      <video
        ref={videoRef}
        className="camera__video"
        autoPlay
        playsInline
        muted
        aria-label="Podgląd aparatu"
      />
      <button
        type="button"
        className="button button--primary camera__shutter"
        disabled={mode !== "live"}
        onClick={() => void handleShutter()}
      >
        Zrób zdjęcie
      </button>
    </div>
  );
}
