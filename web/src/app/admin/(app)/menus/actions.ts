"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createMenu, deleteMenu, getMenuTargets, updateMenu, rebuildMenu } from "@/lib/admin";
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
    /*
      `menus`, not `settings`. This read `updateTag("settings")` under a
      comment about the navigation being on every page — a tag the menu fetch
      does not carry, so saving a menu invalidated the site settings and left
      the menu itself cached for the full 600s. `revalidatePath` re-renders
      the pages, and the re-render then re-read the same stale fetch entry, so
      an editor saved, looked at the site and saw the old navigation. Exactly
      the shape of `admin_path` spelled with the API's resource names: two
      hand-written strings that have to agree and nothing that checks them.
    */
    updateTag("menus");
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
  /*
    `menus`, not `settings` — the same wrong tag `saveMenuAction` carried.

    It matters most here: deleting the *assigned* menu is what falls the site
    back to the built-in navigation, so a stale tag leaves the header
    rendering a menu that no longer exists for up to ten minutes, with
    nothing in the console to explain it.
  */
  updateTag("menus");
  revalidatePath("/", "layout");
  redirect("/admin/menus?done=menu-deleted");
}

export type RebuildState = { error?: string; ok?: string; warnings?: string[] };

/**
 * Replace a location's menu with the navigation the site renders on its own.
 *
 * The one destructive action in this module. It is here rather than behind a
 * plain link because it is a POST that changes the site's header on every page,
 * and because the confirmation has to be able to say what goes.
 *
 * `updateTag("menus")` for the reason `saveMenuAction` does it: the public menu
 * is cached for 600s, so without this an editor rebuilds, looks at the site,
 * and sees the old navigation for up to ten minutes — which reads as the button
 * not working.
 */
export async function rebuildMenuAction(
  _previous: RebuildState,
  formData: FormData,
): Promise<RebuildState> {
  const location = String(formData.get("location") ?? "");

  if (!location) return { error: "We could not tell which menu to rebuild." };

  try {
    const result = await rebuildMenu(location);

    revalidatePath("/admin/menus");
    revalidatePath("/", "layout");
    updateTag("menus");

    return {
      ok: `Rebuilt from the catalogue — ${result.items} item${result.items === 1 ? "" : "s"}.`,
      warnings: result.warnings,
    };
  } catch {
    return { error: "We could not rebuild that menu." };
  }
}
