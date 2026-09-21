import "server-only";
import { revalidatePath } from "next/cache";
import { SCREENS } from "./settings-copy";

/**
 * Every settings screen, refreshed at once.
 *
 * The settings rows are drawn on ten screens now, and the actions that
 * change them — a save, a cleared secret, a mailbox connected or
 * disconnected, a provider test that writes an error row — used to
 * `revalidatePath("/admin/settings")` by name. Connect a support mailbox
 * from Tickets → Email to ticket and that line refreshes the wrong screen:
 * the panel you are looking at keeps showing "not connected". One helper,
 * derived from `SCREENS`, so a screen added there is refreshed without
 * anybody remembering to add a line here.
 */
export function revalidateSettingsScreens(): void {
  for (const screen of SCREENS) revalidatePath(screen.path);
}
