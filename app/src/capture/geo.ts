export interface LatLon {
  lat: number;
  lon: number;
}

const NOMINATIM_TIMEOUT_MS = 6000;

/** Deterministic default: no network, used headless and for tests. */
function mockReverseGeocode({ lat, lon }: LatLon): string {
  return `mock location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
}

/** Opt-in Nominatim reverse geocoding (matches the protoplast's approach). */
async function nominatimReverseGeocode({ lat, lon }: LatLon): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: { "User-Agent": "i3-incident-report/1.0" },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(`Nominatim HTTP ${response.status}`);
    }
    const data = (await response.json()) as { display_name?: string };
    return data.display_name?.trim() || "Nieznana lokalizacja";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reverse-geocode a position into a human-readable address.
 *
 * The default provider is a deterministic mock (no network / no key). Set
 * `VITE_GEO_PROVIDER=nominatim` at build time to switch to the real
 * OpenStreetMap Nominatim API; on any failure it falls back to the mock so the
 * flow still completes.
 */
export async function reverseGeocode(pos: LatLon): Promise<string> {
  if (import.meta.env.VITE_GEO_PROVIDER === "nominatim") {
    try {
      return await nominatimReverseGeocode(pos);
    } catch {
      return mockReverseGeocode(pos);
    }
  }
  return mockReverseGeocode(pos);
}
