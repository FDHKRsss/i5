import "../app.css";

/**
 * Start page (Home). Shows a short description of the app, the numbered
 * report flow, and the two entry buttons: "Report issue" (start) and
 * "Zgłoszenia" (list of existing reports).
 */
export function Home() {
  return (
    <main className="home">
      <header className="home__header">
        <h1>Zgłoś problem</h1>
        <p className="home__intro">
          Zrób zdjęcie, pobierz swoją lokalizację GPS, dodaj opis i wyślij
          zgłoszenie — wszystko prosto z telefonu.
        </p>
      </header>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="home__section-title">
          Jak to działa
        </h2>
        <ol className="steps">
          <li>Zrób zdjęcie aparatem telefonu.</li>
          <li>Pobierz lokalizację GPS i zobacz ją na mapie z pinezką.</li>
          <li>Dodaj opis (albo wygeneruj go automatycznie).</li>
          <li>Przejrzyj zgłoszenie i wyślij.</li>
        </ol>
      </section>

      <nav className="home__actions" aria-label="Akcje">
        <a className="button button--primary" href="#/new">
          Report issue
        </a>
        <a className="button button--secondary" href="#/reports">
          Zgłoszenia
        </a>
      </nav>
    </main>
  );
}
