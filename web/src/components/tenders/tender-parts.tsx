import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { TenderDetail } from "@/types/tenders";

/**
 * The pieces of a tender's page (0.174.0, `docs/tenders.md`): the glance
 * strip, the documents, how to submit and who to ask.
 *
 * Server components, every one of them — nothing here is interactive, and
 * the only island on the page is the state chip, which has a reason
 * (`tender-state.tsx`).
 *
 * **Every date and every amount is printed as the API wrote it.** Not one
 * `toLocaleDateString` or currency formatter in this file: the deadline is
 * the subject of the page, and a deadline formatted in the reader's own
 * zone is a bid missed by a day.
 */

/** The facts a bidder reads first, as a definition list. */
export function TenderGlance({ tender }: { tender: TenderDetail }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Tender number", value: <span className="font-mono">{tender.reference}</span> },
  ];

  if (tender.category) rows.push({ label: "Category", value: tender.category.name });

  rows.push({ label: "Opens", value: <time dateTime={tender.opens_at}>{tender.opens_label}</time> });
  rows.push({
    label: "Last date for submission",
    value: <time dateTime={tender.closes_at}>{tender.closes_label}</time>,
  });

  if (tender.prebid_label) {
    rows.push({
      label: "Pre-bid meeting",
      value: (
        <>
          <time dateTime={tender.prebid_at ?? undefined}>{tender.prebid_label}</time>
          {tender.prebid_place && <span className="block text-muted">{tender.prebid_place}</span>}
        </>
      ),
    });
  }

  if (tender.opening_label) {
    rows.push({
      label: "Bid opening",
      value: <time dateTime={tender.opening_at ?? undefined}>{tender.opening_label}</time>,
    });
  }

  // "We have not said" and "nothing to pay" are different answers, and the
  // API already tells them apart — null against "Free".
  if (tender.fee_label) rows.push({ label: "Tender document fee", value: tender.fee_label });
  if (tender.emd_label) rows.push({ label: "Earnest money deposit", value: tender.emd_label });

  return (
    <Card interactive={false} as="section" data-tender-glance="">
      <h2 className="sr-only">At a glance</h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-12-5 font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
            <dd className="mt-0.5 text-15 font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * The tender pack.
 *
 * A plain `<a download>` on each, never a `next/link`: these are files, and
 * a prefetch of a PDF is a download nobody asked for — the rule the
 * newsletter's CSV export was fixed for.
 *
 * A document whose file has gone is not here at all; the API drops it rather
 * than sending a button that 404s.
 */
export function TenderDocuments({ documents }: { documents: TenderDetail["documents"] }) {
  if (documents.length === 0) return null;

  return (
    <section data-tender-documents="">
      <h2 className="display-3 mb-4">Tender documents</h2>
      <ul className="grid gap-3">
        {documents.map((document) => (
          <li key={document.url}>
            <a
              href={document.url}
              download
              className="flex items-center gap-4 rounded-lg border border-line-strong bg-card px-4 py-3.5 transition-colors duration-(--duration-base) hover:border-brand-600"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{document.title}</span>
                {document.note && <span className="block text-13 text-muted">{document.note}</span>}
              </span>
              <span className="shrink-0 text-12-5 font-semibold uppercase text-muted">
                {document.extension ?? "file"} · {readableSize(document.size)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * How a bid is sent.
 *
 * At least one of the three is always here: the save refuses to publish a
 * notice nobody can answer, so this section can never be empty on a page a
 * visitor can reach.
 */
export function TenderSubmission({ tender }: { tender: TenderDetail }) {
  const { email, url, address } = tender.submission;

  return (
    <section data-tender-submission="">
      <h2 className="display-3 mb-4">How to submit a bid</h2>
      <Card interactive={false} as="div">
        <dl className="grid gap-4">
          {url && (
            <Row label="On this portal">
              {/* Somebody else's site: a plain anchor, and it leaves this one. */}
              <a href={url} className="break-words font-semibold text-brand-ink underline decoration-from-font underline-offset-2" rel="noopener noreferrer" target="_blank">
                {url}
              </a>
            </Row>
          )}
          {email && (
            <Row label="By email">
              <a href={`mailto:${email}`} className="font-semibold text-brand-ink underline decoration-from-font underline-offset-2">
                {email}
              </a>
            </Row>
          )}
          {address && (
            <Row label="By post or by hand">
              <span className="whitespace-pre-line">{address}</span>
            </Row>
          )}
        </dl>
      </Card>
    </section>
  );
}

/** Who to ask about the tender. Absent when nobody is named. */
export function TenderContact({ tender }: { tender: TenderDetail }) {
  const { name, phone, email } = tender.contact;

  if (!name && !phone && !email) return null;

  return (
    <section data-tender-contact="">
      <h2 className="display-3 mb-4">Questions about this tender</h2>
      <Card interactive={false} as="div">
        <dl className="grid gap-4 sm:grid-cols-3">
          {name && <Row label="Contact">{name}</Row>}
          {phone && (
            <Row label="Telephone">
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-brand-ink underline decoration-from-font underline-offset-2">
                {phone}
              </a>
            </Row>
          )}
          {email && (
            <Row label="Email">
              <a href={`mailto:${email}`} className="break-words font-semibold text-brand-ink underline decoration-from-font underline-offset-2">
                {email}
              </a>
            </Row>
          )}
        </dl>
      </Card>
    </section>
  );
}

/** The standing note on a closed notice, so nobody prepares a bid for it. */
export function TenderClosedNote({ tender }: { tender: TenderDetail }) {
  if (!tender.closed) return null;

  return (
    <p data-tender-closed="" className="rounded-lg border border-line-strong bg-surface-2 px-4 py-3 text-14 text-ink-2">
      <strong className="font-semibold">This tender has closed.</strong>{" "}
      Bids were accepted until <time dateTime={tender.closes_at}>{tender.closes_label}</time>. It is kept here
      for the record. <Link href="/tenders" className="font-semibold text-brand-ink underline decoration-from-font underline-offset-2">See what is open now</Link>.
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-12-5 font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-15 text-ink">{children}</dd>
    </div>
  );
}

/** "1.4 MB". Bytes, as the API counted them. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
