import { formatPaise } from "@/lib/money";

/**
 * The Delivery line of an order's summary — on the public order page, the
 * portal's and the console's (0.142.0, docs/store.md "Delivery charges and
 * shipping zones").
 *
 * It states what was charged, from the order's own snapshot, so renaming or
 * deleting a zone afterwards cannot change what an old order says. Drawn only
 * for an order that was charged something or priced from a zone (a free
 * delivery inside a zone is "Free"): an order placed before delivery was
 * charged, or one with nothing to ship, reads exactly as it always did.
 */
export function DeliveryRow({ paise, zone }: { paise?: number | null; zone?: string | null }) {
  const charged = paise ?? 0;

  if (charged === 0 && !zone) return null;

  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">Delivery{zone ? ` (${zone})` : ""}</dt>
      <dd className={charged === 0 ? "text-right tabular-nums text-ok" : "text-right tabular-nums"}>
        {charged === 0 ? "Free" : formatPaise(charged)}
      </dd>
    </div>
  );
}
