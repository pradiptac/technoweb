import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/site/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function SiteSettingsPage() {
  return <SettingsScreen path="/admin/site/settings" />;
}
