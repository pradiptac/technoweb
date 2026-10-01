import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = settingsMetadata("/admin/meetings/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default async function MeetingSettingsPage() {
  await requireScreen();
  return <SettingsScreen path="/admin/meetings/settings" />;
}
