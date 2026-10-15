"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { paletteFromLogo } from "@/lib/admin";
import type { LogoPalette } from "@/types/api";

export type LogoPaletteState = { palette?: LogoPalette; error?: string };

/**
 * The palettes the logo offers (0.173.0, `docs/theming.md` "Brand from a
 * logo").
 *
 * It reads and never writes: the answer fills the Themes screen's Custom
 * colours fields and Save is what applies them. Every refusal comes back as
 * **the API's own sentence** — which logo it could not read, or that the logo
 * is black, white or grey and there is nothing to take — because that
 * sentence says what to do next, where "something went wrong" does not. The
 * `importMediaUrlAction` shape (0.172.0).
 */
export async function paletteFromLogoAction(path?: string): Promise<LogoPaletteState> {
  try {
    return { palette: await paletteFromLogo(path?.trim() || undefined) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Only an administrator can read a palette from the logo." };

      const named = error.errors?.path?.[0];
      if (named) return { error: named };
      if (error.message) return { error: error.message };
    }

    return { error: "The logo's colours could not be read. Try again, or type your colours in below." };
  }
}
