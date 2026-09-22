export interface GpsPosition {
  lat: number;
  lon: number;
  /** Estimated accuracy in metres, or null when the source does not report it. */
  accuracy: number | null;
}

export type GeolocationErrorCode =
  | "unsupported"
  | "permission-denied"
  | "position-unavailable"
  | "timeout"
  | "unknown";

export class GeolocationError extends Error {
  readonly code: GeolocationErrorCode;

  constructor(code: GeolocationErrorCode, message: string) {
    super(message);
    this.name = "GeolocationError";
    this.code = code;
  }
}

const MESSAGES: Record<GeolocationErrorCode, string> = {
  unsupported: "Geolokalizacja jest niedostępna w tej przeglądarce.",
  "permission-denied": "Odmówiono dostępu do lokalizacji.",
  "position-unavailable": "Nie udało się ustalić pozycji.",
  timeout: "Przekroczono czas oczekiwania na lokalizację.",
  unknown: "Nie udało się pobrać lokalizacji.",
};

function codeFromBrowserError(code: number | undefined): GeolocationErrorCode {
  switch (code) {
    case 1:
      return "permission-denied";
    case 2:
      return "position-unavailable";
    case 3:
      return "timeout";
    default:
      return "unknown";
  }
}

/**
 * Request the device position via the real `navigator.geolocation` API.
 *
 * Uses high accuracy and a 10 s timeout. Rejects with a typed
 * `GeolocationError` so the caller can distinguish permission-denied from
 * timeout/unsupported and offer the manual-entry fallback (no silent fake
 * location).
 */
export function getCurrentPosition(): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    const geolocation = navigator.geolocation;
    if (!geolocation || typeof geolocation.getCurrentPosition !== "function") {
      reject(new GeolocationError("unsupported", MESSAGES.unsupported));
      return;
    }

    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : null,
        }),
      (error) =>
        reject(
          new GeolocationError(
            codeFromBrowserError(error.code),
            error.message || MESSAGES.unknown
          )
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/** Parse manual lat/lon text into a valid position, or null when invalid. */
export function parsePosition(
  latText: string,
  lonText: string
): GpsPosition | null {
  const lat = Number.parseFloat(latText);
  const lon = Number.parseFloat(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon, accuracy: null };
}
