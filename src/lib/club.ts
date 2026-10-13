import { supabase } from "./supabase";
import { navigate } from "./router";
import { load, save } from "./storage";

export type PollBook = { title: string; author: string; imageUrl: string };

/** Creates a ranked-choice vote and opens it. Throws a readable message on failure. */
export async function createVote(title: string, books: PollBook[]) {
  if (!supabase) throw new Error("Book club voting isn't set up on this site yet.");
  if (books.length < 2 || books.length > 12) throw new Error("Pick between 2 and 12 books for a vote.");
  const { data, error } = await supabase.rpc("create_poll", {
    p_title: title.trim() || "Book club vote",
    // Only https covers are stored with a vote.
    p_options: books.map((b) => ({ title: b.title, author: b.author, image_url: b.imageUrl.startsWith("https://") ? b.imageUrl : "" })),
  });
  if (error || typeof data !== "string" || !data) throw new Error("Couldn't create the vote. Check your connection and try again.");
  // Remember polls made on this device, so their creator gets a "Back to my shelf" link.
  save("my-polls", [...load<string[]>("my-polls", []), data as string].slice(-50));
  navigate(`/vote/${data as string}`);
}
