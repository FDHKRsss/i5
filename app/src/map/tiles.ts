/** One point in the OpenStreetMap slippy-map tile grid. */
export interface TilePoint {
  /** Integer tile column. */
  x: number;
  /** Integer tile row. */
  y: number;
  /** Fractional position of the point within the tile column (0..1). */
  fracX: number;
  /** Fractional position of the point within the tile row (0..1). */
  fracY: number;
}

/** Web-Mercator latitude limit; beyond this the tan() formula is unbounded. */
const MAX_MERCATOR_LAT = 85.05112878;

/**
 * Convert a WGS84 coordinate to the OSM slippy-map tile that contains it,
 * plus the fractional offset inside that tile.
 */
export function tileCoords(lat: number, lon: number, zoom: number): TilePoint {
  const z = Math.max(0, Math.floor(zoom));
  const n = 2 ** z;
  const clampedLat = Math.min(
    MAX_MERCATOR_LAT,
    Math.max(-MAX_MERCATOR_LAT, lat)
  );
  const xtile = ((lon + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const ytile =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const x = Math.floor(xtile);
  const y = Math.floor(ytile);
  return { x, y, fracX: xtile - x, fracY: ytile - y };
}

/** Wrap a tile column into the valid [0, 2^zoom) range (the world repeats). */
export function wrapTileX(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

/** Clamp a tile row into the valid [0, 2^zoom) range. */
export function clampTileY(y: number, zoom: number): number {
  const n = 2 ** zoom;
  return Math.min(Math.max(0, y), n - 1);
}
