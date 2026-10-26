import { overLimit } from "../server/cache.js";
import { HttpError, clientIp, handle, json, readJson } from "../server/http.js";

// POST /api/contact  { name?, email, topic?, message, website? }
// Saves the message in Supabase (contact_messages) and emails it to the site owner.
//
// Email is sent with Resend (free: resend.com). Set in Vercel → Settings → Environment Variables:
//   RESEND_API_KEY  — from resend.com → API Keys
//   CONTACT_TO      — where messages go (default shelftostacks@gmail.com)
//   CONTACT_FROM    — optional sender, e.g. "Shelf to Stacks <hello@shelftostacks.com>" once the
//                     domain is verified in Resend. Until then Resend's test sender is used, which
//                     can only deliver to the email address the Resend account was created with.

const TOPICS: Record<string, string> = {
  general: "Just saying hello",
  bug: "Something isn't working",
  library: "Add my library",
  club: "Book club question",
  idea: "An idea for the site",
  press: "Press or partnership",
};

export const POST = handle(async (req) => {
  const body = await readJson<Record<string, unknown>>(req);
  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const topic = TOPICS[String(body.topic ?? "")] ? String(body.topic) : "general";
  const message = String(body.message ?? "").trim().slice(0, 5000);

  // Bots fill in every field, including this hidden one. Pretend it worked.
  if (String(body.website ?? "").trim()) return json({ ok: true });

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError("Enter a valid email address so we can reply.");
  if (message.length < 5) throw new HttpError("Write a short message first.");
  if (await overLimit(`contact:${clientIp(req)}`, 5, 3600)) {
    throw new HttpError("You've sent a few messages already. Try again in an hour.", 429);
  }

  const [saved, emailed] = await Promise.all([saveMessage(name, email, topic, message), sendEmail(name, email, topic, message)]);
  if (!saved && !emailed) throw new HttpError("Your message didn't go through. Try again in a moment.", 502);
  return json({ ok: true, saved, emailed });
});

async function saveMessage(name: string, email: string, topic: string, message: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/send_contact`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_name: name || null, p_email: email, p_topic: topic, p_message: message }),
    });
    if (!res.ok) console.error("contact: save failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("contact: save failed", e);
    return false;
  }
}

async function sendEmail(name: string, email: string, topic: string, message: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = process.env.CONTACT_TO || "shelftostacks@gmail.com";
  const from = process.env.CONTACT_FROM || "Shelf to Stacks <onboarding@resend.dev>";
  const who = name ? `${name} <${email}>` : email;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Shelf to Stacks: ${TOPICS[topic]}${name ? ` from ${name}` : ""}`,
        text: `${message}\n\n——\nFrom: ${who}\nTopic: ${TOPICS[topic]}\nSent from the contact form on shelftostacks.com. Reply to this email to answer them.`,
      }),
    });
    if (!res.ok) console.error("contact: email failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("contact: email failed", e);
    return false;
  }
}
