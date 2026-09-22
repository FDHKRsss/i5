import "./app.css";
import { useEffect, useState } from "react";
import { Home } from "./pages/Home.tsx";
import { NewReport } from "./pages/NewReport.tsx";
import { Reports } from "./pages/Reports.tsx";

type Route = "home" | "new" | "reports";

function normalize(hash: string): Route {
  if (hash === "#/new") {
    return "new";
  }
  if (hash === "#/reports") {
    return "reports";
  }
  return "home";
}

/**
 * Minimal hash router: `#/` → Home, `#/new` → report wizard, `#/reports` →
 * reports list. Any other hash falls back to Home.
 */
function useHashRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return normalize(hash);
}

export function App() {
  const route = useHashRoute();

  if (route === "new") {
    return <NewReport />;
  }
  if (route === "reports") {
    return <Reports />;
  }
  return <Home />;
}
