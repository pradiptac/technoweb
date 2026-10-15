/**
 * The return form as the API reads it (docs/store.md "Returns").
 *
 * The form's quantity controls are named `qty_<order line id>`; a line left
 * at 0 is one the customer is keeping and is left out. No directive: the two
 * Server Actions that take the form — the order link's and the portal's —
 * both import it, and neither file may export a non-action.
 */
export function returnPayload(formData: FormData): {
  reason: string;
  details: string | null;
  items: { order_item_id: number; quantity: number }[];
} {
  const items: { order_item_id: number; quantity: number }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;

    const id = Number(key.slice(4));
    const quantity = Number(value);

    if (Number.isInteger(id) && id > 0 && Number.isInteger(quantity) && quantity > 0) {
      items.push({ order_item_id: id, quantity });
    }
  }

  return {
    reason: String(formData.get("reason") ?? ""),
    details: String(formData.get("details") ?? "").trim() || null,
    items,
  };
}
