"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { createBlock, deleteBlock, duplicateBlock, updateBlock, type BlockPayload } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import type { BlockType } from "@/types/api";

export type BlockState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The block's content arrives as one JSON field, the slide repeater's rule:
 * the form already holds it as nested objects — plans inside sets, items
 * inside groups — and flattening that into numbered input names only to
 * parse it back would make every reorder a renaming of every input after it.
 */
function payload(formData: FormData, creating: boolean): BlockPayload {
  let content: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(String(formData.get("content") ?? ""));
    content = parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    content = undefined;
  }

  return {
    ...(creating ? { type: String(formData.get("type")) as BlockType } : {}),
    layout: String(formData.get("layout") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "draft"),
    is_default: formData.get("is_default") === "1",
    content,
  };
}

function fail(error: unknown): BlockState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Some fields need attention.", fieldErrors: error.errors };
    return { error: error.message };
  }
  return { error: "We could not save that. Try again." };
}

/**
 * `blocks` refreshes the default band's read on every page and `block:<slug>`
 * the shortcode reads — both, on every save, because a block that stops being
 * the default and a block whose words changed are both things a page shows.
 */
function refresh(slug: string) {
  updateTag("blocks");
  updateTag(`block:${slug}`);
}

export async function createBlockAction(_prev: BlockState, formData: FormData): Promise<BlockState> {
  let to: string;
  try {
    const block = await createBlock(payload(formData, true));
    to = `/admin/blocks/${block.type}/${block.id}`;
    refresh(block.slug);
  } catch (error) {
    return fail(error);
  }
  redirect(`${to}?done=block-saved`);
}

export async function updateBlockAction(id: number, previousSlug: string, _prev: BlockState, formData: FormData): Promise<BlockState> {
  let to: string;
  try {
    const block = await updateBlock(id, payload(formData, false));
    to = `/admin/blocks/${block.type}/${block.id}`;
    refresh(block.slug);
    if (previousSlug !== block.slug) updateTag(`block:${previousSlug}`);
  } catch (error) {
    return fail(error);
  }
  redirect(`${to}?done=block-saved`);
}

export async function duplicateBlockAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const type = String(formData.get("type") ?? "");
  let copy: number;
  try {
    copy = (await duplicateBlock(id)).id;
  } catch {
    redirect(`/admin/blocks/${type}/${id}?done=block-not-copied`);
  }
  redirect(`/admin/blocks/${type}/${copy}?done=block-copied`);
}

export async function deleteBlockAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  const type = String(formData.get("type") ?? "");
  try {
    await deleteBlock(id);
    refresh(slug);
  } catch {
    redirect(`/admin/blocks/${type}/${id}?done=block-not-deleted`);
  }
  redirect(`/admin/blocks/${type}?done=block-deleted`);
}
