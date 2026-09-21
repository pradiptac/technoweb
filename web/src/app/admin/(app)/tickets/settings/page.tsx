import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/tickets/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function InboundMailPage() {
  return <SettingsScreen path="/admin/tickets/settings" />;
}
