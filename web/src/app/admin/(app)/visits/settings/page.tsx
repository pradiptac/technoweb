import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/visits/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function VisitSettingsPage() {
  return <SettingsScreen path="/admin/visits/settings" />;
}
