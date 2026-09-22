import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MockCamera } from "./MockCamera.tsx";

describe("MockCamera (jsdom-safe capture)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a canvas without calling getContext under jsdom", () => {
    // jsdom logs `Error: Not implemented: HTMLCanvasElement.prototype.getContext`
    // to stderr when getContext("2d") is invoked, so the guard must skip drawing.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    const { container } = render(<MockCamera onCapture={() => {}} />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("width")).toBe("1280");
    expect(canvas?.getAttribute("height")).toBe("720");
    expect(getContext).not.toHaveBeenCalled();
  });

  it("still hands the canvas to onCapture on click under jsdom", () => {
    let captured: HTMLCanvasElement | null = null;

    const { container } = render(
      <MockCamera onCapture={(canvas) => (captured = canvas)} />
    );

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.click(canvas);

    expect(captured).toBe(canvas);
  });
});
