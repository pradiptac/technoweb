import { SettingsScreen, settingsMetadata } from "./settings-screen";

export const metadata = settingsMetadata("/admin/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function AdminSettingsPage() {
  return <SettingsScreen path="/admin/settings" />;
}
