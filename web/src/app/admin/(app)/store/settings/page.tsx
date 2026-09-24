import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/store/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function StoreSettingsPage() {
  return <SettingsScreen path="/admin/store/settings" />;
}
