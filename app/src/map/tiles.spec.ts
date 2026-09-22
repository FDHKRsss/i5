import { describe, expect, it } from "vitest";
import { clampTileY, tileCoords, wrapTileX } from "./tiles.ts";

/**
 * M10 -- real map tile math (OSM slippy-map). `tileCoords` converts a WGS84
 * coordinate to the tile that contains it plus the fractional offset inside it;
 * `wrapTileX`/`clampTileY` fold the grid back into a valid tile index so
 * `MapPin` always emits a renderable OSM URL.
 */

describe("tileCoords", () => {
  it("computes the tile and fractional offset for the origin at zoom 0", () => {
    expect(tileCoords(0, 0, 0)).toEqual({
      x: 0,
      y: 0,
      fracX: 0.5,
      fracY: 0.5,
    });
  });

  it("computes the exact tiles for whole-degree samples", () => {
    expect(tileCoords(0, 0, 1)).toEqual({
      x: 1,
      y: 1,
      fracX: 0,
      fracY: 0,
    });
    expect(tileCoords(0, 90, 0)).toEqual({
      x: 0,
      y: 0,
      fracX: 0.75,
      fracY: 0.5,
    });
  });

  it("returns integer indices and in-range fractions for real-world samples", () => {
    const samples = [
      { lat: 52.2297, lon: 21.0122, zoom: 16 },
      { lat: -33.8688, lon: 151.2093, zoom: 10 },
      { lat: 48.8566, lon: 2.3522, zoom: 13 },
      { lat: 40.7128, lon: -74.006, zoom: 8 },
    ];

    for (const { lat, lon, zoom } of samples) {
      const point = tileCoords(lat, lon, zoom);
      expect(Number.isInteger(point.x)).toBe(true);
      expect(Number.isInteger(point.y)).toBe(true);
      expect(point.fracX).toBeGreaterThanOrEqual(0);
      expect(point.fracX).toBeLessThan(1);
      expect(point.fracY).toBeGreaterThanOrEqual(0);
      expect(point.fracY).toBeLessThan(1);
    }
  });

  it("clamps latitude to the Web-Mercator range and stays renderable after clamping", () => {
    const zoom = 10;
    const n = 2 ** zoom;

    // At the poles the raw row can leave [0, n); clampTileY folds it back, so
    // MapPin never emits an out-of-range tile URL.
    const north = tileCoords(90, 0, zoom);
    const south = tileCoords(-90, 0, zoom);

    expect(clampTileY(north.y, zoom)).toBe(0);
    expect(clampTileY(south.y, zoom)).toBe(n - 1);
  });
});

describe("wrapTileX", () => {
  it("wraps columns into the valid [0, 2^zoom) range", () => {
    expect(wrapTileX(-1, 2)).toBe(3);
    expect(wrapTileX(4, 2)).toBe(0);
    expect(wrapTileX(5, 2)).toBe(1);
    expect(wrapTileX(2, 2)).toBe(2);
  });
});

describe("clampTileY", () => {
  it("clamps rows into the valid [0, 2^zoom) range", () => {
    expect(clampTileY(-1, 2)).toBe(0);
    expect(clampTileY(5, 2)).toBe(3);
    expect(clampTileY(2, 2)).toBe(2);
  });
});
