import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BlogPost } from "@/types/api";

/**
 * The foot of an article: the post before it on the left, the post after it
 * on the right, each as a label over its title.
 *
 * Two doors rather than one "back" link, because somebody who has read to
 * the end of an article is a reader, not a visitor, and the next thing a
 * reader wants is the next thing. Either side renders nothing at the end of
 * the blog — a greyed "Next" on the newest post is a control that says no.
 * The two halves are one grid so the rule between them holds the width
 * when only one is present.
 */
export function PostNav({ previous, next }: Pick<BlogPost, "previous" | "next">) {
  if (!previous && !next) return null;

  return (
    <nav aria-label="Neighbouring articles" className="mt-12 grid gap-6 border-t border-line pt-7 sm:grid-cols-2 sm:gap-10">
      <Door label="Previous" post={previous} />
      <Door label="Next" post={next} align="right" />
    </nav>
  );
}

function Door({ label, post, align = "left" }: { label: string; post?: { title: string; slug: string } | null; align?: "left" | "right" }) {
  if (!post) return <span aria-hidden className="hidden sm:block" />;

  return (
    <div className={cn("min-w-0", align === "right" && "sm:text-right")}>
      <p className="mb-1 text-13 font-semibold text-ink">
        {align === "left" ? "← " : ""}{label}{align === "right" ? " →" : ""}
      </p>
      <Link
        href={`/blog/${post.slug}`}
        rel={align === "left" ? "prev" : "next"}
        className="text-[16px] leading-snug font-medium text-brand-ink text-balance transition-colors hover:text-ink hover:underline"
      >
        {post.title}
      </Link>
    </div>
  );
}
