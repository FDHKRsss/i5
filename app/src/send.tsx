/**
 * Multipart submission to the report API (M12 -- real).
 *
 * The review step builds a `ReportPayload` from the wizard state and sends it
 * as `multipart/form-data` to `POST /api/report`. The contract follows the M14
 * backend: `image` (required), `thumbnail` (optional), `lat` / `lon`
 * (optional, finite), and `description` (optional). Audio (`voice`) has been
 * removed from the flow, so it is no longer part of the payload.
 *
 * `sendReport` returns a typed result instead of throwing, so the review step
 * can distinguish a successful submit from a network failure / 4xx / 5xx and
 * surface a short, non-leaky error message.
 */

export interface ReportPayload {
  /** The compressed, canvas-downscaled full photo (required). */
  image: Blob;
  /** The small thumbnail, when available (optional). */
  thumbnail: Blob | null;
  /** Captured latitude, or null when no position was captured. */
  lat: number | null;
  /** Captured longitude, or null when no position was captured. */
  lon: number | null;
  /** The (already validated non-empty) description. */
  description: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; status: number | null; message: string };

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * POST the report to the backend as multipart form data.
 *
 * `image` is always appended (the wizard gates the flow on a captured photo);
 * `thumbnail`, coordinates and the description are appended only when present.
 * On a non-OK response the status is reported; on a network failure the status
 * is `null`.
 */
export async function sendReport(payload: ReportPayload): Promise<SubmitResult> {
  const formData = new FormData();
  formData.append("image", payload.image, "image.jpg");
  if (payload.thumbnail) {
    formData.append("thumbnail", payload.thumbnail, "thumbnail.jpg");
  }
  if (isFiniteNumber(payload.lat) && isFiniteNumber(payload.lon)) {
    formData.append("lat", String(payload.lat));
    formData.append("lon", String(payload.lon));
  }
  formData.append("description", payload.description);

  let response: Response;
  try {
    response = await fetch("/api/report", {
      method: "POST",
      body: formData,
    });
  } catch {
    return {
      ok: false,
      status: null,
      message: "Nie udało się wysłać zgłoszenia. Sprawdź połączenie.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        response.status >= 500
          ? "Serwer nie zapisał zgłoszenia. Spróbuj ponownie."
          : "Nie udało się zapisać zgłoszenia. Popraw dane i spróbuj ponownie.",
    };
  }

  return { ok: true };
}
