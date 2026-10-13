import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { buyLinks, kindleUnlimitedLink, libbyLink, type LibrarySystem } from "../lib/libraries";
import { OutLink } from "./ui";

// "More ways to read & buy": Libby (live where possible), Kindle Unlimited, and where to buy.
export function MoreWays({
  title,
  author,
  isbn,
  library,
}: {
  title: string;
  author: string;
  isbn?: string;
  library: LibrarySystem;
}) {
  const [open, setOpen] = useState(false);
  const libbyKey = library.libbyKey;
  const libby = useQuery({
    queryKey: ["libby", libbyKey, title, author],
    queryFn: () => api.libby(libbyKey!, title, author),
    enabled: open && !!libbyKey && navigator.onLine,
    staleTime: 15 * 60_000,
    retry: 1,
  });
  const link = "font-medium text-link underline-offset-2 hover:underline";

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-my-2 py-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {open ? "Hide ways to read & buy" : "More ways to read & buy"}
      </button>
      {open && (
        <div className="mt-3 grid gap-4 rounded-md border border-border/60 bg-muted/50 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Libby{libbyKey ? ` · ${library.short}` : ""}
            </p>
            {!libbyKey && (
              <p className="mb-1 leading-snug text-muted-foreground">
                Search OverDrive to see which libraries near you have it.
              </p>
            )}
            {libby.isLoading && <p className="text-muted-foreground">Checking Libby…</p>}
            {libby.data?.status === "ok" && libby.data.items.length === 0 && (
              <p className="text-muted-foreground">No ebook or audiobook found.</p>
            )}
            {libby.data?.status === "ok" &&
              libby.data.items.map((it, i) => (
                <p key={i} className="mb-1 leading-snug">
                  <span className="font-medium">{it.type === "audiobook" ? "Audiobook" : "eBook"}: </span>
                  {it.available ? (
                    <span className="text-success">
                      Available now ({it.availableCopies} of {it.ownedCopies})
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {it.holds} on hold{it.waitDays ? ` · about ${Math.max(1, Math.ceil(it.waitDays / 7))} wk wait` : ""}
                    </span>
                  )}
                </p>
              ))}
            {(libby.isError || libby.data?.status === "error") && (
              <p className="text-muted-foreground">Couldn't check live — open Libby to see.</p>
            )}
            <OutLink href={libby.data?.searchUrl ?? libbyLink(library, title, author)} className={link}>
              {libbyKey ? "Open in Libby →" : "Search OverDrive →"}
            </OutLink>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Kindle Unlimited</p>
            <p className="mb-1 leading-snug text-muted-foreground">
              Amazon doesn't share this publicly, so this opens a Kindle Unlimited search.
            </p>
            <OutLink href={kindleUnlimitedLink(title, author)} className={link}>
              Check Kindle Unlimited →
            </OutLink>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Where to buy</p>
            <ul className="space-y-1">
              {buyLinks(title, author, isbn).map((l) => (
                <li key={l.label}>
                  <OutLink href={l.href} className={link}>
                    {l.label} ↗
                  </OutLink>
                  {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
