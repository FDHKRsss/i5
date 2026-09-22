import { useCallback, useEffect, useState } from "react";
import "../app.css";
import { MapPin } from "../map/MapPin.tsx";

/**
 * One report as returned by `GET /api/reports` (M14 backend contract).
 *
 * `created_at`, `thumbnailUrl` and `imageUrl` are part of the real contract;
 * they are optional here so the page keeps rendering (degrading gracefully)
 * against the older seed backend, whose rows lack them.
 */
type ReportSummary = {
  id: string;
  description: string | null;
  lat: number | null;
  lon: number | null;
  geo_desc: string | null;
  created_at?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
};

type ReportsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; reports: ReportSummary[] };

function hasCoordinates(
  report: ReportSummary
): report is ReportSummary & { lat: number; lon: number } {
  return (
    typeof report.lat === "number" &&
    Number.isFinite(report.lat) &&
    typeof report.lon === "number" &&
    Number.isFinite(report.lon)
  );
}

/** Newest first; rows without a parseable `created_at` fall to the bottom. */
function byNewestFirst(a: ReportSummary, b: ReportSummary): number {
  const atA = Date.parse(a.created_at ?? "");
  const atB = Date.parse(b.created_at ?? "");
  const validA = !Number.isNaN(atA);
  const validB = !Number.isNaN(atB);
  if (validA && validB) {
    return atB - atA;
  }
  if (validA) {
    return -1;
  }
  if (validB) {
    return 1;
  }
  return 0;
}

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Reports page (M13 -- real). Fetches `GET /api/reports` and renders the full
 * list — every report with its photo thumbnail, map + pin thumbnail,
 * description, coordinates and timestamp, newest first — plus loading / error /
 * empty states. The list targets the M14 backend contract (`thumbnailUrl` /
 * `imageUrl` / `created_at`), while still degrading gracefully against the
 * older seed backend rows that only carry `id` / `description` / `lat` / `lon`
 * / `geo_desc`.
 */
export function Reports() {
  const [state, setState] = useState<ReportsState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) {
        setState({ status: "error" });
        return;
      }
      const reports = (await res.json()) as ReportSummary[];
      setState({ status: "ready", reports: [...reports].sort(byNewestFirst) });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page reports">
      <header className="reports__header">
        <h1>Zgłoszenia</h1>
        <p className="reports__subtitle">
          Wszystkie zgłoszenia zapisane w bazie.
        </p>
      </header>

      {state.status === "loading" && (
        <p className="reports__state" role="status">
          Ładowanie zgłoszeń…
        </p>
      )}

      {state.status === "error" && (
        <div className="reports__state reports__state--error" role="alert">
          <p>Nie udało się pobrać zgłoszeń.</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void load()}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {state.status === "ready" && state.reports.length === 0 && (
        <div className="reports__state reports__state--empty">
          <p>Nie ma jeszcze żadnych zgłoszeń.</p>
          <a className="button button--primary" href="#/new">
            Dodaj pierwsze zgłoszenie
          </a>
        </div>
      )}

      {state.status === "ready" && state.reports.length > 0 && (
        <ul className="reports__list">
          {state.reports.map((report) => {
            const photoUrl = report.thumbnailUrl ?? report.imageUrl ?? null;
            const coords = hasCoordinates(report);
            const timestamp = formatTimestamp(report.created_at);
            const address = report.geo_desc?.trim() || null;

            return (
              <li key={report.id} className="reports__item">
                <div className="reports__item-tiles">
                  <section
                    className="reports__item-tile"
                    aria-label="Zdjęcie zgłoszenia"
                  >
                    <h3 className="reports__item-tile-title">Zdjęcie</h3>
                    {photoUrl ? (
                      <img
                        className="reports__item-thumb"
                        src={photoUrl}
                        alt="Miniatura zdjęcia zgłoszenia"
                      />
                    ) : (
                      <p className="reports__item-missing">Brak zdjęcia</p>
                    )}
                  </section>

                  <section
                    className="reports__item-tile reports__item-map"
                    aria-label="Mapa zgłoszenia"
                  >
                    <h3 className="reports__item-tile-title">Mapa</h3>
                    {coords ? (
                      <MapPin lat={report.lat} lon={report.lon} />
                    ) : (
                      <p className="reports__item-missing">Brak lokalizacji</p>
                    )}
                  </section>

                  <section
                    className="reports__item-summary"
                    aria-label="Podsumowanie zgłoszenia"
                  >
                    <p className="reports__item-description">
                      {report.description?.trim() || "Brak opisu"}
                    </p>
                    {coords && (
                      <p className="reports__item-coords">
                        {report.lat.toFixed(5)}, {report.lon.toFixed(5)}
                      </p>
                    )}
                    {address && (
                      <p className="reports__item-address">{address}</p>
                    )}
                    {timestamp && (
                      <time
                        className="reports__item-time"
                        dateTime={report.created_at ?? undefined}
                      >
                        {timestamp}
                      </time>
                    )}
                  </section>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <a className="button button--secondary" href="#/">
        Wróć
      </a>
    </main>
  );
}
