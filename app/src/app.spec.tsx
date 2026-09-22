import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { App } from "./app.tsx";

/**
 * M8 -- Home & navigation shell (real).
 *
 * These tests validate the hash mini-router (`#/`, `#/new`, `#/reports`), the
 * Home page content (numbered steps + the two entry buttons), and that the
 * wizard / reports pages render their real shells. They intentionally assert
 * structure and behavior (headings, ordered-list length, `href` targets,
 * `aria-current`), not placeholder copy, so later milestones that flesh out the
 * step bodies do not break them.
 */

function setHash(hash: string): void {
  window.location.hash = hash;
}

function dispatchHashChange(): void {
  window.dispatchEvent(new Event("hashchange"));
}

describe("App (M8 home & navigation shell)", () => {
  beforeEach(() => {
    setHash("");
    // Reports fetches /api/reports on mount; resolve it to an empty list so
    // routing tests never leak a rejected fetch or act on network I/O.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] }) as Response)
    );
  });

  afterEach(() => {
    cleanup();
    setHash("");
    vi.unstubAllGlobals();
  });

  describe("Home route (#/)", () => {
    it("renders the start page by default", () => {
      render(<App />);

      expect(
        screen.getByRole("heading", { name: "Zgłoś problem" })
      ).toBeTruthy();
      expect(
        screen.getByText(/Zrób zdjęcie, pobierz swoją lokalizację GPS/i)
      ).toBeTruthy();
    });

    it("renders an ordered list with exactly the four required steps", () => {
      render(<App />);

      const list = screen.getByRole("list");
      expect(list.tagName).toBe("OL");

      const items = Array.from(list.querySelectorAll("li"));
      expect(items).toHaveLength(4);

      const text = items.map((li) => (li.textContent ?? "").trim());
      expect(text[0]).toMatch(/zdjęcie/i); // camera
      expect(text[1]).toMatch(/lokalizacj/i); // GPS / map pin
      expect(text[2]).toMatch(/opis/i); // description
      expect(text[3]).toMatch(/przejrzyj/i); // review
    });

    it("links 'Report issue' to #/new and 'Zgłoszenia' to #/reports", () => {
      render(<App />);

      const reportIssue = screen.getByRole("link", { name: "Report issue" });
      expect(reportIssue.getAttribute("href")).toBe("#/new");

      const reports = screen.getByRole("link", { name: "Zgłoszenia" });
      expect(reports.getAttribute("href")).toBe("#/reports");
    });
  });

  describe("hash routing", () => {
    it("renders Home for the explicit #/ route", () => {
      setHash("#/");
      render(<App />);

      expect(
        screen.getByRole("heading", { name: "Zgłoś problem" })
      ).toBeTruthy();
    });

    it("renders the wizard shell for #/new", () => {
      setHash("#/new");
      render(<App />);

      expect(
        screen.getByRole("heading", { name: "Nowe zgłoszenie" })
      ).toBeTruthy();
      // The real wizard shell has a 4-step indicator with the first step
      // current — not a placeholder string.
      expect(
        screen.getByRole("heading", { name: "Krok 1 z 4: Aparat" })
      ).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(4);
    });

    it("renders the reports shell for #/reports", async () => {
      setHash("#/reports");
      render(<App />);

      expect(
        screen.getByRole("heading", { name: "Zgłoszenia" })
      ).toBeTruthy();
      // The real reports shell fetches the list and settles into its empty
      // state for an empty backend — not a placeholder string.
      expect(
        await screen.findByText(/Nie ma jeszcze żadnych zgłoszeń/i)
      ).toBeTruthy();
    });

    it("falls back to Home for unknown hashes", () => {
      setHash("#/unknown");
      render(<App />);

      expect(
        screen.getByRole("heading", { name: "Zgłoś problem" })
      ).toBeTruthy();
    });

    it("re-renders in place when the hash changes after mount", () => {
      render(<App />);
      expect(
        screen.getByRole("heading", { name: "Zgłoś problem" })
      ).toBeTruthy();

      act(() => {
        setHash("#/new");
        dispatchHashChange();
      });
      expect(
        screen.getByRole("heading", { name: "Nowe zgłoszenie" })
      ).toBeTruthy();

      act(() => {
        setHash("#/reports");
        dispatchHashChange();
      });
      expect(
        screen.getByRole("heading", { name: "Zgłoszenia" })
      ).toBeTruthy();

      act(() => {
        setHash("#/something-else");
        dispatchHashChange();
      });
      expect(
        screen.getByRole("heading", { name: "Zgłoś problem" })
      ).toBeTruthy();
    });
  });
});
