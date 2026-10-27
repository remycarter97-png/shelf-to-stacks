import { useEffect } from "react";
import { POSTS, TINTS, findPost, formatPostDate, type Post } from "../lib/journal";
import { JournalArt } from "./Illustrations";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { AppLink, OutLink, cx } from "./ui";
import { parseInline } from "../../shared/journalMarkdown";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Shelf to Stacks` : "Shelf to Stacks";
    return () => {
      document.title = "Shelf to Stacks";
    };
  }, [title]);
}

export function PostCard({ post, className }: { post: Post; className?: string }) {
  return (
    <AppLink href={`/journal/${post.slug}`} className={cx("lift flex flex-col overflow-hidden rounded-[1.4rem] bg-card", className)}>
      <div className="grid h-40 place-items-center" style={{ background: TINTS[post.tint] }}>
        <JournalArt kind={post.art} />
      </div>
      <div className="flex flex-1 flex-col px-5 pb-6 pt-4">
        <p className="text-[0.8rem] font-bold text-muted-foreground">
          {post.category} · {post.minutes} min read
        </p>
        <h3 className="mt-1.5 font-display text-[1.4rem] font-normal leading-snug">{post.title}</h3>
        <p className="mt-2 text-[0.95rem] text-muted-foreground">{post.excerpt}</p>
      </div>
    </AppLink>
  );
}

export function JournalTeaser() {
  return (
    <section className="mt-24" aria-labelledby="journal-heading">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-script text-2xl text-link">from the reading nook</p>
          <h2 id="journal-heading" className="font-display text-[2rem] leading-tight md:text-[2.4rem]">
            The Journal
          </h2>
        </div>
        <AppLink href="/journal" className="font-bold text-link underline-offset-4 hover:underline">
          All posts →
        </AppLink>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {POSTS.slice(0, 3).map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </section>
  );
}

export function JournalPage() {
  usePageTitle("Journal");
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="safe-x mx-auto max-w-6xl pt-10">
        <p className="font-script text-2xl text-link">from the reading nook</p>
        <h1 className="font-display text-5xl leading-tight md:text-6xl">The Journal</h1>
        <p className="mt-3 max-w-xl text-lg text-muted-foreground">
          Reading lists, library tips and small ideas for a cozier reading life.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {POSTS.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function PostPage({ slug }: { slug: string }) {
  const post = findPost(slug);
  usePageTitle(post?.title ?? "Post not found");
  if (!post) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="safe-x mx-auto max-w-3xl pt-16">
          <h1 className="font-display text-4xl">We couldn't find that post</h1>
          <p className="mt-3 text-muted-foreground">It may have moved.</p>
          <AppLink href="/journal" className="mt-6 inline-block font-bold text-link underline underline-offset-4">
            Back to the Journal
          </AppLink>
        </main>
        <SiteFooter />
      </div>
    );
  }
  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="safe-x mx-auto max-w-3xl pt-8">
        <AppLink href="/journal" className="text-sm font-bold text-link hover:underline">
          ← The Journal
        </AppLink>
        <article className="mt-5">
          <p className="text-sm font-bold text-muted-foreground">
            {post.category} · {formatPostDate(post.date)} · {post.minutes} min read
          </p>
          <h1 className="mt-2 font-display text-4xl leading-[1.1] md:text-5xl">{post.title}</h1>
          <div className="mt-7 grid h-56 place-items-center rounded-[1.6rem] md:h-64" style={{ background: TINTS[post.tint] }}>
            <div className="scale-[1.6]">
              <JournalArt kind={post.art} />
            </div>
          </div>
          <div className="prose-cozy mt-4 text-[1.07rem] leading-[1.75]">
            {post.body.map((b, i) =>
              "h" in b ? (
                <h2 key={i} className="font-display">
                  {b.h}
                </h2>
              ) : "p" in b ? (
                <p key={i}>
                  <Rich text={b.p} />
                </p>
              ) : (
                <ul key={i}>
                  {b.ul.map((li) => (
                    <li key={li}>
                      <Rich text={li} />
                    </li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </article>

        <div className="mt-12 rounded-[1.6rem] bg-butter p-6 text-[#4a3728] md:p-8">
          <p className="font-script text-2xl">your list, your library</p>
          <p className="mt-1 font-display text-2xl">See which books on your list are on the shelf right now.</p>
          <AppLink href="/" className="btn-ledge mt-4 inline-flex min-h-12 items-center rounded-full bg-[#f2c4c4] px-6 font-extrabold" style={{ ["--primary-edge" as string]: "#e3a7a7" }}>
            Check my shelf
          </AppLink>
        </div>

        <h2 className="mt-14 font-display text-2xl">Keep reading</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {more.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A line of post text with **bold**, *italic* and [links](…). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((x, i) =>
        x.href ? (
          x.href.startsWith("/") ? (
            <AppLink key={i} href={x.href} className="font-semibold text-link underline underline-offset-2">
              {x.t}
            </AppLink>
          ) : (
            <OutLink key={i} href={x.href} className="font-semibold text-link underline underline-offset-2">
              {x.t}
            </OutLink>
          )
        ) : x.b ? (
          <strong key={i}>{x.t}</strong>
        ) : x.i ? (
          <em key={i}>{x.t}</em>
        ) : (
          <span key={i}>{x.t}</span>
        ),
      )}
    </>
  );
}
