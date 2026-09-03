import { CommentForm } from "@/components/blog/comment-form";
import type { PublicComment } from "@/types/api";

/**
 * The comments under an article.
 *
 * **Server-rendered**, so they are real content on the page rather than a
 * widget: indexable, readable with no JavaScript, and part of what a search
 * engine sees the article as being about.
 *
 * The heading is an `h2`, which is the right level under the post's single
 * `h1` — a jump here would fail `npm run audit` on every article that has a
 * comment.
 */
export function Comments({
  slug,
  comments,
  total,
  open,
}: {
  slug: string;
  comments: PublicComment[];
  total: number;
  open: boolean;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8" id="comments">
      <h2 className="text-[22px] font-semibold">
        {total === 0 ? "Comments" : `${total} comment${total === 1 ? "" : "s"}`}
      </h2>

      {comments.length > 0 && (
        <ul className="mt-6 grid gap-6">
          {comments.map((c) => (
            <Comment key={c.id} comment={c} />
          ))}
        </ul>
      )}

      {open ? (
        <>
          <h3 className="mt-10 text-[17px] font-semibold">Leave a comment</h3>
          <CommentForm slug={slug} />
        </>
      ) : (
        <p className="mt-8 text-[13.5px] text-muted">
          {/*
            Said plainly. "Comments are closed" with no reason reads as a fault;
            this is a decision, and an old article is exactly where somebody
            expects one.
          */}
          Comments are closed on this post.
        </p>
      )}
    </section>
  );
}

function Comment({ comment, isReply = false }: { comment: PublicComment; isReply?: boolean }) {
  return (
    <li className={isReply ? "border-l-2 border-line pl-4" : ""}>
      <article>
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h3 className="text-[14.5px] font-semibold">{comment.author_name}</h3>
          {comment.created_at && (
            <time dateTime={comment.created_at} className="text-[12.5px] text-faint">
              {new Date(comment.created_at).toLocaleDateString("en-GB", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </time>
          )}
        </div>

        {/*
          Plain text, rendered as a string.

          The column stores no markup at all, which is what removes stored XSS
          from this feature rather than defending against it — the reason the
          plan chose plain text over pointing `HtmlSanitiser` at anonymous
          input. `whitespace-pre-wrap` keeps the paragraph breaks somebody
          typed; `[overflow-wrap:anywhere]` handles a pasted URL, which is one
          unbroken run that `break-words` has no spaces to work with.
        */}
        <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.65] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {comment.body}
        </p>
      </article>

      {comment.replies.length > 0 && (
        <ul className="mt-4 grid gap-4">
          {comment.replies.map((r) => (
            <Comment key={r.id} comment={r} isReply />
          ))}
        </ul>
      )}
    </li>
  );
}
