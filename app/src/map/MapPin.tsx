import { clampTileY, tileCoords, wrapTileX } from "./tiles.ts";

interface MapPinProps {
  lat: number;
  lon: number;
  zoom?: number;
  /** Number of tiles per side of the (square) grid; odd, default 3. */
  tileSize?: number;
  className?: string;
}

/**
 * Self-contained map + pin derived only from a `{lat, lon}` coordinate.
 *
 * Renders an N×N grid of OpenStreetMap raster tiles around the tile containing
 * the coordinate and overlays a centered pin at the exact fractional offset
 * inside that tile. No map image is persisted — the same component renders the
 * location step, the review tile and every reports row from stored coordinates.
 */
export function MapPin({
  lat,
  lon,
  zoom = 16,
  tileSize = 3,
  className,
}: MapPinProps) {
  const point = tileCoords(lat, lon, zoom);
  const radius = Math.max(1, Math.floor(tileSize / 2));
  const side = radius * 2 + 1;

  const tiles: Array<{ key: string; x: number; y: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      tiles.push({
        key: `${dx}:${dy}`,
        x: wrapTileX(point.x + dx, zoom),
        y: clampTileY(point.y + dy, zoom),
      });
    }
  }

  // Position of the coordinate inside the grid: the center tile occupies the
  // middle cell, and fracX/fracY move the pin within that cell.
  const left = ((radius + point.fracX) / side) * 100;
  const top = ((radius + point.fracY) / side) * 100;

  return (
    <div
      className={className ? `map-pin ${className}` : "map-pin"}
      role="img"
      aria-label={`Mapa z pinezką: ${lat.toFixed(5)}, ${lon.toFixed(5)}`}
    >
      <div
        className="map-pin__grid"
        style={{
          gridTemplateColumns: `repeat(${side}, 1fr)`,
          gridTemplateRows: `repeat(${side}, 1fr)`,
        }}
      >
        {tiles.map((tile) => (
          <img
            key={tile.key}
            className="map-pin__tile"
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ))}
      </div>
      <span
        className="map-pin__pin"
        style={{ left: `${left}%`, top: `${top}%` }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="30" height="30" focusable="false">
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"
            fill="#dc2626"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      <span className="map-pin__attribution">© OpenStreetMap</span>
    </div>
  );
}
