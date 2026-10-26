import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { Button, Input } from "./ui";

/** "Request a different library": saved to Supabase (library_requests) for the site owner to review. */
export function LibraryRequest({ onClose }: { onClose: () => void }) {
  const [library, setLibrary] = useState("");
  const [location, setLocation] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (library.trim().length < 2) {
      setState("error");
      setError("Enter the name of the library you'd like added.");
      return;
    }
    if (!supabase) {
      setState("error");
      setError("Library requests aren't switched on for this site yet.");
      return;
    }
    setState("sending");
    const { error: err } = await supabase.rpc("request_library", {
      p_library: library.trim(),
      p_location: location.trim() || null,
      p_contact: contact.trim() || null,
    });
    if (err) {
      setState("error");
      setError(
        /too many/i.test(err.message)
          ? err.message
          : navigator.onLine
            ? "Your request didn't go through. Try again in a moment."
            : "You're offline. Connect to the internet and send it again.",
      );
      return;
    }
    setState("sent");
  };

  if (state === "sent") {
    return (
      <div role="status" className="mt-4 max-w-2xl rounded-lg border border-border bg-card p-4 text-sm">
        <p className="font-semibold">Request sent for {library.trim()}.</p>
        <p className="mt-1 text-muted-foreground">
          Thanks! Requests help decide which library to add next.{contact.trim() ? " We'll get in touch if it's added." : ""}
        </p>
        <button type="button" onClick={onClose} className="mt-2 text-link underline underline-offset-2">
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 grid max-w-2xl gap-3 rounded-lg border border-border bg-card p-4 text-sm" aria-labelledby="lib-req-title">
      <div>
        <p id="lib-req-title" className="font-semibold">
          Request a different library
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Only Boston Public Library can be checked right now. Tell us where you borrow books and we'll look into adding it.
        </p>
      </div>
      <label className="grid gap-1">
        <span className="font-medium">Library name</span>
        <Input value={library} onChange={(e) => setLibrary(e.target.value)} placeholder="e.g. Cambridge Public Library" maxLength={120} className="h-11" required />
      </label>
      <label className="grid gap-1">
        <span className="font-medium">
          Town or city <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cambridge, MA" maxLength={120} className="h-11" />
      </label>
      <label className="grid gap-1">
        <span className="font-medium">
          Email, if you'd like to hear when it's added <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com"
          maxLength={200}
          autoCapitalize="off"
          spellCheck={false}
          className="h-11"
        />
      </label>
      {state === "error" && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send request"}
        </Button>
        <button type="button" onClick={onClose} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
