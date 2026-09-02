"use client";

import { useRouter } from "next/navigation";
import { MenuBuilder } from "./menu-builder";
import { saveMenuAction } from "./actions";
import type { Menu, MenuLocationOption, MenuSectionOption, MenuTypeOption } from "@/types/api";

/**
 * The thin client wrapper that owns the save call.
 *
 * `lib/admin.ts` is `server-only`, so the builder cannot call it — everything
 * goes through the Server Action. This exists so the builder stays a pure
 * editor of a tree, with no opinion about where the tree is stored, which is
 * what lets the new and edit screens share it unchanged.
 */
export function MenuEditor({
  menu, meta,
}: {
  menu: Menu | null;
  meta: {
    locations: MenuLocationOption[];
    types: MenuTypeOption[];
    sections: MenuSectionOption[];
    max_depth: number;
  };
}) {
  const router = useRouter();

  return (
    <MenuBuilder
      initialName={menu?.name ?? ""}
      initialLocation={menu?.location ?? null}
      initialItems={menu?.items ?? []}
      locations={meta.locations}
      types={meta.types}
      sections={meta.sections}
      maxDepth={meta.max_depth}
      onSave={async (payload) => {
        const outcome = await saveMenuAction(menu?.id ?? null, payload);

        /*
          A new menu moves to its own URL once it has one, so a second Save
          updates rather than creating a second menu. Without this the screen
          still says "New menu" and every press makes another one — the same
          shape of bug as a form that posts twice.
        */
        if (outcome.ok && menu === null && outcome.id) {
          router.replace(`/admin/menus/${outcome.id}`);
        }

        return outcome;
      }}
    />
  );
}
