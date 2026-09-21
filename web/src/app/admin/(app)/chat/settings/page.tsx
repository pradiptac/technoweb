import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/chat/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function AssistantSettingsPage() {
  return <SettingsScreen path="/admin/chat/settings" />;
}
