import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Reports } from "./Reports.tsx";

/**
 * M8 -- real reports shell + M13 -- real reports list.
 *
 * The shell tests drive the loading / error / empty states through a stubbed
 * `fetch`. The M13 tests pin the full list behavior: photo thumbnail (from
 * `thumbnailUrl`, falling back to `imageUrl`), map + pin (from lat/lon),
 * summary (description + coordinates + address + timestamp), newest-first
 * ordering by `created_at`, and graceful degradation against the older seed
 * backend rows (no `description` / `thumbnailUrl` / `imageUrl` / `created_at`).
 * Everything is deterministic and never touches the network.
 */

const mockFetch = vi.fn();

function jsonResponse<T>(data: T, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => data as unknown,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("Reports page shell", () => {
  it("shows a loading state while the list is being fetched", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<Reports />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/Ładowanie zgłoszeń/i)).toBeTruthy();

    resolveFetch(jsonResponse([]));
    await screen.findByText(/Nie ma jeszcze żadnych zgłoszeń/i);
  });

  it("shows an error state with a retry button when the response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(null, false));

    render(<Reports />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nie udało się pobrać zgłoszeń.");
    expect(
      screen.getByRole("button", { name: "Spróbuj ponownie" })
    ).toBeTruthy();
  });

  it("shows the error state when the fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    render(<Reports />);

    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Spróbuj ponownie" })
    ).toBeTruthy();
  });

  it("retries the fetch when 'Spróbuj ponownie' is clicked", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(null, false))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "r-1",
            description: "opis A",
            lat: null,
            lon: null,
            geo_desc: null,
          },
        ])
      );

    render(<Reports />);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await screen.findByText("opis A");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("shows an empty state linking to #/new when there are no reports", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<Reports />);

    await screen.findByText(/Nie ma jeszcze żadnych zgłoszeń/i);
    const link = screen.getByRole("link", { name: "Dodaj pierwsze zgłoszenie" });
    expect(link.getAttribute("href")).toBe("#/new");
  });

  it("renders each report as a list item and links back home", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "r-1",
          description: "opis A",
          lat: null,
          lon: null,
          geo_desc: null,
        },
        {
          id: "r-2",
          description: "opis B",
          lat: null,
          lon: null,
          geo_desc: null,
        },
      ])
    );

    render(<Reports />);

    await screen.findByText("opis A");
    expect(screen.getByText("opis B")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Wróć" }).getAttribute("href")
    ).toBe("#/");
  });
});

describe("Reports list (M13 -- real)", () => {
  it("renders the photo thumbnail from thumbnailUrl", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "r-1",
          description: "opis",
          lat: null,
          lon: null,
          geo_desc: null,
          thumbnailUrl: "/api/reports/r-1/thumbnail",
          imageUrl: "/api/reports/r-1/image",
        },
      ])
    );

    render(<Reports />);

    const img = await screen.findByAltText("Miniatura zdjęcia zgłoszenia");
    expect(img.getAttribute("src")).toBe("/api/reports/r-1/thumbnail");
  });

  it("falls back to imageUrl when thumbnailUrl is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "r-2",
          description: null,
          lat: null,
          lon: null,
          geo_desc: null,
          imageUrl: "/api/reports/r-2/image",
        },
      ])
    );

    render(<Reports />);

    const img = await screen.findByAltText("Miniatura zdjęcia zgłoszenia");
    expect(img.getAttribute("src")).toBe("/api/reports/r-2/image");
  });

  it("renders a map + pin, coordinates and address for a row with coordinates", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "r-3",
          description: "opis C",
          lat: 52.2297,
          lon: 21.0122,
          geo_desc: "Warszawa, ul. Testowa",
        },
      ])
    );

    const { container } = render(<Reports />);
    await screen.findByText("opis C");

    // No image URLs on this row → photo tile shows the missing notice.
    expect(screen.getByText("Brak zdjęcia")).toBeTruthy();
    // Coordinates → the map tile renders the real MapPin component.
    expect(
      container.querySelector(".reports__item-map .map-pin")
    ).not.toBeNull();
    // Summary: coordinates formatted to 5 decimals + reverse-geocoded address.
    expect(screen.getByText("52.22970, 21.01220")).toBeTruthy();
    expect(screen.getByText("Warszawa, ul. Testowa")).toBeTruthy();
  });

  it("shows a 'no location' notice and no map when coordinates are absent", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "r-4",
          description: "opis D",
          lat: null,
          lon: null,
          geo_desc: null,
        },
      ])
    );

    const { container } = render(<Reports />);
    await screen.findByText("opis D");

    expect(screen.getByText("Brak lokalizacji")).toBeTruthy();
    expect(container.querySelector(".map-pin")).toBeNull();
  });

  it("renders the timestamp in a <time> element when created_at is present", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "r-5",
          description: "opis E",
          lat: null,
          lon: null,
          geo_desc: null,
          created_at: "2026-09-20T12:00:00.000Z",
        },
      ])
    );

    const { container } = render(<Reports />);
    await screen.findByText("opis E");

    const time = container.querySelector(".reports__item-time");
    expect(time).not.toBeNull();
    expect(time!.getAttribute("datetime")).toBe("2026-09-20T12:00:00.000Z");
    expect((time!.textContent ?? "").trim()).not.toBe("");
  });

  it("sorts reports newest first by created_at", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "old",
          description: "stare",
          lat: null,
          lon: null,
          geo_desc: null,
          created_at: "2026-01-01T10:00:00.000Z",
        },
        {
          id: "new",
          description: "najnowsze",
          lat: null,
          lon: null,
          geo_desc: null,
          created_at: "2026-06-01T10:00:00.000Z",
        },
        {
          id: "mid",
          description: "srodkowe",
          lat: null,
          lon: null,
          geo_desc: null,
          created_at: "2026-03-01T10:00:00.000Z",
        },
      ])
    );

    render(<Reports />);
    await screen.findByText("najnowsze");

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("najnowsze");
    expect(items[1].textContent).toContain("srodkowe");
    expect(items[2].textContent).toContain("stare");
  });

  it("sinks rows without a parseable created_at to the bottom", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "undated",
          description: "bez daty",
          lat: null,
          lon: null,
          geo_desc: null,
        },
        {
          id: "dated",
          description: "z datą",
          lat: null,
          lon: null,
          geo_desc: null,
          created_at: "2026-06-01T10:00:00.000Z",
        },
      ])
    );

    render(<Reports />);
    await screen.findByText("z datą");

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("z datą");
    expect(items[1].textContent).toContain("bez daty");
  });

  it("degrades gracefully against the older seed backend row shape", async () => {
    // The seed backend returns `id` / `lat` / `lon` / `geo_desc` /
    // `audio_path` / `image_path` and strips `created_at`; it has no
    // `description`, `thumbnailUrl` or `imageUrl`. The page must render the
    // row without crashing, showing the missing-photo / missing-description
    // fallbacks while still rendering map + coordinates + address.
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "legacy-1",
          lat: 52.2297,
          lon: 21.0122,
          geo_desc: "mock location",
          audio_path: "uploads/legacy-1.webm",
          image_path: "uploads/legacy-1.png",
        },
      ])
    );

    const { container } = render(<Reports />);

    await screen.findByText("Brak zdjęcia");
    expect(screen.getByText("Brak opisu")).toBeTruthy();
    expect(
      container.querySelector(".reports__item-map .map-pin")
    ).not.toBeNull();
    expect(screen.getByText("52.22970, 21.01220")).toBeTruthy();
    expect(screen.getByText("mock location")).toBeTruthy();
    expect(container.querySelector(".reports__item-time")).toBeNull();
  });
});
