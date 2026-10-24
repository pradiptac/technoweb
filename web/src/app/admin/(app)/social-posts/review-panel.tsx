"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/dates";
import { X_LIMIT, X_URL, xTotal } from "@/lib/social-text";
import type { SocialPost } from "@/types/social-posts";
import { approveSocialPostAction, discardSocialPostAction } from "./actions";
import { statusTone } from "./social-tones";

/** The three states in which the wording can still be changed and sent. */
export const EDITABLE = ["draft", "failed", "unconfirmed"];

/**
 * Whether the text reached the clipboard. `navigator.clipboard` is undefined off a secure origin
 * (plain http, a fresh install before SSL) and the write throws synchronously there, so a
 * `.catch` on the promise is not enough.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * One draft, opened for review (C7): the wording, a count against the
 * network's limit, the link card the network will draw, and the three things
 * a person can do — send it, discard it, or (for a post already sent) go and
 * look at it.
 *
 * **Approving is editing**: the text on screen is posted with the approval, so
 * what goes out is what was read. What happens next depends on the network
 * and the connection, and the API says: X always, and LinkedIn when it is not
 * connected, hand back an address to open — the text is copied first for
 * LinkedIn, whose share page cannot be pre-filled. Both happen from the
 * click's own continuation; if the browser holds the window back the link is
 * on screen as well.
 */
export function ReviewPanel({
  post, connected, onClose, announce,
}: {
  post: SocialPost;
  connected: boolean;
  onClose: () => void;
  /** Raises a toast through `?done=`. */
  announce: (key: string) => void;
}) {
  const isX = post.network === "x";
  const editable = EDITABLE.includes(post.status);
  const [text, setText] = useState(post.text);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // "Copy and open instead": skip the API even though LinkedIn is connected.
  const [manual, setManual] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const used = isX ? xTotal(text) : text.length;
  const limit = isX ? X_LIMIT : post.limit;
  const over = used > limit;
  const direct = !isX && connected;
  const unconfirmed = post.status === "unconfirmed";

  const approve = (confirm: boolean, asManual = false) => {
    setError(null);
    start(async () => {
      const out = await approveSocialPostAction(post.id, text, confirm, asManual);

      if (out.error && !out.status) {
        setError(out.error);
        setConfirming(false);
        // The post may have moved (a refused send is `failed`); redraw it as the API holds it.
        router.refresh();
        return;
      }

      // Whether the text is on the clipboard: a refused write must not be reported as a copy.
      let copied = false;
      if (out.openUrl) {
        // LinkedIn's share page takes only the address, so the text rides on the clipboard.
        if (!isX) copied = await copyText(text);
        window.open(out.openUrl, "_blank", "noopener");
      }

      if (out.done) announce(out.done);
      else router.refresh();
      setDone({ status: out.status ?? "", openUrl: out.openUrl ?? null, note: out.error, copied, text });
    });
  };

  const discard = () => {
    if (!window.confirm("Discard this post? It will not be sent.")) return;
    setError(null);
    start(async () => {
      const out = await discardSocialPostAction(post.id);
      if (out.error) {
        setError(out.error);
        router.refresh();
        return;
      }
      announce("social-discarded");
      onClose();
    });
  };

  const sentLike = post.status === "sent" || post.status === "shared_manually";

  return (
    <Modal
      open
      size="side"
      onClose={onClose}
      title={`${post.network_label} post`}
      description={post.subject ? `${post.subject.kind}: ${post.subject.title}` : undefined}
    >
      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!done && <Badge tone={statusTone[post.status]}>{post.status_label}</Badge>}
          {post.ai_pending && !done && <Badge tone="accent" dot={false}>Writing…</Badge>}
          <span className="text-12-5 text-muted">
            {post.drafted_by ? `Drafted by ${post.drafted_by}` : "Drafted automatically"}
            {post.created_at ? `, ${formatDate(post.created_at, "dateTimeShort")}` : ""}
          </span>
        </div>

        {done ? (
          <DoneNote done={done} isX={isX} />
        ) : (
          <>
            {post.ai_pending && (
              <p className="mb-3 text-12-5 text-muted">
                The assistant is still writing this. You can edit or send it now; what you write is what goes out.
              </p>
            )}
            {post.error && post.status !== "draft" && (
              <div className="mb-3">
                <Alert tone={post.status === "failed" ? "err" : "warn"} title={post.status === "failed" ? "The last attempt was refused" : "We couldn't confirm"} dismissible={false}>
                  {post.error}
                </Alert>
              </div>
            )}
            {error && error !== post.error && <div className="mb-3"><Alert tone="err" title="That did not work" dismissible={false}>{error}</Alert></div>}

            <Field
              label="Post text"
              htmlFor="social-text"
              variant="above"
              error={editable && over ? (isX ? "That is too long for X." : `LinkedIn allows up to ${post.limit.toLocaleString("en-IN")} characters.`) : undefined}
              hint={isX
                ? `${used} of ${limit}, counting the link as ${X_URL} characters. The link is added after your text.`
                : `${used.toLocaleString("en-IN")} of ${limit.toLocaleString("en-IN")} characters.`}
            >
              <Textarea
                id="social-text"
                rows={isX ? 7 : 12}
                value={text}
                readOnly={!editable || busy}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>

            {post.subject && (
              <div className="mb-4 overflow-hidden rounded-lg border border-line-strong bg-card">
                {post.subject.image && (
                  <div className="relative aspect-[1200/630] bg-surface-2">
                    <Image src={post.subject.image} alt="" fill sizes="448px" className="object-cover" unoptimized />
                  </div>
                )}
                <div className="px-3 py-2.5">
                  <p className="text-12 text-muted">{host(post.url || post.subject.public_url)}</p>
                  <p className="text-13-5 font-semibold text-ink">{post.subject.title}</p>
                  <Link href={post.subject.admin_path} className="mt-0.5 inline-block py-1 text-12-5 font-semibold text-brand-ink hover:underline">
                    Open the {post.subject.kind.toLowerCase()}
                  </Link>
                </div>
              </div>
            )}

            {editable && (
              <p className="measure mb-4 text-12-5 text-muted">
                {isX
                  ? "X opens with this text filled in; post it there."
                  : connected
                    ? "Approving posts this to the company's LinkedIn page now."
                    : "LinkedIn isn't connected, so Approve copies the text and opens LinkedIn for you to post. An administrator can connect it in Settings → Social accounts."}
              </p>
            )}

            {sentLike && post.remote_url && (
              <p className="mb-4 text-13">
                <a href={post.remote_url} target="_blank" rel="noopener" className="font-semibold text-brand-ink hover:underline">View post ↗</a>
              </p>
            )}
            {sentLike && (
              <p className="mb-4 text-12-5 text-muted">
                {post.approved_by ? `Approved by ${post.approved_by}` : "Approved"}
                {post.approved_at ? `, ${formatDate(post.approved_at, "dateTimeShort")}` : ""}.
              </p>
            )}

            {editable && confirming && (
              <div className="mb-3">
                <Alert tone="warn" title="Check LinkedIn first" dismissible={false}>
                  We couldn&apos;t confirm LinkedIn received this. If it is already on the page, discard it instead; sending it again would post it twice.
                </Alert>
              </div>
            )}

            {editable && (
              <div className="flex flex-wrap items-center gap-2">
                {confirming ? (
                  <>
                    <Button type="button" size="sm" pending={busy} disabled={over || text.trim() === ""} onClick={() => approve(true, manual)}>
                      {busy ? (manual ? "Opening…" : "Sending…") : manual ? "It isn't there, copy and open" : "It isn't there, send again"}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { setConfirming(false); setManual(false); }}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button" size="sm" pending={busy} disabled={over || text.trim() === ""}
                      onClick={() => { setManual(false); if (unconfirmed) setConfirming(true); else approve(false); }}
                    >
                      {busy ? (direct ? "Sending…" : "Opening…") : direct ? "Approve and send" : isX ? "Open in X" : "Copy and open"}
                    </Button>
                    {direct && (post.status === "failed" || unconfirmed) && (
                      <Button
                        type="button" size="sm" variant="secondary" disabled={busy || over || text.trim() === ""}
                        onClick={() => { setManual(true); if (unconfirmed) setConfirming(true); else approve(false, true); }}
                      >
                        Copy and open instead
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={discard}>Discard</Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** What happened, after an approval — and the way in if the browser held the new window back. */
type Done = { status: string; openUrl: string | null; note?: string; copied: boolean; text: string };

function DoneNote({ done, isX }: { done: Done; isX: boolean }) {
  const [copiedNow, setCopiedNow] = useState(false);

  if (done.status === "unconfirmed") {
    return (
      <Alert tone="warn" title="We couldn't confirm" dismissible={false}>
        {done.note ?? "We couldn't confirm LinkedIn received this. Check the page before trying again."}
      </Alert>
    );
  }

  // The clipboard refused the write (Safari, or the click's activation ran out): the text is shown to copy by hand.
  if (done.openUrl && !isX && !done.copied) {
    return (
      <Alert tone="warn" title="Copy the text yourself" dismissible={false}>
        The text could not be copied for you. Copy it here, then paste it into the LinkedIn box.{" "}
        <a href={done.openUrl} target="_blank" rel="noopener" className="font-semibold underline">Open LinkedIn</a> if it did not open.
        <Textarea aria-label="Approved text" readOnly rows={8} value={done.text} className="mt-2" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button" size="sm" variant="secondary" className="mt-2"
          onClick={async () => { if (await copyText(done.text)) setCopiedNow(true); }}
        >
          {copiedNow ? "Copied" : "Copy"}
        </Button>
      </Alert>
    );
  }

  if (done.openUrl) {
    return (
      <Alert tone="ok" title={isX ? "Opening X" : "Text copied"} dismissible={false}>
        {isX ? "The text is filled in there; post it from X." : "The text is on your clipboard; paste it into the LinkedIn box."}{" "}
        If nothing opened,{" "}
        <a href={done.openUrl} target="_blank" rel="noopener" className="font-semibold underline">open it here</a>.
      </Alert>
    );
  }

  return <Alert tone="ok" title="Posted" dismissible={false}>It is on the company&apos;s LinkedIn page.</Alert>;
}
