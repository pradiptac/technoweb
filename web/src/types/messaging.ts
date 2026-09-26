/**
 * Messaging channels — WhatsApp, RCS and browser push (Phase 2, stream B).
 *
 * Every list here (channels, providers, events, placeholders, categories,
 * audiences) arrives from the API on `meta` or a status read, never typed in
 * TypeScript: the enums in `App\Enums` are the only copy.
 */

export type MessageChannelValue = "whatsapp" | "rcs" | "push";

export type MessagingProviderOption = {
  value: string;
  label: string;
  blurb: string;
  fields: string[];
  available: boolean;
  configured: boolean;
  /** Where the provider posts back. Null for push, which has no webhook. */
  webhook_url: string | null;
  /** Whether that URL needs `?token=<messaging_webhook_secret>` on the end. */
  webhook_secret_param: boolean;
};

export type MessagingChannelStatus = {
  value: MessageChannelValue;
  label: string;
  /** The setting that records the provider, `messaging_<channel>_provider`. */
  setting: string;
  provider: string | null;
  ready: boolean;
  address_kind: "phone" | "token";
  needs_approval: boolean;
  /** Why the credentials were last refused — the `mail_error` pattern. */
  error: string | null;
  providers: MessagingProviderOption[];
};

export type MessagingStatus = {
  channels: MessagingChannelStatus[];
  quiet_hours: { start: string; end: string; open_now: boolean; next_opening: string; timezone: string };
  queue?: { driver: string; known: boolean; pending?: number; failed?: number; oldest_seconds?: number | null };
};

export type MessageButton = { type: "reply" | "url" | "phone"; text: string; value: string };

export type MessageTemplate = {
  id: number;
  channel: MessageChannelValue;
  channel_label: string;
  key: string;
  name: string;
  body: string;
  header_text: string | null;
  media_path: string | null;
  media_url: string | null;
  buttons: MessageButton[];
  push_title: string | null;
  push_link: string | null;
  category: string | null;
  language: string | null;
  provider_template_name: string | null;
  provider_template_id: string | null;
  approval_status: "not_required" | "draft" | "pending" | "approved" | "rejected" | "paused";
  approval_label: string;
  approval_reason: string | null;
  sendable: boolean;
  placeholders: string[];
  submitted_at: string | null;
  synced_at: string | null;
  updated_at: string | null;
};

export type MessageTemplateMeta = {
  channels: { value: MessageChannelValue; label: string; needs_approval: boolean; ready: boolean; provider: string | null }[];
  events: { value: string; label: string; promotional: boolean; placeholders: string[] }[];
  common_placeholders: string[];
  /** One believable value per placeholder, for the phone preview. */
  samples: Record<string, string>;
  categories: string[];
  approvals: { value: string; label: string }[];
};

export type MessageAutomationCell = {
  event: string;
  event_label: string;
  promotional: boolean;
  channel: MessageChannelValue;
  message_template_id: number | null;
  is_enabled: boolean;
  /** Switched on and able to send right now. */
  live: boolean;
  /** Why a switched-on cell sends nothing. */
  reason: string | null;
};

export type MessageAutomationMeta = {
  channels: { value: MessageChannelValue; label: string; ready: boolean }[];
  templates: { id: number; channel: MessageChannelValue; name: string; sendable: boolean; approval_label: string }[];
};

export type MessageContact = {
  id: number;
  channel: MessageChannelValue;
  channel_label: string;
  /** A push token is shortened to its first twelve characters. */
  address: string;
  name: string | null;
  customer?: { id: number; name: string; email: string } | null;
  source: string | null;
  is_active: boolean;
  opted_in_at: string | null;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  last_sent_at: string | null;
};

export type MessageBroadcastReport = {
  counts: Record<"pending" | "sent" | "delivered" | "read" | "failed" | "skipped", number>;
  total: number;
  sent: number;
  /** Delivered or read over sent; null before anything has been sent. */
  delivery_rate: number | null;
  read_rate: number | null;
  failures: { id: number; address: string; error: string | null; at: string | null }[];
};

export type MessageBroadcast = {
  id: number;
  name: string;
  channel: MessageChannelValue;
  channel_label: string;
  message_template_id: number | null;
  template?: { id: number; name: string; approval_status: string; sendable: boolean } | null;
  audience: "opt_ins" | "customers" | "newsletter_group" | "wishlist";
  audience_label: string;
  newsletter_group_id: number | null;
  store_product_id: number | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  status_label: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  recipient_count: number;
  created_at: string | null;
  /** Live, while nothing has been frozen into it (draft or scheduled). */
  audience_count?: number;
  /** Once it has been queued. */
  report?: MessageBroadcastReport;
};

export type MessageBroadcastMeta = {
  channels: { value: MessageChannelValue; label: string; ready: boolean }[];
  audiences: { value: string; label: string; blurb: string }[];
  statuses: { value: string; label: string }[];
  wishlists: boolean;
  groups: { id: number; name: string }[];
  products: { id: number; name: string }[];
  templates: { id: number; channel: MessageChannelValue; name: string; sendable: boolean; approval_label: string }[];
  quiet_hours: { start: string; end: string; open_now: boolean; next_opening: string };
};

/** The portal's view of a customer's own channels. */
export type MessagingPreferences = {
  phone: string | null;
  channels: { channel: MessageChannelValue; label: string; live: boolean; opted_in: boolean; devices: number | null }[];
};
