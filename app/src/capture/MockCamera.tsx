import { useCallback, useEffect, useRef } from "react";

interface MockCameraProps {
  onCapture: (photo: HTMLCanvasElement) => void;
  width?: number;
  height?: number;
}

/**
 * True when the runtime has a usable 2D canvas. jsdom reports
 * `HTMLCanvasElement.prototype.getContext("2d")` as "not implemented" and
 * logs an error to stderr *before* throwing, so we skip canvas drawing there
 * to keep headless test output clean. Real browsers always pass this check.
 */
function supportsCanvas2D(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }
  return true;
}

/**
 * Mock camera: draws a placeholder scene on a canvas and, on click, hands the
 * canvas to the caller. No `getUserMedia` / camera permission is ever asked.
 */
export function MockCamera({
  onCapture,
  width = 1280,
  height = 720,
}: MockCameraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawPlaceholder = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !supportsCanvas2D()) {
      return;
    }
    // jsdom (and some minimal runtimes) throw on `getContext("2d")` rather than
    // returning `null`, so guard the call defensively.
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) {
      return;
    }
    const now = new Date();
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.font = "bold 48px system-ui";
    ctx.fillText("MOCK CAMERA", width / 2, height / 2 - 24);
    ctx.font = "24px system-ui";
    ctx.fillText(now.toLocaleString(), width / 2, height / 2 + 24);
    ctx.fillText("Click anywhere to capture", width / 2, height / 2 + 64);
  }, [width, height]);

  useEffect(() => {
    drawPlaceholder();
  }, [drawPlaceholder]);

  const capture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    onCapture(canvas);
    // Refresh the timestamp a moment later, after the caller's async
    // canvas.toBlob() has captured the current bitmap.
    setTimeout(() => drawPlaceholder(), 150);
  }, [drawPlaceholder, onCapture]);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        backgroundColor: "black",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={capture}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          cursor: "crosshair",
        }}
      />
    </div>
  );
}
