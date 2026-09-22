/**
 * Deterministic "A.I.-style" description generation (M11 -- real).
 *
 * The description step needs a "Generate" button that fills the textarea with
 * a default, A.I.-style description — the fixed
 * `"test default description A.I. generated based on the incident picture"`
 * the goal asked for — optionally annotated with the captured picture/location
 * metadata. There is deliberately no network call or API key: the generator is
 * a single pure function, so it is the one swap point for a real LLM later.
 */

export const DEFAULT_DESCRIPTION =
  "test default description A.I. generated based on the incident picture";

export interface DescriptionContext {
  /** Whether the wizard already holds a captured photo. */
  hasImage?: boolean;
  /** Captured latitude, or null/undefined when unavailable. */
  lat?: number | null;
  /** Captured longitude, or null/undefined when unavailable. */
  lon?: number | null;
  /** Captured time, or undefined when not supplied. */
  at?: Date;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Build a deterministic, A.I.-style description from the captured metadata.
 *
 * Always starts with `DEFAULT_DESCRIPTION` and appends short annotations for
 * whatever metadata is present (photo, coordinates, time), so the user gets a
 * richer default while the output stays reproducible for a given input. With no
 * context it returns exactly `DEFAULT_DESCRIPTION`.
 */
export function generateDescription(
  context: DescriptionContext = {}
): string {
  const annotations: string[] = [];

  if (context.hasImage) {
    annotations.push("The report is based on an incident photo.");
  }

  if (isFiniteNumber(context.lat) && isFiniteNumber(context.lon)) {
    annotations.push(
      `Captured at coordinates ${context.lat.toFixed(5)}, ${context.lon.toFixed(5)}.`
    );
  }

  if (context.at instanceof Date && !Number.isNaN(context.at.getTime())) {
    annotations.push(`Reported at ${context.at.toISOString()}.`);
  }

  if (annotations.length === 0) {
    return DEFAULT_DESCRIPTION;
  }

  return `${DEFAULT_DESCRIPTION} ${annotations.join(" ")}`;
}
