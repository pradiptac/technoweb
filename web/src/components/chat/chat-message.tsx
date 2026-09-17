"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChatProductCard } from "./chat-product-card";
import { rateChatAnswerAction, type ChatSource } from "./chat-actions";

/**
 * The pieces a transcript is drawn from — a bubble, the typing dots, the
 * assistant's mark, the sources under an answer and the thumbs beside it.
 * Presentational only; the conversation's state and the panel's motion stay
 * in `chat-widget.tsx`, which grew to 727 lines carrying both.
 */

/**
 * A thumb, and nothing else.
 *
 * No "tell us more" box: the specification offers one and it is the wrong
 * trade here — a conversation is already the place to say what was wrong, and
 * a second box asking the same question in smaller type is one more thing
 * between somebody and their answer. The rating can be changed, because one
 * that cannot be taken back is one people stop giving.
 */
export function ChatRating({ messageId }: { messageId: number }) {
  const [rating, setRating] = useState<1 | -1 | null>(null);

  const rate = (value: 1 | -1) => {
    setRating(value);
    // Not awaited: a thumb is an aside, and blocking the panel on it would
    // make the cheapest interaction in the module the slowest.
    void rateChatAnswerAction(messageId, value);
  };

  return (
    <span className="mt-1.5 flex items-center gap-1">
      <span className="sr-only">Was this helpful?</span>
      {([1, -1] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => rate(value)}
          aria-pressed={rating === value}
          className={cn(
            "rounded px-1.5 py-1 text-12 transition-colors",
            rating === value ? "bg-surface-2 text-ink" : "text-faint hover:bg-surface-2 hover:text-muted",
          )}
        >
          <span className="sr-only">{value === 1 ? "Helpful" : "Not helpful"}</span>
          <span aria-hidden>{value === 1 ? "👍" : "👎"}</span>
        </button>
      ))}
      {rating !== null && <span className="text-11-5 text-faint">Thank you</span>}
    </span>
  );
}

/**
 * What an answer stood on.
 *
 * A product becomes a card with its own price and basket button; everything
 * else stays a chip. The split is on the source's type rather than on
 * something parsed out of the reply, so a card can only ever appear for a
 * record the retrieval layer actually returned.
 */
export function ChatSources({ sources }: { sources: ChatSource[] }) {
  const products = sources.filter((s) => s.product);
  const rest = sources.filter((s) => !s.product);

  return (
    <span className="mt-2 block">
      {products.map((source) => (
        <ChatProductCard key={source.url} product={source.product!} title={source.title} />
      ))}

      {rest.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {rest.map((source) => (
            <a
              key={source.url}
              href={source.url}
              className="rounded-full border border-line-strong bg-card px-2.5 py-1 text-12 text-brand-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              {source.title}
            </a>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * One message.
 *
 * A visitor's is a filled bubble on the right; the assistant's is plain text on
 * the left with no bubble and no avatar. The specification asks for no cartoon
 * robots, no large avatars and no generic chatbot bubbles, and the reason holds
 * on its own: an assistant that looks like the page it is on reads as part of
 * the site rather than as a widget shouting from the corner.
 */
export function Bubble({
  role,
  grounded,
  children,
}: {
  role: "user" | "assistant";
  grounded?: boolean;
  children: React.ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="mt-3 flex justify-end first:mt-0">
        {/*
          `overflow-wrap: anywhere`, because somebody pastes a part number.
          A 95-character unbroken token ran 145px past the bubble at 320px and
          73px past it at 1920 — the box was the right width the whole time and
          the text simply painted outside it, which is the signature the
          dashboard's "Today" label already taught this project to recognise.
          `break-words` is not enough on its own: it breaks between words, and
          there are none in a part number.
        */}
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-(--chat-accent) px-3.5 py-2 text-(length:--chat-text) text-(--chat-accent-ink) [overflow-wrap:anywhere]">
          {children}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 first:mt-0">
      {/*
        A `div`, not a `p`. This holds the answer *and* whatever hangs off it —
        a product card, the source links, a callback form — and the card carries
        a `<p role="status">` of its own, so a paragraph here put a `<p>` inside
        a `<p>`. That is invalid, and a browser does not render it as written:
        it closes the outer paragraph and reparents the rest, which moves the
        card out of the bubble it is supposed to sit in. Reported by React in
        the dev console as "cannot contain a nested <p>" and by nothing else.
      */}
      <div
        className={cn(
          // A card on the thread's tinted ground, the mirror of the brand
          // bubble the visitor's own words sit in.
          "max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-card px-3.5 py-2.5 text-(length:--chat-text) leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]",
          // An answer that stood on nothing is muted rather than dressed up as
          // one that did. The interface should not sound more certain than the
          // thing behind it.
          grounded === false ? "text-muted" : "text-ink",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Three dots, and nothing else. It is a wait, not a performance.
 *
 * `role="status"` with hidden text, because `aria-label` on a plain `div`
 * is ignored by assistive technology — the wait was silent to a screen
 * reader while the dots pulsed for everyone else.
 */
export function Typing() {
  return (
    <div className="mt-3 flex items-center gap-1" role="status">
      <span className="sr-only">The assistant is typing</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-current opacity-50 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * The mark.
 *
 * A conversation glyph rather than a face: no eyes, no antenna, nothing that
 * suggests a person is on the other end. `currentColor`, so it is white on the
 * launcher and brand ink in the header — an icon that does a job rather than
 * one that stands for a thing, which is the line `IdentityIcon` draws.
 */
/** The launcher's glyph — the ids `ChatSettings::ICONS` offers; an unknown id draws the bubble. */
export type AssistantIcon = "chat" | "bot" | "headset" | "spark" | "question";

export function AssistantMark({ icon = "chat", className }: { icon?: AssistantIcon; className?: string }) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-6", className)}>
      {icon === "bot" && (
        <>
          <rect x="4" y="8" width="16" height="11" rx="3.5" {...stroke} />
          <path d="M12 8V5M9.5 5h5" {...stroke} />
          <circle cx="9" cy="13.5" r="1.1" fill="currentColor" />
          <circle cx="15" cy="13.5" r="1.1" fill="currentColor" />
          <path d="M9.5 16.5h5" {...stroke} />
        </>
      )}
      {icon === "headset" && (
        <>
          <path d="M5 13v-1a7 7 0 0 1 14 0v1" {...stroke} />
          <rect x="4" y="12.5" width="4" height="5.5" rx="1.5" {...stroke} />
          <rect x="16" y="12.5" width="4" height="5.5" rx="1.5" {...stroke} />
          <path d="M18 18v.5a2.5 2.5 0 0 1-2.5 2.5H13" {...stroke} />
        </>
      )}
      {icon === "spark" && (
        <>
          <path d="M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5Z" {...stroke} />
          <path d="M18.5 3v3M17 4.5h3" {...stroke} />
        </>
      )}
      {icon === "question" && (
        <>
          <circle cx="12" cy="12" r="8.5" {...stroke} />
          <path d="M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .9-1 1.7" {...stroke} />
          <circle cx="12" cy="16.6" r=".9" fill="currentColor" />
        </>
      )}
      {(icon === "chat" || !["bot", "headset", "spark", "question"].includes(icon)) && (
        <>
          <path d="M20 12a8 8 0 0 1-8 8H5.5L4 21.5V12a8 8 0 0 1 16 0Z" {...stroke} />
          <path d="M8.5 11h7M8.5 14.5h4" {...stroke} />
        </>
      )}
    </svg>
  );
}
