import { useEffect, useState } from "react";
import { load, save } from "../lib/storage";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

// Android/Chrome: a real "Install app" button using the browser's own install prompt.
// iPhone/iPad: Safari has no install prompt, so we show a one-time how-to.
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || load("install-dismissed", false)) return;
    const on = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    if (isIosSafari()) setShowIos(true);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  const dismiss = () => {
    save("install-dismissed", true);
    setEvent(null);
    setShowIos(false);
  };

  if (!event && !showIos) return null;
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
        <img src="/apple-touch-icon.png" alt="" className="h-10 w-10 rounded-md" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          {event ? (
            "Add Shelf to Stacks to your home screen for one-tap access."
          ) : (
            <>
              Add to your home screen: tap <ShareIcon /> <b>Share</b>, then <b>Add to Home Screen</b>.
            </>
          )}
        </p>
        {event && (
          <button
            type="button"
            className="min-h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            onClick={async () => {
              await event.prompt();
              await event.userChoice.catch(() => undefined);
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
