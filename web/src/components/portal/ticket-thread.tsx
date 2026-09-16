import { ImageAttachments } from "@/components/portal/ticket-live";
import { QuoteReply } from "@/components/portal/quote-reply";
import { ReplyVerdict } from "@/components/portal/reply-verdict";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TicketMessage } from "@/types/api";

/**
 * A ticket's conversation, drawn like a chat.
 *
 * Asked for on 2026-09-16 with a reference from another helpdesk: the
 * engineer's replies on the left with an avatar and a name, the customer's
 * own messages on the right, each reply with stars and a report button in
 * its footer and a quote glyph in its corner. The thread was a flat list
 * of tinted cards before; who said what was a badge, and reading a long
 * ticket meant reading every badge.
 *
 * Every message is one `<li>`: a grid of avatar column and bubble, the
 * columns reversed for the customer so the bubble hangs from the right
 * edge. The avatar is the name's initials on a disc — there are no
 * photographs of anybody in this product and a generic silhouette is the
 * "AI slop" glyph the design rules refuse. The staff bubble carries
 * `ReplyVerdict`; the customer's carries nothing, since nobody rates
 * themselves. Attachments stay where they were, inside the bubble.
 *
 * The body is `whitespace-pre-wrap` on purpose: a customer pastes log
 * lines and an engineer signs off on three lines, and both should keep
 * their shape. It is text, never HTML — a ticket body is plain text on
 * both sides and is rendered escaped.
 */
export function TicketThread({
  reference, description, customerName, createdAt, messages,
}: {
  reference: string;
  description: string;
  customerName: string;
  createdAt: string;
  messages: TicketMessage[];
}) {
  return (
    <ul id="thread" className="grid gap-5">
      <Bubble
        who={customerName}
        mine
        badge="Original request"
        at={createdAt}
        body={description}
      />
      {messages.map((m) => {
        const fromStaff = m.author.type === "staff";
        return (
          <Bubble
            key={m.id}
            who={m.author.name}
            mine={!fromStaff}
            at={m.created_at}
            body={m.body}
            attachments={m.attachments}
            footer={fromStaff ? (
              <ReplyVerdict
                reference={reference}
                messageId={m.id}
                rating={m.rating}
                reportReason={m.report_reason}
                reportedAt={m.reported_at}
              />
            ) : null}
          />
        );
      })}
    </ul>
  );
}

function Bubble({
  who, mine, badge, at, body, attachments, footer,
}: {
  who: string;
  mine: boolean;
  badge?: string;
  at: string;
  body: string;
  attachments?: TicketMessage["attachments"];
  footer?: React.ReactNode;
}) {
  return (
    // Below `sm` the avatar and name sit on a line above the bubble, and the
    // bubble takes the full width: measured at 390px, two columns left the
    // words in a 60px strip beside the avatar column.
    <li className={cn("grid items-start gap-2 sm:gap-4", mine ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[auto_1fr]")}>
      <div className={cn("flex items-center gap-2.5 sm:w-36 sm:flex-col sm:items-start sm:gap-1.5", mine && "justify-end sm:order-2 sm:items-end sm:text-right")}>
        <Avatar name={who} staff={!mine} />
        <span className="text-13-5 font-semibold leading-tight text-ink">{who}</span>
        {badge && <span className="text-10-5 font-semibold uppercase tracking-[.06em] text-muted">{badge}</span>}
        {!mine && !badge && <span className="text-10-5 font-semibold uppercase tracking-[.06em] text-brand-ink">Support</span>}
      </div>
      <div
        className={cn(
          "relative min-w-0 rounded-xl border p-4.5 pr-12",
          mine ? "sm:order-1 border-line-strong bg-surface" : "border-brand-200 bg-card",
        )}
      >
        <div className="absolute right-2 top-2">
          <QuoteReply text={body} who={who} />
        </div>
        <div className="text-14-5 leading-[1.62] whitespace-pre-wrap">{body}</div>
        {attachments && attachments.length > 0 && (
          <>
            <ImageAttachments attachments={attachments} base="/api/portal/ticket-attachments" />
            <ul className="mt-3.5 flex flex-wrap gap-2 border-t border-line pt-3">
              {attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/portal/ticket-attachments/${a.id}`}
                    className="inline-flex items-center gap-2 rounded border border-line-strong bg-card px-2.5 py-2 text-12-5 font-medium hover:border-brand-300"
                  >
                    {a.filename}
                    <span className="font-mono text-11 text-muted">{fileSize(a.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={cn("mt-3 flex flex-wrap items-center gap-x-5 gap-y-2", footer && "border-t border-line pt-3")}>
          <time className="font-mono text-11-5 text-muted" dateTime={at}>{formatDate(at, "dateTime")}</time>
          {footer}
        </div>
      </div>
    </li>
  );
}

/** Initials on a disc: two letters at most, the first of the first two words. */
function Avatar({ name, staff }: { name: string; staff: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-13 font-bold",
        staff ? "bg-brand-600 text-brand-on" : "bg-surface-2 text-ink-2 ring-1 ring-line-strong",
      )}
    >
      {initials}
    </span>
  );
}

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
