import { IconTile } from "@/components/ui/icon-tile";
import { storeTrustFeatures } from "@/content/site";

/**
 * The store homepage's 4-icon trust strip. Static — no props, no fetch, no
 * settings — see the note on `storeTrustFeatures` in `content/site.ts`.
 *
 * Each item is a bordered card rather than bare text on the page. Unboxed,
 * four short blocks spread across a full-width row read as loose fragments
 * with no relationship to each other; the border is what makes them one strip
 * of four equal claims, which is the whole point of the row.
 */
export function TrustStrip() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {storeTrustFeatures.map((f) => (
        <li
          key={f.title}
          className="flex items-start gap-3.5 rounded-lg border border-line-strong bg-card p-4"
        >
          <IconTile name={f.icon} size="md" />
          <div className="min-w-0">
            <b className="block text-[14.5px] font-semibold text-ink">{f.title}</b>
            <span className="mt-0.5 block text-[13px] leading-normal text-muted">{f.body}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
