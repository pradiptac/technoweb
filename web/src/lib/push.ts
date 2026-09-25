import type { SiteSettings } from "@/lib/site-settings";
import { settingEnabled } from "@/lib/site-settings";

/**
 * The browser half of Firebase, read from the public settings — pure, so a
 * server component can hand it to the bell without importing anything that
 * fetches (the `lib/settings.ts` / `lib/site-settings.ts` split).
 *
 * Null unless push is live: the API's `push_live` bit says a provider, its
 * service account and all five of these are set, so the bell is never drawn
 * for a channel that cannot deliver.
 */
export type PushConfig = {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

export function pushConfigFrom(settings: SiteSettings): PushConfig | null {
  if (!settingEnabled(settings, "push_live", false)) return null;

  const config = {
    apiKey: settings.push_api_key ?? "",
    projectId: settings.push_project_id ?? "",
    messagingSenderId: settings.push_messaging_sender_id ?? "",
    appId: settings.push_app_id ?? "",
    vapidKey: settings.push_vapid_key ?? "",
  };

  return Object.values(config).every(Boolean) ? config : null;
}

/**
 * Whether the bell must wait for the cookie question: the banner is drawn
 * (consent on and an analytics tag configured — `(marketing)/layout.tsx`'s
 * rule), so a second permission prompt must not arrive on top of it.
 */
export function consentGateFrom(settings: SiteSettings): boolean {
  return settings.cookie_consent_enabled === "1"
    && Boolean(settings.google_analytics_id || settings.google_tag_manager_id || settings.meta_pixel_id);
}
