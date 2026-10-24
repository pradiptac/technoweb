import { SettingsScreen, settingsMetadata } from "../settings-screen";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = settingsMetadata("/admin/settings/social");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default async function SocialAccountsPage() {
  await requireScreen();
  return <SettingsScreen path="/admin/settings/social" />;
}
