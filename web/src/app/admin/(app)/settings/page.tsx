import { SettingsScreen, settingsMetadata } from "./settings-screen";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = settingsMetadata("/admin/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default async function AdminSettingsPage() {
  await requireScreen();
  return <SettingsScreen path="/admin/settings" />;
}
