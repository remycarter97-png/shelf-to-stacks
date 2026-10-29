import { useState, type ReactNode } from "react";
import { platform } from "./InstallPrompt";
import { OutLink, cx } from "./ui";

const EXPORT_PAGE = "https://www.goodreads.com/review/import";

type Device = "computer" | "iphone" | "android";

function guessDevice(): Device {
  const p = platform();
  return p === "android" ? "android" : p.startsWith("ios") ? "iphone" : "computer";
}

/** Step-by-step help for getting a Goodreads export file, for computers, iPhones and Android phones. */
export function ExportGuide({ defaultOpen = false, installed = false }: { defaultOpen?: boolean; installed?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [device, setDevice] = useState<Device>(guessDevice);

  return (
    <div className="mt-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="py-1 text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        How do I get my Goodreads export? (about 2 minutes)
      </button>
      {open && (
        <div className="mt-2 rounded-[1.2rem] border border-border/70 bg-card p-4 sm:p-5">
          <div role="tablist" aria-label="Your device" className="inline-flex rounded-full border border-border/70 bg-background p-1 text-xs font-bold">
            {(
              [
                ["computer", "Computer"],
                ["iphone", "iPhone or iPad"],
                ["android", "Android"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={device === id}
                onClick={() => setDevice(id)}
                className={cx("min-h-9 rounded-full px-3", device === id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>

          <ol className="mt-4 grid gap-3">
            <Step n={1} title="Open the Goodreads export page">
              <OutLink
                href={EXPORT_PAGE}
                className="btn-ledge mt-2 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                Open Goodreads export page ↗
              </OutLink>
              <p className="mt-2 text-muted-foreground">
                Sign in if Goodreads asks.{" "}
                {device === "computer"
                  ? "Any browser works."
                  : `Use ${device === "iphone" ? "Safari" : "Chrome"}, not the Goodreads app; the app can't export.`}
              </p>
            </Step>
            <Step n={2} title="Tap “Export Library”">
              <p className="text-muted-foreground">
                It's the button near the top of the page, under “Export”. Goodreads takes a few seconds (a minute for big
                libraries) to make the file.
              </p>
            </Step>
            <Step n={3} title="Download the file">
              <p className="text-muted-foreground">
                {device === "computer" &&
                  "A link like “Your export from (today's date)” appears under the button. Click it. The file, goodreads_library_export.csv, goes to your Downloads folder."}
                {device === "iphone" &&
                  "A link like “Your export from (today's date)” appears under the button. Tap it, then tap Download. If you see a page of text instead, tap the Share button and choose Save to Files."}
                {device === "android" &&
                  "A link like “Your export from (today's date)” appears under the button. Tap it, and Chrome saves goodreads_library_export.csv to Downloads."}{" "}
                If the link doesn't show up, refresh the page after a minute.
              </p>
            </Step>
            <Step n={4} title="Upload it here">
              <p className="text-muted-foreground">
                {device === "iphone"
                  ? "Come back to Shelf to Stacks, tap “Upload your export file”, then Browse → Downloads and choose goodreads_library_export.csv."
                  : "Come back to Shelf to Stacks, tap “Upload your export file” and choose goodreads_library_export.csv from Downloads."}
                {device === "android" &&
                  (installed
                    ? " Or, from the download notification or the Files app, tap Share and pick Shelf to Stacks."
                    : " If you add Shelf to Stacks to your home screen, you can also send the file to it straight from the Share menu.")}
              </p>
            </Step>
          </ol>
          <p className="mt-4 border-t border-border/60 pt-3 text-muted-foreground">
            We only read the books on your to-read shelf. The file stays on your device; only titles, authors and ISBNs are
            sent out to look books up at the library. Your list doesn't update by itself, so upload a new export when it
            changes.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-butter text-sm font-extrabold text-[#4a3728]" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="font-bold">{title}</p>
        {children}
      </div>
    </li>
  );
}
