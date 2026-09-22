import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NewReport } from "./NewReport.tsx";
import { DEFAULT_DESCRIPTION } from "../description.ts";

/**
 * M8 -- real wizard shell + M9 -- stub camera step + M10 -- real location step
 * + M11 -- real description step. The milestone ships the step indicator, the
 * back/next navigation, the camera step that gates progression until a
 * placeholder photo is captured, the location step that captures real GPS (or
 * a manual fallback) and gates progression until a position is held, and the
 * description step that offers an editable textarea plus a "Generate" default
 * and gates progression until the text is non-empty. These tests pin the
 * structure (4-step `<ol>`, `aria-current="step"` tracking), the navigation
 * behavior, and each step's capture/gating contract — not exact copy strings,
 * so later milestones can change the copy freely.
 */

afterEach(cleanup);
afterEach(() => {
  // Leave no geolocation stub behind for the next test: a stray success stub
  // would silently unlock the location gate in unrelated specs.
  Object.defineProperty(window.navigator, "geolocation", {
    value: undefined,
    configurable: true,
    writable: true,
  });
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

/** Capture a photo and advance from the camera step to the location step. */
function goToLocationStep(container: HTMLElement): void {
  capturePhoto(container);
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
}

/** Capture a photo, capture a position, and advance to the description step. */
async function goToDescriptionStep(container: HTMLElement): Promise<void> {
  goToLocationStep(container);
  await screen.findByText(/Lokalizacja zapisana/);
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
  expect(
    screen.getByRole("heading", { name: "Krok 3 z 4: Opis" })
  ).toBeTruthy();
}

type GeoSuccessCallback = (pos: {
  coords: { latitude: number; longitude: number; accuracy?: number };
}) => void;
type GeoErrorCallback = (err: { code?: number; message?: string }) => void;

interface GeolocationStub {
  getCurrentPosition?: (
    ok: GeoSuccessCallback,
    err: GeoErrorCallback,
    opts?: PositionOptions
  ) => void;
}

/** Stub the real `navigator.geolocation` used by the location step so the tests
 * run deterministically in jsdom (no device, no permission prompt). */
function stubGeolocation(impl?: GeolocationStub): void {
  Object.defineProperty(window.navigator, "geolocation", {
    value: impl,
    configurable: true,
    writable: true,
  });
}

/** A geolocation stub that immediately reports a fixed position. */
function stubGeolocationSuccess(
  coords: { latitude: number; longitude: number; accuracy?: number } = {
    latitude: 52.2297,
    longitude: 21.0122,
    accuracy: 12,
  }
): void {
  stubGeolocation({
    getCurrentPosition(ok) {
      ok({ coords });
    },
  });
}

describe("NewReport wizard shell", () => {
  it("renders the wizard heading and a 4-step ordered indicator", () => {
    render(<NewReport />);

    expect(
      screen.getByRole("heading", { name: "Nowe zgłoszenie" })
    ).toBeTruthy();

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");

    const steps = within(list).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(within(steps[0]).getByText("Aparat")).toBeTruthy();
    expect(within(steps[1]).getByText("Lokalizacja")).toBeTruthy();
    expect(within(steps[2]).getByText("Opis")).toBeTruthy();
    expect(within(steps[3]).getByText("Przegląd")).toBeTruthy();
  });

  it("marks only the first step as current and disables back on step 1", () => {
    render(<NewReport />);

    const steps = screen.getAllByRole("listitem");
    expect(steps[0].getAttribute("aria-current")).toBe("step");
    expect(steps[1].getAttribute("aria-current")).toBeNull();
    expect(steps[2].getAttribute("aria-current")).toBeNull();
    expect(steps[3].getAttribute("aria-current")).toBeNull();

    expect(
      screen.getByRole("button", { name: "Wstecz" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("advances through all four steps, moving aria-current and hiding next on the last step", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);

    expect(
      screen.getByRole("heading", { name: "Krok 1 z 4: Aparat" })
    ).toBeTruthy();

    // M9: the camera step gates progression until a photo is captured.
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
    capturePhoto(container);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 2 z 4: Lokalizacja" })
    ).toBeTruthy();

    let steps = screen.getAllByRole("listitem");
    expect(steps[1].getAttribute("aria-current")).toBe("step");
    expect(steps[0].getAttribute("aria-current")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Wstecz" }).hasAttribute("disabled")
    ).toBe(false);

    // M10: the location step gates progression until a position is captured.
    await screen.findByText(/Lokalizacja zapisana/);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 3 z 4: Opis" })
    ).toBeTruthy();

    // M11: the description step gates progression until a non-empty
    // description is present (generated or hand-written).
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 4 z 4: Przegląd" })
    ).toBeTruthy();

    steps = screen.getAllByRole("listitem");
    expect(steps[3].getAttribute("aria-current")).toBe("step");
    // On the final step there is no "next" button.
    expect(screen.queryByRole("button", { name: "Dalej" })).toBeNull();
  });

  it("moves back one step with 'Wstecz'", () => {
    const { container } = render(<NewReport />);

    capturePhoto(container);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 2 z 4: Lokalizacja" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(
      screen.getByRole("heading", { name: "Krok 1 z 4: Aparat" })
    ).toBeTruthy();
  });

  it("links 'Anuluj' back to the home route", () => {
    render(<NewReport />);

    expect(
      screen.getByRole("link", { name: "Anuluj" }).getAttribute("href")
    ).toBe("#/");
  });
});

describe("NewReport camera step (M9 -- stub)", () => {
  it("renders the mock viewfinder and gates 'Dalej'/'Zrób ponownie' until capture", () => {
    const { container } = render(<NewReport />);

    expect(container.querySelector("canvas")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Zrób ponownie" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("capturing swaps the viewfinder for a saved status and enables both actions", () => {
    const { container } = render(<NewReport />);

    capturePhoto(container);

    // The viewfinder is replaced by a success note, and the actions unlock.
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/zapisane/i);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Zrób ponownie" })
        .hasAttribute("disabled")
    ).toBe(false);
  });

  it("'Zrób ponownie' returns to the viewfinder and gates progression again", () => {
    const { container } = render(<NewReport />);

    capturePhoto(container);
    fireEvent.click(screen.getByRole("button", { name: "Zrób ponownie" }));

    expect(container.querySelector("canvas")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Zrób ponownie" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("keeps the captured photo when navigating back from a later step", () => {
    const { container } = render(<NewReport />);

    capturePhoto(container);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 2 z 4: Lokalizacja" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(
      screen.getByRole("heading", { name: "Krok 1 z 4: Aparat" })
    ).toBeTruthy();
    // The captured state survives the round-trip: still "saved", still able to
    // continue without re-taking the photo.
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/zapisane/i);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });
});

describe("NewReport location step (M10 -- real)", () => {
  it("captures real GPS and renders the two-column coordinates | map screen", async () => {
    stubGeolocationSuccess({
      latitude: 52.2297,
      longitude: 21.0122,
      accuracy: 12,
    });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    expect(
      screen.getByRole("heading", { name: "Krok 2 z 4: Lokalizacja" })
    ).toBeTruthy();

    await screen.findByText(/Lokalizacja zapisana/);

    // Two-column layout: left = coordinates/address/accuracy, right = map+pin.
    const columns = container.querySelector(".location-step__columns");
    expect(columns).not.toBeNull();
    expect(columns!.children).toHaveLength(2);

    const details = container.querySelector(".location-step__details");
    expect(details).not.toBeNull();
    expect(details!.textContent).toContain("52.22970");
    expect(details!.textContent).toContain("21.01220");
    expect(details!.textContent).toContain("12 m");
    // Reverse-geocoded address (deterministic mock provider).
    expect(details!.textContent).toContain(
      "mock location (52.22970, 21.01220)"
    );

    expect(container.querySelector(".map-pin")).not.toBeNull();
    expect(container.querySelector(".map-pin__pin")).not.toBeNull();

    // Captured position unlocks the gate and the re-capture action.
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Pobierz ponownie" })
        .hasAttribute("disabled")
    ).toBe(false);
  });

  it("renders 'nieznana' accuracy when the browser omits it", async () => {
    stubGeolocationSuccess({ latitude: 1, longitude: 2 });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Lokalizacja zapisana/);
    expect(
      container.querySelector(".location-step__details")!.textContent
    ).toContain("nieznana");
  });

  it("gates 'Dalej' and shows a typed error + retry when permission is denied", async () => {
    stubGeolocation({
      getCurrentPosition(_ok, err) {
        err({ code: 1, message: "denied" });
      },
    });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Nie udzielono zgody na dostęp do lokalizacji/);

    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Pobierz ponownie" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Spróbuj ponownie" })
    ).toBeTruthy();
  });

  it("completes via manual lat/lon entry when geolocation is denied", async () => {
    stubGeolocation({
      getCurrentPosition(_ok, err) {
        err({ code: 1 });
      },
    });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Nie udzielono zgody na dostęp do lokalizacji/);

    fireEvent.change(screen.getByPlaceholderText("np. 52.2297"), {
      target: { value: "52.2297" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. 21.0122"), {
      target: { value: "21.0122" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Użyj współrzędnych" }));

    await screen.findByText(/Lokalizacja zapisana/);
    expect(container.textContent).toContain(
      "Ręcznie podane: 52.22970, 21.01220"
    );
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("rejects invalid manual coordinates and keeps 'Dalej' gated", async () => {
    stubGeolocation({
      getCurrentPosition(_ok, err) {
        err({ code: 1 });
      },
    });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Nie udzielono zgody na dostęp do lokalizacji/);

    fireEvent.change(screen.getByPlaceholderText("np. 52.2297"), {
      target: { value: "91" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. 21.0122"), {
      target: { value: "21" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Użyj współrzędnych" }));

    await screen.findByText(/Podaj poprawne współrzędne/);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("'Spróbuj ponownie' re-runs the geolocation request after a failure", async () => {
    let calls = 0;
    stubGeolocation({
      getCurrentPosition(ok, err) {
        calls += 1;
        if (calls === 1) {
          err({ code: 2 });
        } else {
          ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } });
        }
      },
    });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Nie udało się ustalić pozycji/);
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await screen.findByText(/Lokalizacja zapisana/);
    expect(calls).toBe(2);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("'Pobierz ponownie' clears the saved position and re-runs geolocation", async () => {
    let calls = 0;
    stubGeolocation({
      getCurrentPosition(ok) {
        calls += 1;
        ok({ coords: { latitude: calls, longitude: 2 } });
      },
    });
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Lokalizacja zapisana/);
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Pobierz ponownie" }));

    // Clearing the position gates progression again while the new request runs.
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
    await screen.findByText(/Lokalizacja zapisana/);
    expect(calls).toBe(2);
  });

  it("keeps a captured position when navigating back from a later step", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);
    goToLocationStep(container);

    await screen.findByText(/Lokalizacja zapisana/);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 3 z 4: Opis" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    // The position survives the round-trip without re-requesting geolocation.
    expect(screen.getByText(/Lokalizacja zapisana/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });
});

describe("NewReport description step (M11 -- real)", () => {
  it("renders the textarea + 'Generate' button and gates 'Dalej' until non-empty", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);
    await goToDescriptionStep(container);

    const textarea = screen.getByRole("textbox", { name: "Opis zgłoszenia" });
    expect(textarea).toBeTruthy();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Generate" })).toBeTruthy();

    // An empty description keeps progression gated.
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("'Generate' fills the textarea with the default built from captured metadata", async () => {
    stubGeolocationSuccess({
      latitude: 52.2297,
      longitude: 21.0122,
      accuracy: 12,
    });
    const { container } = render(<NewReport />);
    await goToDescriptionStep(container);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const textarea = screen.getByRole("textbox", {
      name: "Opis zgłoszenia",
    }) as HTMLTextAreaElement;
    expect(textarea.value.startsWith(DEFAULT_DESCRIPTION)).toBe(true);
    // Photo + coordinates are annotated into the generated description.
    expect(textarea.value).toContain("The report is based on an incident photo.");
    expect(textarea.value).toContain(
      "Captured at coordinates 52.22970, 21.01220."
    );

    // A generated (non-empty) description unlocks the gate.
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("typing a description manually unblocks 'Dalej'", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);
    await goToDescriptionStep(container);

    const textarea = screen.getByRole("textbox", {
      name: "Opis zgłoszenia",
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Zepsuta latarnia" } });

    expect(textarea.value).toBe("Zepsuta latarnia");
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("keeps 'Dalej' gated for whitespace-only descriptions", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);
    await goToDescriptionStep(container);

    const textarea = screen.getByRole("textbox", {
      name: "Opis zgłoszenia",
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });

    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("keeps the description across back/forward navigation", async () => {
    stubGeolocationSuccess();
    const { container } = render(<NewReport />);
    await goToDescriptionStep(container);

    const textarea = screen.getByRole("textbox", {
      name: "Opis zgłoszenia",
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Moje zgłoszenie" } });

    // Back to the location step and forward again: the text survives.
    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(
      screen.getByRole("heading", { name: "Krok 2 z 4: Lokalizacja" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(
      screen.getByRole("heading", { name: "Krok 3 z 4: Opis" })
    ).toBeTruthy();

    const again = screen.getByRole("textbox", {
      name: "Opis zgłoszenia",
    }) as HTMLTextAreaElement;
    expect(again.value).toBe("Moje zgłoszenie");
    expect(
      screen.getByRole("button", { name: "Dalej" }).hasAttribute("disabled")
    ).toBe(false);
  });
});
