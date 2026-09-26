import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = settingsMetadata("/admin/blog/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default async function BlogSettingsPage() {
  await requireScreen();
  return <SettingsScreen path="/admin/blog/settings" />;
}
