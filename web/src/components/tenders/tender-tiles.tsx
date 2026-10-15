import { Collection, Tile } from "@/components/ui/collection";
import { StateChip } from "@/components/tenders/tender-state";
import { hueFor } from "@/lib/hues";
import type { TenderSummary } from "@/types/tenders";

/**
 * Tenders as a `Collection` of `Tile`s, so each of the twelve themes draws
 * them in its own idiom without a line here knowing which is active
 * (`components/ui/collection.tsx`).
 *
 * **No picture, and no well standing in for one.** A tender notice has no
 * cover: it is a reference, a scope of work and a deadline. Twelve identical
 * gradient wells would be twelve non-pictures taking the height of twelve
 * pictures, so the tiles are text — which is also how a procurement page
 * reads everywhere else.
 *
 * **What goes where.** The reference is the kicker, because it is what a
 * bidder quotes and the one thing that tells two years' notices for the same
 * work apart. The state chip and the deadline are the meta. The category,
 * the fee and the documents go under the summary, as a small row of facts —
 * they are what somebody scans a list of tenders for.
 *
 * The chip is **not** an island here. This list is on a dynamic page,
 * rendered per request, so its states are at most a minute old — the API's
 * own cache window — and twenty islands to shave a minute off that would be
 * twenty fetches for nothing. The notice's own page, which *is* cached, has
 * the island.
 */
export function TenderTiles({ tenders, titleAs = "h3" }: {
  tenders: TenderSummary[];
  titleAs?: "h2" | "h3";
}) {
  if (tenders.length === 0) return null;

  return (
    <Collection kind="tenders" cols={tenders.length === 1 ? 1 : tenders.length === 2 ? 2 : 3} data-tender-grid="">
      {tenders.map((tender) => (
        <Tile
          key={tender.id}
          href={`/tenders/${tender.slug}`}
          titleAs={titleAs}
          title={tender.title}
          kicker={<span className="font-mono">{tender.reference}</span>}
          summary={tender.summary ?? undefined}
          hue={hueFor(tender.category?.slug ?? tender.slug)}
          beam
          data-tender-state={tender.state}
          meta={
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <StateChip state={tender.state} label={tender.state_label} />
              <span>
                Closes <time dateTime={tender.closes_at}>{tender.closes_label}</time>
              </span>
            </span>
          }
          cta="Read the notice"
        >
          <Facts tender={tender} />
        </Tile>
      ))}
    </Collection>
  );
}

/**
 * The row under the summary: what a bidder scans for.
 *
 * Each fact is drawn only when it is there. A tender with no fee stated and
 * no documents yet shows nothing here rather than a row of dashes — "we have
 * not said" and "nothing to pay" are different answers, and the API already
 * tells them apart by sending `null` for the first and "Free" for the second.
 */
function Facts({ tender }: { tender: TenderSummary }) {
  const facts: { label: string; value: string }[] = [];

  if (tender.category) facts.push({ label: "Category", value: tender.category.name });
  if (tender.fee_label) facts.push({ label: "Document fee", value: tender.fee_label });
  if (tender.emd_label) facts.push({ label: "EMD", value: tender.emd_label });
  if (tender.documents_count > 0) {
    facts.push({
      label: "Documents",
      value: `${tender.documents_count} ${tender.documents_count === 1 ? "file" : "files"}`,
    });
  }

  if (facts.length === 0) return null;

  return (
    <dl data-tender-facts="" className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-12-5">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline gap-1.5">
          <dt className="text-muted">{fact.label}</dt>
          <dd className="font-semibold text-ink-2">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
