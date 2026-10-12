import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when the book club database isn't set up yet; the app hides the book club then. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

/** A random ID kept on this device so a person can vote once per poll (and change their vote). */
export function voterToken(): string {
  const k = "shelf-to-stacks:voter-token";
  try {
    let t = localStorage.getItem(k);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(k, t);
    }
    return t;
  } catch {
    return crypto.randomUUID();
  }
}
