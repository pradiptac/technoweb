import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";

export const metadata = settingsMetadata("/admin/leads/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default function LeadScoringPage() {
  return <SettingsScreen path="/admin/leads/settings" />;
}
