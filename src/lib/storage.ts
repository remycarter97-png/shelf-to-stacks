// Small wrappers around localStorage. Every call is wrapped in try/catch because
// storage can be unavailable (private browsing, blocked site data) and the app
// must still work without it.

const PREFIX = "shelf-to-stacks:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app keeps working, it just won't remember.
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Ask the browser not to clear our saved data (helps on iOS). */
export function requestPersistentStorage() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* ignore */
  }
}
