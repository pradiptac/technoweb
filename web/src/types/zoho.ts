/**
 * Zoho Books on the wire (docs/store.md "Zoho Books invoices", API.md).
 */

/** What Store → Settings → Zoho Books is told when it opens. */
export type ZohoBooksStatus = {
  enabled: boolean;
  /** The switch and everything it needs: invoices will be made. */
  ready: boolean;
  /** What is still to do, in the order somebody would do it. Empty when nothing is. */
  missing: string[];
  is_connected: boolean;
  account: string | null;
  connected_at: string | null;
  client_configured: boolean;
  data_centre: string;
  organization_id: string | null;
  /** Read from Zoho when the screen opens; empty until an account is connected. */
  organizations: { id: string; name: string }[];
  /** The chosen organisation's taxes and tax groups; empty until one is chosen and saved. */
  taxes: { id: string; name: string; percentage: number; kind: string }[];
  /** Zoho's own words for the last refusal, or null. */
  error: string | null;
  callback_path: string;
  /** Orders whose invoice is queued or being made now. */
  waiting: number;
  /** Orders whose invoice Zoho refused and nobody has dealt with. */
  failed: number;
};

/** On an order in the console: where its Zoho invoice has got to. Null when nothing has been asked. */
export type OrderZohoState = {
  status: "pending" | "creating" | "created" | "failed" | "skipped" | null;
  invoice_id: string | null;
  attempts: number;
  /** Zoho's own words, for staff. */
  error: string | null;
  /** When it will be tried again by itself; null once the automatic attempts have run out. */
  next_attempt_at: string | null;
  synced_at: string | null;
  /** Whether "Create the Zoho invoice" will be taken now. */
  can_create: boolean;
};
