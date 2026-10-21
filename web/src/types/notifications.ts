export type NotificationPrefs = {
  digest: "off" | "daily" | "weekly";
  digest_hour: number;
  digest_weekday: number;
  digest_skip_quiet: boolean;
  alerts: Record<string, boolean>;
  alert_email: boolean;
  alert_push: boolean;
  quiet_start: string;
  quiet_end: string;
  last_digest_at: string | null;
  /** Mentions and assignments by email and push; the bell fills either way (C2). */
  notify_mentions: boolean;
};

/** One row of the console's bell (C2, docs/notifications.md). `line` is the API's sentence. */
export type StaffNotificationRow = {
  id: number;
  kind: string;
  group: "mention" | "assigned" | "alert";
  line: string;
  path: string | null;
  actor_name: string | null;
  read_at: string | null;
  created_at: string | null;
};

export type StaffNotificationsPage = {
  data: StaffNotificationRow[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    unread: number;
    kinds: { value: string; label: string; group: string }[];
  };
};

export type NotificationRule = { key: string; label: string; threshold_label: string | null; site_enabled: boolean };
export type StaffBrowser = { id: number; label: string | null; last_seen_at: string | null; failed: boolean };

export type NotificationMeta = {
  user: { id: number; name: string };
  self: boolean;
  rules: NotificationRule[];
  push_live: boolean;
  browsers: StaffBrowser[];
  digests: { value: string; label: string }[];
};

export type NotificationSettings = { data: NotificationPrefs; meta: NotificationMeta };
