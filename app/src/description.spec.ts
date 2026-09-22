import { describe, expect, it } from "vitest";
import { DEFAULT_DESCRIPTION, generateDescription } from "./description.ts";

/**
 * M11 -- real description generator. The module is a deterministic, pure
 * function: it always starts with the fixed default A.I.-style description and
 * appends short annotations for whatever captured metadata is present (photo,
 * coordinates, time), and returns exactly the default with no context. No
 * network or API key is involved, so the output is reproducible for a given
 * input — the exact behavior the "Generate" button depends on.
 */

describe("DEFAULT_DESCRIPTION", () => {
  it("is exactly the requested A.I.-style default", () => {
    expect(DEFAULT_DESCRIPTION).toBe(
      "test default description A.I. generated based on the incident picture"
    );
  });
});

describe("generateDescription", () => {
  it("returns exactly the default with no context", () => {
    expect(generateDescription()).toBe(DEFAULT_DESCRIPTION);
  });

  it("returns exactly the default for an empty context object", () => {
    expect(generateDescription({})).toBe(DEFAULT_DESCRIPTION);
  });

  it("always starts with the default description", () => {
    const result = generateDescription({
      hasImage: true,
      lat: 52.2297,
      lon: 21.0122,
      at: new Date("2026-09-22T12:00:00.000Z"),
    });
    expect(result.startsWith(DEFAULT_DESCRIPTION)).toBe(true);
  });

  it("annotates a captured photo", () => {
    expect(generateDescription({ hasImage: true })).toBe(
      `${DEFAULT_DESCRIPTION} The report is based on an incident photo.`
    );
  });

  it("does not annotate a photo when hasImage is false", () => {
    expect(generateDescription({ hasImage: false })).toBe(DEFAULT_DESCRIPTION);
  });

  it("annotates finite coordinates with 5-decimal formatting", () => {
    expect(generateDescription({ lat: 52.2297, lon: 21.0122 })).toBe(
      `${DEFAULT_DESCRIPTION} Captured at coordinates 52.22970, 21.01220.`
    );
  });

  it("requires both coordinates to be finite numbers", () => {
    // lat present but lon missing/undefined → no coordinate annotation.
    expect(generateDescription({ lat: 52.2297 })).toBe(DEFAULT_DESCRIPTION);
    // lon present but lat missing/undefined → no coordinate annotation.
    expect(generateDescription({ lon: 21.0122 })).toBe(DEFAULT_DESCRIPTION);
  });

  it("ignores NaN / Infinity coordinate values", () => {
    expect(generateDescription({ lat: Number.NaN, lon: 21.0122 })).toBe(
      DEFAULT_DESCRIPTION
    );
    expect(
      generateDescription({ lat: 52.2297, lon: Number.POSITIVE_INFINITY })
    ).toBe(DEFAULT_DESCRIPTION);
  });

  it("treats null coordinates as absent", () => {
    expect(generateDescription({ lat: null, lon: null })).toBe(
      DEFAULT_DESCRIPTION
    );
  });

  it("annotates a valid captured time with its ISO string", () => {
    const at = new Date("2026-09-22T12:00:00.000Z");
    expect(generateDescription({ at })).toBe(
      `${DEFAULT_DESCRIPTION} Reported at ${at.toISOString()}.`
    );
  });

  it("ignores an invalid date", () => {
    expect(generateDescription({ at: new Date("nonsense") })).toBe(
      DEFAULT_DESCRIPTION
    );
  });

  it("combines all present annotations in a stable order", () => {
    const at = new Date("2026-09-22T12:00:00.000Z");
    const result = generateDescription({
      hasImage: true,
      lat: 52.2297,
      lon: 21.0122,
      at,
    });
    expect(result).toBe(
      `${DEFAULT_DESCRIPTION} The report is based on an incident photo. ` +
        `Captured at coordinates 52.22970, 21.01220. Reported at ${at.toISOString()}.`
    );
  });

  it("is deterministic for identical inputs", () => {
    const context = { hasImage: true, lat: 1, lon: 2, at: new Date(0) };
    const first = generateDescription(context);
    const second = generateDescription(context);
    expect(first).toBe(second);
  });
});
