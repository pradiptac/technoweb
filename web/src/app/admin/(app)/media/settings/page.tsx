import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/media/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function MediaSettingsPage() {
  return <SettingsScreen path="/admin/media/settings" />;
}
