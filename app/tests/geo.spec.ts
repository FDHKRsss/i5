// @vitest-environment node
import { describe, expect, it } from "vitest";
import { whatIsAtLocation } from "../server/geo.js";

describe("geo (mock provider)", () => {
  it("returns a deterministic mock description for the default Warsaw position", async () => {
    await expect(whatIsAtLocation({ lat: 52.2297, lon: 21.0122 })).resolves.toBe(
      "mock location (52.22970, 21.01220)"
    );
  });

  it("formats negative and zero-padded coordinates to five decimals", async () => {
    await expect(whatIsAtLocation({ lat: -33.8688, lon: 151.2093 })).resolves.toBe(
      "mock location (-33.86880, 151.20930)"
    );
  });

  it("handles integer-valued coordinates without crashing", async () => {
    await expect(whatIsAtLocation({ lat: 0, lon: 0 })).resolves.toBe(
      "mock location (0.00000, 0.00000)"
    );
  });
});
