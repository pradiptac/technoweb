/**
 * Returns on the wire (docs/store.md "Returns", API.md "Returns").
 *
 * A return is read with its order: the customer's order carries `returns`
 * and `return_policy`, which says whether the page may offer the form, how
 * many of each line are left to send back, and until when.
 */

export type ReturnStatus = "requested" | "approved" | "rejected" | "received" | "refunded" | "closed";

export type ReturnOption = { value: string; label: string };

/** A return as its customer sees it. Never a staff note, never a photograph's address. */
export type CustomerReturn = {
  reference: string;
  status: ReturnStatus;
  status_label: string;
  reason: string;
  reason_label: string;
  details: string | null;
  /** What the desk told the customer with its decision. */
  decision_note: string | null;
  items: { order_item_id: number; name: string | null; variation_name: string | null; quantity: number }[];
  photos_count: number;
  refund_paise: number | null;
  requested_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  closed_at: string | null;
};

export type ReturnPolicy = {
  enabled: boolean;
  /** Whether the form may be offered now. */
  open: boolean;
  /** The one sentence to show when it may not; null when it may. */
  message: string | null;
  closes_on: string | null;
  /** The API's words for the last day — "12 October 2026". */
  closes_label: string | null;
  days: number;
  items: { order_item_id: number; returnable: number }[];
  reasons: ReturnOption[];
  max_photos: number;
  max_photo_kb: number;
};

/* ---- The console ---- */

export type AdminReturnItem = {
  id: number;
  order_item_id: number;
  name: string | null;
  variation_name: string | null;
  sku: string | null;
  unit_price_paise: number;
  ordered_quantity: number;
  quantity: number;
  received_quantity: number | null;
  restocked_quantity: number;
};

export type AdminReturn = {
  id: number;
  reference: string;
  status: ReturnStatus;
  status_label: string;
  is_open: boolean;
  reason: string;
  reason_label: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  order_paid: boolean;
  items_count: number;
  photos_count: number;
  refund_paise: number | null;
  requested_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  closed_at: string | null;
  admin_path: string;
  /** Detail read only, from here down. */
  details?: string | null;
  decision_note?: string | null;
  staff_note?: string | null;
  decided_by?: string | null;
  allowed_next?: ReturnOption[];
  items?: AdminReturnItem[];
  photos?: { id: number; name: string; size: number }[];
  suggested_refund_paise?: number;
  refund_reference?: string | null;
  /** Store → Settings: how to send goods back, quoted in the approval email. */
  return_instructions?: string;
  /** The courier's pickup from the customer (0.159.0); null/absent while Shiprocket is off and nothing was booked. */
  pickup?: import("./courier").ReturnPickup | null;
  order?: {
    order_number: string;
    status: string;
    status_label: string;
    total_paise: number;
    payment_method: string | null;
    dispatched_at: string | null;
    completed_at: string | null;
  } | null;
};

export type AdminReturnListMeta = {
  statuses: ReturnOption[];
  reasons: ReturnOption[];
  waiting_count: number;
  open_count: number;
};

/** The order screen's own list of the order's returns. */
export type OrderReturnSummary = {
  reference: string;
  status: ReturnStatus;
  status_label: string;
  reason_label: string;
  items_count: number;
  requested_at: string | null;
  admin_path: string;
};
