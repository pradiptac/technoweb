"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createMenu, deleteMenu, getMenuTargets, updateMenu } from "@/lib/admin";
import type { MenuItemPayload, MenuTarget } from "@/lib/admin";
import { ApiError } from "@/lib/api";

/**
 * The builder is a client component and `lib/admin.ts` is `server-only`, so
 * every call it makes comes through here — the same rule `lib/settings.ts`
 * documents for `telHref`. Its *types* may cross the boundary; its functions
 * may not.
 */
export async function lookupTargetsAction(type: string, q: string): Promise<MenuTarget[]> {
  try {
    return await getMenuTargets(type, q);
  } catch {
    // A failed lookup empties the list rather than throwing into a component
    // that is mid-keystroke. The Select then says "Choose…" and nothing else,
    // which is the honest rendering of "we could not ask".
    return [];
  }
}

type SavePayload = { name: string; location: string | null; items: unknown[] };

export async function saveMenuAction(
  id: number | null,
  payload: SavePayload,
): Promise<{ ok?: boolean; error?: string; id?: number }> {
  try {
    const body = {
      name: payload.name,
      location: payload.location,
      items: payload.items as MenuItemPayload[],
    };

    const menu = id === null ? await createMenu(body) : await updateMenu(id, body);

    /*
      The navigation is on every page, so the whole site is stale after this —
      not one route. `updateTag` rather than `revalidateTag`, for
      read-your-own-writes: an editor who has just saved must see the new menu
      on the site immediately rather than waiting out the revalidate window.
    */
    updateTag("settings");
    revalidatePath("/", "layout");
    revalidatePath("/admin/menus");

    return { ok: true, id: menu.id };
  } catch (error) {
    if (error instanceof ApiError) {
      /*
        A 422 here is nested — `items.0.children.0.url` — and the builder has
        no field to hang that on, because the row it belongs to may be
        collapsed or scrolled away. So the first message is surfaced whole
        rather than mapped: it names the item in its own text, which is why
        the API writes those sentences the way it does.
      */
      const first = error.errors ? Object.values(error.errors)[0]?.[0] : null;
      return { error: first ?? error.message };
    }

    return { error: "That could not be saved. Try again." };
  }
}

export async function deleteMenuAction(id: number): Promise<void> {
  await deleteMenu(id);
  updateTag("settings");
  revalidatePath("/", "layout");
  redirect("/admin/menus?done=menu-deleted");
}
