"use client";

/**
 * "Quote this in your reply": the glyph in a bubble's corner.
 *
 * It does not open anything. It announces `tw:quote` on the window with the
 * message's text, and the reply form — which is the one thing on the page
 * that owns a textarea — listens, prepends the text as `> ` lines, and
 * moves focus there. The two are decoupled by an event rather than by
 * lifting state into the page, because the thread is a server component
 * and the form is an island: neither can hold the other's ref.
 */
export const QUOTE_EVENT = "tw:quote";

export function QuoteReply({ text, who }: { text: string; who: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: { text, who } }))}
      aria-label={`Quote this message from ${who} in your reply`}
      title="Quote in your reply"
      className="grid size-8 place-items-center rounded text-faint transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
        <path d="M6.5 7C4.6 7 3 8.6 3 10.5V17h6v-6H5.2c.1-1.5 1.1-2 2.3-2V7h-1zm9 0C13.6 7 12 8.6 12 10.5V17h6v-6h-3.8c.1-1.5 1.1-2 2.3-2V7h-1z" />
      </svg>
    </button>
  );
}

/** The text as a quote block, the way the reply form inserts it. */
export function asQuote(text: string, who: string): string {
  const lines = text.trim().split(/\r?\n/).map((l) => `> ${l}`);
  return `${who} wrote:\n${lines.join("\n")}\n\n`;
}
