"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconArrowRight, IconClose } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ChatLeadForm } from "./chat-lead-form";
import { ChatProductCard } from "./chat-product-card";
import {
  openChatAction,
  sendChatAction,
  type ChatAction,
  type ChatOpening,
  type ChatSource,
} from "./chat-actions";

/**
 * The website assistant.
 *
 * A launcher pinned bottom-right and a panel above it; on a phone the panel
 * takes the screen. It is built out of this project's own primitives and
 * tokens rather than a widget library — the specification asks for shadcn/ui
 * and there is none here, and the instruction that matters is the one behind
 * it: this must look like part of the website, not a third-party box bolted to
 * the corner.
 *
 * ## The animation, and the two traps it walks around
 *
 * **Tailwind v4's `translate-*` and `scale-*` set the CSS `translate` and
 * `scale` properties, not `transform`.** So `transition-transform` on this
 * panel would animate nothing and it would simply appear — which is exactly
 * what happened to the mobile drawer, and to the nav underline after that. The
 * transition names `translate`, `scale` and `opacity`.
 *
 * **`visibility` is in the transition deliberately.** The panel stays mounted
 * so it has something to animate on the way out; while closed, `invisible` is
 * what keeps its off-screen box out of `documentElement.scrollWidth`, which is
 * the zero-tolerance overflow check the audits run. `inert` is the other half
 * — `opacity-0` alone leaves every control inside it focusable.
 *
 * Everything is inside `motion-safe:`, so `prefers-reduced-motion` gets the
 * panel with no movement at all rather than a shorter version of it.
 */

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  grounded?: boolean;
  sources?: ChatSource[];
  actions?: ChatAction[];
  /** Buying intent was read, so a callback is offered under this answer. */
  offerCallback?: boolean;
  /** What they asked, to seed the form so nobody types it twice. */
  asked?: string;
};

export function ChatWidget({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<ChatOpening | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  /**
   * Focus, once the panel can actually take it.
   *
   * A transitioning element cannot be focused on the first frame: at progress
   * zero the computed `visibility` is still `hidden`, so `.focus()` silently
   * does nothing and `document.activeElement` never changes. It looks exactly
   * like a broken ref. `site-header.tsx` documents this for the drawer and
   * waits on rAF until the element reports itself visible; so does this,
   * bounded so a browser that never reports it cannot spin.
   */
  const focusInput = useCallback(() => {
    let frames = 0;

    const attempt = () => {
      const el = panel.current;

      if (!el || frames++ > 30) return;

      if (getComputedStyle(el).visibility === "visible") {
        input.current?.focus();
        return;
      }

      requestAnimationFrame(attempt);
    };

    requestAnimationFrame(attempt);
  }, []);

  const start = useCallback(async () => {
    setOpen(true);
    focusInput();

    if (opening) return;

    // The page this was opened from, posted rather than read from `Referer` —
    // every request here goes through a Server Action, so on the other side
    // `Referer` is the Next server. `PageContext` reads the envelope back.
    const result = await openChatAction({
      url: window.location.href,
      title: document.title,
    });

    if (!result) {
      setRefusal("The assistant is not available just now. Our contact form reaches the team directly.");
      return;
    }

    setOpening(result);
  }, [opening, focusInput]);

  /** Newest message in view, without yanking the page around it. */
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  /** Escape closes it, wherever focus is inside. */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (text: string, quickAction?: string) => {
      const message = text.trim();
      if (!message || pending) return;

      setRefusal(null);
      setDraft("");
      setMessages((m) => [...m, { id: nextId.current++, role: "user", content: message }]);
      setPending(true);

      const reply = await sendChatAction(message, quickAction);

      setPending(false);

      if (!reply.ok) {
        setRefusal(reply.refusal ?? "That did not go through.");
        return;
      }

      /*
       * The callback offer replaces the "ask us to call you" link rather than
       * sitting beside it: two ways to do one thing, a foot apart, is a choice
       * nobody wanted to make. The link stays in `actions` for a support
       * answer, where it points somewhere else entirely.
       */
      const offerCallback = reply.actions.some((a) => a.url === "/contact");

      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "assistant",
          content: reply.content,
          grounded: reply.grounded,
          sources: reply.sources,
          actions: offerCallback ? [] : reply.actions,
          offerCallback,
          asked: message,
        },
      ]);
    },
    [pending],
  );

  if (!enabled) return null;

  const showChips = opening !== null && messages.length === 0 && opening.quickActions.length > 0;

  return (
    <>
      {/*
        The launcher. `fixed` and bottom-right, above the footer and below
        anything modal — a `<dialog>` renders in the top layer, so nothing here
        can cover one.
      */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : start())}
        aria-expanded={open}
        aria-controls="chat-panel"
        className={cn(
          "fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full",
          "bg-brand-600 text-white shadow-lg shadow-ink/15",
          "transition-[scale,background-color] duration-200 ease-brand",
          "motion-safe:hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          "sm:right-6 sm:bottom-6",
        )}
      >
        <span className="sr-only">{open ? "Close the assistant" : "Ask the website assistant"}</span>
        {open ? <IconClose className="size-6" /> : <AssistantMark />}
      </button>

      <div
        id="chat-panel"
        ref={panel}
        role="dialog"
        aria-label="Website assistant"
        inert={!open}
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-line-strong bg-card shadow-2xl shadow-ink/20",
          // Phone: a sheet from the bottom, leaving the header reachable.
          "inset-x-3 bottom-24 max-h-[min(560px,70vh)]",
          // Desktop: a panel above the launcher.
          "sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[380px]",
          /*
           * `translate` and `scale`, never `transform` — the v4 trap. And
           * `visibility` is in the list so the panel is still painted while it
           * leaves, and is `hidden` while closed so its off-screen box cannot
           * widen the document.
           */
          "transition-[opacity,translate,scale,visibility] duration-200 ease-brand",
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "invisible translate-y-3 scale-[0.98] opacity-0",
          "motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:scale-100",
        )}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-full border border-brand-ink/30 text-brand-ink">
            <AssistantMark className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">Website assistant</span>
            <span className="block text-[12px] text-muted">Answers from this website</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-1 rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <span className="sr-only">Close</span>
            <IconClose className="size-4" />
          </button>
        </header>

        <div ref={log} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {opening && (
            <Bubble role="assistant">
              {opening.welcome}
            </Bubble>
          )}

          {messages.map((message) => (
            <Bubble key={message.id} role={message.role} grounded={message.grounded}>
              {message.content}
              {message.sources && message.sources.length > 0 && (
                <ChatSources sources={message.sources} />
              )}

              {/*
                Where to go next, when the question was about support or about
                buying. Rendered under the links rather than among them: a
                source is where an answer came from and this is what to do
                about it, and mixing the two makes both read as neither.
              */}
              {/*
                §40: do not interrupt every conversation with a lead form. It
                is offered when the assistant read buying intent, and offered
                *collapsed* — a button, not six inches of inputs across a
                conversation that was going somewhere else.
              */}
              {message.offerCallback && <ChatLeadForm requirement={message.asked} />}

              {message.actions && message.actions.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {message.actions.map((action) => (
                    <a
                      key={action.url}
                      href={action.url}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                        action.primary
                          ? "bg-brand-600 text-white hover:bg-brand-700"
                          : "border border-line-strong bg-card text-ink hover:border-brand-300 hover:bg-brand-50",
                      )}
                    >
                      {action.label}
                    </a>
                  ))}
                </span>
              )}
            </Bubble>
          ))}

          {pending && <Typing />}

          {showChips && (
            <div className="mt-3 flex flex-wrap gap-2">
              {opening.quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.message, action.label)}
                  className="rounded-full border border-line-strong bg-card px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/*
            Mounted empty and kept mounted. A live region that appears with its
            message already inside it has not *changed*, so nothing is
            announced — the trap `PasswordField` documents for `Field`'s note.
          */}
          <p role="status" aria-live="polite" className={cn("text-[12.5px] text-err", refusal && "mt-3")}>
            {refusal}
          </p>
        </div>

        <form
          className="flex items-end gap-2 border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-input"
            ref={input}
            rows={1}
            value={draft}
            maxLength={opening?.maxChars ?? 1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line — what everybody
              // expects of a chat box, and the reason this is a textarea.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Ask about products or services…"
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-lg border border-line-strong bg-page px-3 py-2.5 text-[14px] text-ink transition-all placeholder:text-faint focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none"
          />
          <Button type="submit" disabled={pending || draft.trim() === ""} className="size-[42px] shrink-0 justify-center p-0">
            <span className="sr-only">Send</span>
            <IconArrowRight className="size-4" />
          </Button>
        </form>
      </div>
    </>
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
function ChatSources({ sources }: { sources: ChatSource[] }) {
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
              className="rounded-full border border-line-strong bg-card px-2.5 py-1 text-[12px] text-brand-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
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
function Bubble({
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
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-[13px] text-white">
          {children}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 first:mt-0">
      <p
        className={cn(
          "max-w-[92%] text-[13px] leading-relaxed whitespace-pre-line",
          // An answer that stood on nothing is muted rather than dressed up as
          // one that did. The interface should not sound more certain than the
          // thing behind it.
          grounded === false ? "text-muted" : "text-ink",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/** Three dots, and nothing else. It is a wait, not a performance. */
function Typing() {
  return (
    <div className="mt-3 flex items-center gap-1" aria-label="The assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-faint motion-safe:animate-pulse"
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
function AssistantMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-6", className)}>
      <path
        d="M20 12a8 8 0 0 1-8 8H5.5L4 21.5V12a8 8 0 0 1 16 0Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.5 11h7M8.5 14.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
