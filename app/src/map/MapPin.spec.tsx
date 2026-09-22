import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MapPin } from "./MapPin.tsx";

/**
 * M10 -- real self-contained map + pin. `MapPin` derives an N×N OpenStreetMap
 * tile grid from `{lat, lon}` and overlays a centered pin; nothing is fetched
 * in jsdom, so these tests pin the rendered structure (grid size, tile URLs,
 * accessible label, pin percentage position, attribution).
 */

afterEach(cleanup);

describe("MapPin", () => {
  it("renders an accessible map image labelled with the coordinates", () => {
    const { container } = render(<MapPin lat={52.2297} lon={21.0122} />);

    const map = container.querySelector(".map-pin");
    expect(map).not.toBeNull();
    expect(map!.getAttribute("role")).toBe("img");
    expect(map!.getAttribute("aria-label")).toMatch(/52\.22970, 21\.01220/);
  });

  it("renders a 3×3 tile grid by default with OSM tile URLs", () => {
    const { container } = render(<MapPin lat={52.2297} lon={21.0122} />);

    const tiles = container.querySelectorAll(".map-pin__tile");
    expect(tiles).toHaveLength(9);
    for (const tile of Array.from(tiles)) {
      expect(tile.getAttribute("src")).toMatch(
        /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/
      );
      expect(tile.getAttribute("alt")).toBe("");
    }
  });

  it("honours a custom zoom and tile size", () => {
    const { container } = render(
      <MapPin lat={52.2297} lon={21.0122} zoom={10} tileSize={5} />
    );

    const tiles = container.querySelectorAll(".map-pin__tile");
    expect(tiles).toHaveLength(25);
    expect(tiles[0].getAttribute("src")).toMatch(
      /^https:\/\/tile\.openstreetmap\.org\/10\/\d+\/\d+\.png$/
    );
  });

  it("positions the pin as an in-bounds percentage and renders attribution", () => {
    const { container } = render(<MapPin lat={52.2297} lon={21.0122} />);

    const pin = container.querySelector(".map-pin__pin") as HTMLElement;
    expect(pin).not.toBeNull();
    expect(pin.style.left).toMatch(/%$/);
    expect(pin.style.top).toMatch(/%$/);

    const left = parseFloat(pin.style.left);
    const top = parseFloat(pin.style.top);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(100);
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(100);

    expect(
      container.querySelector(".map-pin__attribution")!.textContent
    ).toContain("OpenStreetMap");
  });
});
