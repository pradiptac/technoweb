import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/messaging/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function MessagingSettingsPage() {
  return <SettingsScreen path="/admin/messaging/settings" />;
}
