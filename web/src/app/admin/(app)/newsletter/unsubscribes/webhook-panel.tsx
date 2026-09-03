import { Alert } from "@/components/ui/input";
import type { NewsletterWebhookMeta } from "@/types/api";

/**
 * How to point a mail provider at this install, in the Campaign section.
 *
 * Bounce handling used to be manual: a hard bounce was suppressed only when
 * somebody noticed it and typed the address in. That is the one gap in the
 * newsletter that degrades the sending domain's reputation *on its own*, so the
 * webhook exists now — and a webhook nobody knows to configure is a feature
 * that does not exist, which is the rule the Groups screen already taught this
 * module the hard way.
 *
 * It sits on the Unsubscribes screen because this list is exactly what the
 * webhook writes to: the instructions and their consequence are on one page.
 *
 * The URLs come from the API's own route table, never composed here. The
 * console runs on the frontend origin and the webhook lives on the API's, so a
 * URL assembled on this side would be a second answer to where it is — the
 * mistake that gave every campaign a tracking pixel answering 404.
 */
export function WebhookPanel({ webhook }: { webhook?: NewsletterWebhookMeta }) {
  if (!webhook) return null;

  return (
    <section className="mb-6 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-[15px] font-semibold">Automatic bounce handling</h2>

      <p className="measure mt-1.5 text-[13px] leading-[1.6] text-muted">
        Point your mail provider at the URL below and it will suppress an address the moment
        it reports a permanent failure or a spam complaint, instead of waiting for somebody to
        notice. A <strong>soft</strong> bounce is deliberately ignored — a full mailbox or an
        hour of downtime fixes itself, and suppressing on one would remove a real customer for
        good.
      </p>

      {!webhook.secret_set ? (
        /*
         * `warn`, and stated as inert rather than as "not configured".
         *
         * Without a secret the endpoint accepts nothing at all — which is the
         * right way round, because this endpoint *suppresses* addresses and an
         * open one is a way for anybody who finds the URL to remove the whole
         * list from every future campaign. But an operator who has pasted the
         * URL into a provider and sees no bounces arriving needs to be told
         * that, not left to conclude the feature is broken.
         */
        <Alert tone="warn" title="Not active yet">
          Set <strong>Newsletter webhook secret</strong> in Settings first. Until then this
          endpoint accepts nothing — deliberately, because anyone who found the URL could
          otherwise suppress your entire list.
        </Alert>
      ) : (
        <Alert tone="ok" title="Ready">
          A secret is set, so deliveries that prove they know it will be acted on.
        </Alert>
      )}

      <dl className="mt-4 grid gap-3">
        {webhook.providers.map((p) => (
          <div key={p.value} className="grid gap-1">
            <dt className="text-[12.5px] font-semibold capitalize">{p.value}</dt>
            <dd>
              {/*
                `break-all` because a URL is one unbreakable run: without it the
                min-content of this string sizes the whole panel, which is the
                grid-item trap the campaign block list already documents.
              */}
              <code className="block rounded border border-line-strong bg-card px-2.5 py-2 font-mono text-[12px] break-all">
                {p.url}
              </code>
              <p className="mt-1 text-[12px] leading-[1.55] text-muted">
                {p.value === "mailgun" ? (
                  <>
                    Add it under <strong>Sending → Webhooks</strong> for the events
                    <strong> Permanent Failure</strong> and <strong>Spam Complaints</strong>.
                    Use the <strong>HTTP webhook signing key</strong> as the secret — that is a
                    different value from your API key, and the wrong one produces a signature
                    that never matches, which reads as bounces silently not arriving.
                  </>
                ) : (
                  <>
                    Add it under <strong>Transactional → Settings → Webhook</strong> for
                    <strong> Hard bounce</strong>, <strong>Blocked</strong> and
                    <strong> Spam</strong>. Brevo signs nothing, so send the secret as a
                    <code className="mx-1 font-mono">X-Webhook-Secret</code> header.
                  </>
                )}
              </p>
            </dd>
          </div>
        ))}
      </dl>

      <p className="measure mt-3 text-[12px] leading-[1.55] text-faint">
        Plain SMTP and Gmail have no webhook — they report a bounce by mailing a delivery
        notice back to the sender, which is a mailbox to read rather than a request to receive.
        Amazon SES publishes through SNS, whose messages need a certificate fetched and checked
        per delivery; that is real work rather than a line of configuration, so it is not built.
      </p>
    </section>
  );
}
