import { useEffect, useState, type ReactNode } from "react";
import { load, save } from "../lib/storage";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type Platform = "ios-safari" | "ios-other" | "android" | "desktop";
function platform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

// The browser's install prompt (Android / desktop Chrome and Edge) can only be used once it fires,
// so it's kept here for both the banner and the "Add to home screen" links.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    save("install-dismissed", true);
    listeners.forEach((l) => l());
  });
}
const OPEN_HELP = "shelf-to-stacks:install-help";

function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canPrompt: !!deferred,
    installed: isStandalone(),
    install: async () => {
      if (deferred) {
        const ev = deferred;
        await ev.prompt();
        await ev.userChoice.catch(() => undefined);
        deferred = null;
        listeners.forEach((l) => l());
      } else {
        window.dispatchEvent(new Event(OPEN_HELP));
      }
    },
  };
}

/** "Add to home screen" link. Hidden once the app is installed and opened from the home screen. */
export function InstallLink({ className, children }: { className?: string; children?: ReactNode }) {
  const { installed, install } = useInstall();
  if (installed) return null;
  return (
    <button type="button" onClick={install} className={className}>
      {children ?? "Add to home screen"}
    </button>
  );
}

/** Step-by-step instructions for browsers that have no install button of their own (iPhone Safari, etc.). */
export function InstallHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_HELP, on);
    return () => window.removeEventListener(OPEN_HELP, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;
  const p = platform();
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onClick={(e) => e.stopPropagation()}
        className="safe-bottom w-full max-w-md rounded-t-xl border border-border bg-card p-5 shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start gap-3">
          <img src="/apple-touch-icon.png" alt="" className="h-12 w-12 rounded-lg" />
          <div className="min-w-0 flex-1">
            <h2 id="install-title" className="font-display text-xl">
              Add Shelf to Stacks to your home screen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">It opens full screen like an app and remembers your shelf.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="h-10 w-10 shrink-0 rounded-md text-muted-foreground hover:bg-muted">
            ×
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {p === "ios-safari" && (
            <>
              <li>
                Tap the <ShareIcon /> <b>Share</b> button in Safari's toolbar.
              </li>
              <li>
                Scroll down and tap <b>Add to Home Screen</b>.
              </li>
              <li>
                Tap <b>Add</b>.
              </li>
            </>
          )}
          {p === "ios-other" && (
            <>
              <li>
                Tap the <ShareIcon /> <b>Share</b> button (in Chrome it's at the top right of the address bar).
              </li>
              <li>
                Tap <b>Add to Home Screen</b>. If you don't see it, open this page in <b>Safari</b> and use its Share button.
              </li>
            </>
          )}
          {p === "android" && (
            <>
              <li>
                Tap the <b>⋮</b> menu at the top right of Chrome.
              </li>
              <li>
                Tap <b>Install app</b> or <b>Add to Home screen</b>.
              </li>
            </>
          )}
          {p === "desktop" && (
            <>
              <li>
                In Chrome or Edge, click the install icon at the right end of the address bar, or open the browser menu and
                choose <b>Install Shelf to Stacks</b>.
              </li>
              <li>
                In Safari on a Mac, choose <b>File → Add to Dock</b>.
              </li>
            </>
          )}
        </ol>
        <button type="button" onClick={() => setOpen(false)} className="mt-5 min-h-11 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground">
          Got it
        </button>
      </div>
    </div>
  );
}

// Banner shown once on phones that aren't using the installed app yet.
export function InstallPrompt() {
  const { canPrompt, installed, install } = useInstall();
  const [dismissed, setDismissed] = useState(() => load("install-dismissed", false));
  const p = platform();
  const show = !installed && !dismissed && (canPrompt || p === "ios-safari");

  const dismiss = () => {
    save("install-dismissed", true);
    setDismissed(true);
  };

  if (!show) return null;
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 px-3 pb-3 md:bottom-0">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
        <img src="/apple-touch-icon.png" alt="" className="h-10 w-10 rounded-md" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          {canPrompt ? (
            "Add Shelf to Stacks to your home screen for one-tap access."
          ) : (
            <>
              Add to your home screen: tap <ShareIcon /> <b>Share</b>, then <b>Add to Home Screen</b>.
            </>
          )}
        </p>
        {canPrompt && (
          <button
            type="button"
            className="min-h-10 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
            onClick={async () => {
              await install();
              dismiss();
            }}
          >
            Install
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="h-10 w-10 shrink-0 rounded-md text-muted-foreground hover:bg-muted">
          ×
        </button>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-label="Share" className="inline -mt-1 fill-none stroke-current" strokeWidth="2">
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
      You're offline. Showing your last saved results.
    </div>
  );
}
