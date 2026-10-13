import { useEffect, useState } from "react";

// A handful of screens (home, book, club, vote), so a tiny router is enough.
export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

/** Opens a book's page, remembering where the reader was on the shelf so Back returns there. */
export function openBook(id: string) {
  try {
    // Only the shelf's position matters; hopping from book to book keeps the shelf spot.
    if (!window.location.pathname.startsWith("/book/")) sessionStorage.setItem("shelf-to-stacks:shelf-scroll", String(window.scrollY));
  } catch {
    /* ignore */
  }
  navigate(`/book/${encodeURIComponent(id)}`);
}

/** Scroll position saved by openBook, read once. */
export function takeShelfScroll(): number | null {
  try {
    const v = sessionStorage.getItem("shelf-to-stacks:shelf-scroll");
    sessionStorage.removeItem("shelf-to-stacks:shelf-scroll");
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}
