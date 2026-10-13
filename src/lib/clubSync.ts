import { useCallback, useEffect, useRef, useState } from "react";
import { mergeClubs, sameClubs, type SyncedClub } from "../../shared/clubMerge";
import { load, remove, save } from "./storage";
import { supabase } from "./supabase";

// Keeps saved book clubs in step across devices using a private sync code (see
// supabase/migrations/003_club_sync.sql). Every change is saved a moment after it's made;
// the newest copy is loaded when the page opens and whenever the app comes back to the front.

const KEY = "club-sync";
const PUSH_DELAY_MS = 1200;

type Saved = { code: string; version: number };
export type SyncStatus = "off" | "saving" | "synced" | "offline" | "error";

export function formatCode(code: string) {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}

async function getRemote(code: string) {
  const { data, error } = await supabase!.rpc("sync_get", { p_code: code });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { clubs: (row.data?.clubs ?? []) as SyncedClub[], version: Number(row.version) };
}

export function useClubSync<C extends SyncedClub>(clubs: C[], setClubs: (c: C[]) => void) {
  const [saved, setSaved] = useState<Saved | null>(() => load<Saved | null>(KEY, null));
  const [status, setStatus] = useState<SyncStatus>(() => (load<Saved | null>(KEY, null) ? "synced" : "off"));
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(!saved);
  const lastSynced = useRef<string>("");
  const clubsRef = useRef(clubs);
  clubsRef.current = clubs;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const available = !!supabase;

  const keep = (s: Saved | null) => {
    setSaved(s);
    if (s) save(KEY, s);
    else remove(KEY);
  };

  // Use the synced copy as-is (no save back, since it already matches the server).
  const adopt = useCallback(
    (remoteClubs: C[], version: number, code: string) => {
      lastSynced.current = JSON.stringify(remoteClubs);
      if (!sameClubs(remoteClubs, clubsRef.current)) setClubs(remoteClubs);
      keep({ code, version });
    },
    [setClubs],
  );

  const pull = useCallback(async () => {
    const s = savedRef.current;
    if (!available || !s) return;
    if (!navigator.onLine) return setStatus("offline");
    try {
      const remote = await getRemote(s.code);
      if (!remote) {
        setStatus("error");
        setMessage("That sync code no longer exists. Turn sync on again to get a new one.");
        return;
      }
      // Only take the server copy when it's newer and nothing here is waiting to be saved.
      const unsaved = JSON.stringify(clubsRef.current) !== lastSynced.current && lastSynced.current !== "";
      if (remote.version > s.version && !unsaved) adopt(remote.clubs as C[], remote.version, s.code);
      else if (lastSynced.current === "") lastSynced.current = JSON.stringify(clubsRef.current);
      setStatus("synced");
      setMessage(null);
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      setReady(true);
    }
  }, [adopt, available]);

  // Load the newest copy when the page opens and when the app comes back to the front.
  useEffect(() => {
    void pull();
    const onVisible = () => document.visibilityState === "visible" && pull();
    const onOnline = () => pull();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [pull]);

  // Save changes a moment after they're made.
  useEffect(() => {
    const s = savedRef.current;
    if (!available || !s || !ready) return;
    const snapshot = JSON.stringify(clubs);
    if (snapshot === lastSynced.current) return;
    setStatus("saving");
    const t = setTimeout(async () => {
      if (!navigator.onLine) return setStatus("offline");
      try {
        let version = s.version;
        let data = clubsRef.current;
        let res = await supabase!.rpc("sync_put", { p_code: s.code, p_data: { clubs: data }, p_version: version });
        if (res.error?.message.includes("conflict")) {
          // Another device saved first: combine both copies, then save the combination.
          const remote = await getRemote(s.code);
          if (remote) {
            data = mergeClubs(clubsRef.current, remote.clubs as C[]);
            version = remote.version;
            if (!sameClubs(data, clubsRef.current)) setClubs(data);
            res = await supabase!.rpc("sync_put", { p_code: s.code, p_data: { clubs: data }, p_version: version });
          }
        }
        if (res.error) {
          setStatus("error");
          setMessage(
            res.error.message.includes("too_large")
              ? "Your clubs are too large to sync. Remove some members with very long uploaded lists."
              : res.error.message.includes("not_found")
                ? "That sync code no longer exists. Turn sync on again to get a new one."
                : "Couldn't save to sync. We'll try again on your next change.",
          );
          return;
        }
        lastSynced.current = JSON.stringify(data);
        keep({ code: s.code, version: Number(res.data) });
        setStatus("synced");
        setMessage(null);
      } catch {
        setStatus(navigator.onLine ? "error" : "offline");
      }
    }, PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [clubs, ready, available, setClubs]);

  /** Start syncing this device's clubs; returns the new code. */
  const enable = useCallback(async () => {
    if (!available) throw new Error("Sync isn't set up on this site yet.");
    const { data, error } = await supabase!.rpc("sync_create", { p_data: { clubs: clubsRef.current } });
    if (error || typeof data !== "string") {
      throw new Error(
        error?.message.includes("sync_create") || error?.message.includes("function")
          ? "Sync isn't switched on for this site yet. The site owner needs to run the sync setup in Supabase."
          : "Couldn't turn on sync. Check your connection and try again.",
      );
    }
    lastSynced.current = JSON.stringify(clubsRef.current);
    keep({ code: data, version: 1 });
    setStatus("synced");
    setMessage(null);
    setReady(true);
    return data;
  }, [available]);

  /** Join an existing sync code (from another device). Clubs on both sides are combined. */
  const link = useCallback(
    async (code: string) => {
      if (!available) throw new Error("Sync isn't set up on this site yet.");
      const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (clean.length !== 16) throw new Error("Sync codes are 16 letters and numbers, like K7QM-4XTR-9PWD-HF2C.");
      const remote = await getRemote(clean).catch(() => {
        throw new Error("Couldn't reach sync. Check your connection and try again.");
      });
      if (!remote) throw new Error("We couldn't find that sync code. Check it and try again.");
      const merged = mergeClubs(clubsRef.current, remote.clubs as C[]);
      // Mark the server copy as the baseline; if merging added anything, it gets saved back.
      lastSynced.current = JSON.stringify(remote.clubs);
      keep({ code: clean, version: remote.version });
      setClubs(merged);
      setStatus("synced");
      setMessage(null);
      setReady(true);
    },
    [available, setClubs],
  );

  /** Stop syncing on this device. The clubs stay here, and the code keeps working elsewhere. */
  const disable = useCallback(() => {
    keep(null);
    lastSynced.current = "";
    setStatus("off");
    setMessage(null);
  }, []);

  return { available, code: saved?.code ?? null, status, message, enable, link, disable };
}
