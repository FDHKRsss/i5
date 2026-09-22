import { afterEach, describe, expect, it, vi } from "vitest";
import { reverseGeocode } from "./geo.ts";

/**
 * M10 -- real reverse-geocode module. The default provider is a deterministic
 * mock (no network / no key); `VITE_GEO_PROVIDER=nominatim` opts into the real
 * OpenStreetMap Nominatim API and falls back to the mock on any failure, so the
 * flow still completes headless.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reverseGeocode (default mock provider)", () => {
  it("returns a deterministic mock address without touching the network", async () => {
    await expect(
      reverseGeocode({ lat: 52.2297, lon: 21.0122 })
    ).resolves.toBe("mock location (52.22970, 21.01220)");
  });
});

describe("reverseGeocode (nominatim provider)", () => {
  it("returns the trimmed display_name on success", async () => {
    vi.stubEnv("VITE_GEO_PROVIDER", "nominatim");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ display_name: "  Warszawa, Polska  " }),
      })
    );

    await expect(
      reverseGeocode({ lat: 52.2297, lon: 21.0122 })
    ).resolves.toBe("Warszawa, Polska");
  });

  it("returns 'Nieznana lokalizacja' when display_name is missing", async () => {
    vi.stubEnv("VITE_GEO_PROVIDER", "nominatim");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );

    await expect(reverseGeocode({ lat: 1, lon: 2 })).resolves.toBe(
      "Nieznana lokalizacja"
    );
  });

  it("falls back to the mock address on an HTTP error", async () => {
    vi.stubEnv("VITE_GEO_PROVIDER", "nominatim");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    await expect(
      reverseGeocode({ lat: 52.2297, lon: 21.0122 })
    ).resolves.toBe("mock location (52.22970, 21.01220)");
  });

  it("falls back to the mock address when fetch rejects", async () => {
    vi.stubEnv("VITE_GEO_PROVIDER", "nominatim");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    await expect(
      reverseGeocode({ lat: 52.2297, lon: 21.0122 })
    ).resolves.toBe("mock location (52.22970, 21.01220)");
  });
});
