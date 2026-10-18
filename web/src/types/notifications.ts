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
