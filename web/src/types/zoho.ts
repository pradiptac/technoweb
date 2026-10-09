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
  /** Payments and credit notes (0.136.0). Absent from an API older than that. */
  payments?: ZohoPaymentsStatus;
};

/** What the Zoho Books tab needs to offer a deposit account for each way of paying. */
export type ZohoPaymentsStatus = {
  /** The switch: payments and refunds are sent at all. */
  enabled: boolean;
  /** Connected under a consent from before payments: connect again. */
  reconnect_needed: boolean;
  /** Zoho's bank, cash and clearing accounts; empty until an organisation is saved. */
  accounts: { id: string; name: string; type: string }[];
  methods: {
    value: string;
    /** Lower-case, to follow "Account for …": "cash on delivery". */
    label: string;
    /** The settings key the chosen account is saved under. */
    setting: string;
    account_id: string | null;
    /** Whether the shop offers this way of paying now. */
    offered: boolean;
  }[];
  /** What still stands between a payment and Zoho, as sentences. Never blocks invoices. */
  missing: string[];
  waiting: number;
  failed: number;
};

/** On one payment or refund in the console: where it stands in Zoho Books. */
export type PaymentZohoState = {
  /** A payment that arrived is a customer payment there; a refund is a credit note. */
  kind: "payment" | "credit_note";
  status: "pending" | "sending" | "sent" | "failed" | "skipped" | null;
  /** The credit note's number, once made. */
  number: string | null;
  /** Zoho's own words, for staff. */
  error: string | null;
  attempts: number;
  synced_at: string | null;
  /** Whether "Send to Zoho Books" will be taken now. */
  can_send: boolean;
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
