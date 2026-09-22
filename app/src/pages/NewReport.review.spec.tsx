import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NewReport } from "./NewReport.tsx";
import { DEFAULT_DESCRIPTION } from "../description.ts";

/**
 * M12 -- real review & submit step.
 *
 * The review step must render the three required side-by-side tiles — photo
 * thumbnail, map + pin thumbnail, and summary (description + coordinates +
 * address) — and submit the report as a multipart POST (`image`, `thumbnail`,
 * `lat`, `lon`, `description`) to `/api/report`. On success it redirects to
 * `#/reports`; on a 4xx/5xx or network failure it shows a short, non-leaky
 * error and lets the user retry. These tests pin structure/behavior (tile
 * labels, multipart body, hash target, alert) — not copy strings — so later
 * milestones can restyle freely.
 *
 * M12 is frontend-first against the M14 backend contract, so the submit path
 * is exercised with a mocked `fetch`, never a real backend.
 */

afterEach(cleanup);
afterEach(() => {
  Object.defineProperty(window.navigator, "geolocation", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.location.hash = "";
});

/** The camera step's mock viewfinder renders a single `<canvas>`; clicking it
 * captures a placeholder photo + thumbnail and gates navigation. */
function capturePhoto(container: HTMLElement): void {
  const canvas = container.querySelector("canvas");
  if (!canvas) {
    throw new Error("expected the mock camera <canvas> to be rendered");
  }
  fireEvent.click(canvas);
}

type GeoSuccessCallback = (pos: {
  coords: { latitude: number; longitude: number; accuracy?: number };
}) => void;

/** Stub the real `navigator.geolocation` with a fixed success position. */
function stubGeolocationSuccess(
  coords: { latitude: number; longitude: number; accuracy?: number } = {
    latitude: 52.2297,
    longitude: 21.0122,
    accuracy: 12,
  }
): void {
  Object.defineProperty(window.navigator, "geolocation", {
    value: {
      getCurrentPosition(ok: GeoSuccessCallback) {
        ok({ coords });
      },
    },
    configurable: true,
    writable: true,
  });
}

/** Capture a photo, GPS and a generated description, then reach the review
 * step (step 4 of 4). */
async function goToReviewStep(container: HTMLElement): Promise<void> {
  capturePhoto(container);
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
  await screen.findByText(/Lokalizacja zapisana/);
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
  expect(
    screen.getByRole("heading", { name: "Krok 4 z 4: Przegląd" })
  ).toBeTruthy();
}

function successFetchMock(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(
    async () => new Response("Report received successfully", { status: 200 })
  );
}

describe("NewReport review step (M12 -- real)", () => {
  it("renders three side-by-side tiles: photo, map and summary", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);
    await goToReviewStep(container);

    const tiles = container.querySelector(".review-step__tiles");
    expect(tiles).not.toBeNull();

    const sections = tiles!.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    expect(sections[0].getAttribute("aria-label")).toBe("Zdjęcie");
    expect(sections[1].getAttribute("aria-label")).toBe("Mapa");
    expect(sections[2].getAttribute("aria-label")).toBe("Podsumowanie");

    // Photo tile: the captured thumbnail is previewed as an <img> data URL.
    expect(
      within(sections[0] as HTMLElement).getByRole("heading", {
        name: "Zdjęcie",
      })
    ).toBeTruthy();
    expect(await screen.findByAltText("Zgłoszone zdjęcie")).toBeTruthy();

    // Map tile: a real MapPin derived from the captured coordinates.
    expect(
      within(sections[1] as HTMLElement).getByRole("heading", { name: "Mapa" })
    ).toBeTruthy();
    expect(
      (sections[1] as HTMLElement).querySelector(".map-pin")
    ).not.toBeNull();
    expect(
      (sections[1] as HTMLElement).querySelector(".map-pin__pin")
    ).not.toBeNull();

    // Summary tile: description + coordinates + reverse-geocoded address.
    const summary = sections[2] as HTMLElement;
    expect(
      within(summary).getByRole("heading", { name: "Podsumowanie" })
    ).toBeTruthy();
    expect(summary.textContent).toContain("incident picture");
    expect(summary.textContent).toContain("52.22970");
    expect(summary.textContent).toContain("21.01220");
    expect(summary.textContent).toContain("mock location");
  });

  it("submits the report as multipart and redirects to #/reports on success", async () => {
    stubGeolocationSuccess();
    const fetchMock = successFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<NewReport />);
    await goToReviewStep(container);

    fireEvent.click(screen.getByRole("button", { name: "Wyślij" }));

    await waitFor(() => expect(window.location.hash).toBe("#/reports"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/report");
    expect(init.method).toBe("POST");

    const body = init.body as FormData;
    expect(body.get("lat")).toBe("52.2297");
    expect(body.get("lon")).toBe("21.0122");

    const description = body.get("description");
    expect(typeof description).toBe("string");
    expect((description as string).startsWith(DEFAULT_DESCRIPTION)).toBe(true);

    expect((body.get("image") as File).name).toBe("image.jpg");
    expect((body.get("thumbnail") as File).name).toBe("thumbnail.jpg");
  });

  it("shows a short error and keeps the current route for a 4xx response", async () => {
    stubGeolocationSuccess();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("Bad request", { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<NewReport />);
    await goToReviewStep(container);

    fireEvent.click(screen.getByRole("button", { name: "Wyślij" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nie udało się zapisać zgłoszenia");
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct message for a 5xx response", async () => {
    stubGeolocationSuccess();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("boom", { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<NewReport />);
    await goToReviewStep(container);

    fireEvent.click(screen.getByRole("button", { name: "Wyślij" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Serwer nie zapisał zgłoszenia");
    expect(window.location.hash).toBe("");
  });

  it("shows a network-failure message and lets the user retry to success", async () => {
    stubGeolocationSuccess();
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("network down");
      }
      return new Response("Report received successfully", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<NewReport />);
    await goToReviewStep(container);

    fireEvent.click(screen.getByRole("button", { name: "Wyślij" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sprawdź połączenie");
    expect(window.location.hash).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(window.location.hash).toBe("#/reports"));
    expect(calls).toBe(2);
  });

  it("falls back to an unavailable notice when the photo cannot be previewed", async () => {
    stubGeolocationSuccess();
    vi.stubGlobal("FileReader", undefined);

    const { container } = render(<NewReport />);
    await goToReviewStep(container);

    expect(screen.getByText("Podgląd niedostępny")).toBeTruthy();
    expect(screen.queryByAltText("Zgłoszone zdjęcie")).toBeNull();
  });
});
