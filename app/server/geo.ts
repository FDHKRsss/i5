export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Reverse-geocode a position.
 *
 * The default (and only) provider for the seed is a deterministic mock so the
 * backend never needs external network access. The module boundary is the swap
 * point for a real provider later (e.g. Nominatim) — see ARCHITECTURE.md.
 */
export async function whatIsAtLocation(location: LatLon): Promise<string> {
  return mockReverseGeocode(location);
}

function mockReverseGeocode({ lat, lon }: LatLon): string {
  return `mock location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
}
