import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/blog/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function BlogSettingsPage() {
  return <SettingsScreen path="/admin/blog/settings" />;
}
