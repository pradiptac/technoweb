import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/customers/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function PortalSettingsPage() {
  return <SettingsScreen path="/admin/customers/settings" />;
}
