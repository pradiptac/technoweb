"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { addDigitalCodes, deleteDigitalCode, revealDigitalCode } from "@/lib/admin";

export type CodeActionState = { error?: string; ok?: string };

function toState(error: unknown, fallback: string): CodeActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage the store." };
    if (error.message) return { error: error.message };
  }

  return { error: fallback };
}

export async function addCodesAction(
  _previous: CodeActionState,
  formData: FormData,
): Promise<CodeActionState> {
  const productId = Number(formData.get("product_id"));
  const codes = String(formData.get("codes") ?? "").trim();

  if (!productId) return { error: "Missing product." };
  if (!codes) return { error: "Paste some codes first." };

  let result: { added: number; duplicates: number };

  try {
    result = await addDigitalCodes(productId, codes);
  } catch (error) {
    return toState(error, "We could not add those codes.");
  }

  revalidatePath(`/admin/store/products/${productId}/codes`);

  /*
    The duplicate count is *said*, not swallowed.

    Pasting the same block twice is an ordinary mistake, and reporting only
    "added 0" would leave somebody wondering whether the paste worked at all.
  */
  const added = result.added === 1 ? "One code added." : `${result.added} codes added.`;

  return {
    ok: result.duplicates > 0
      ? `${added} ${result.duplicates} were already in the inventory and were skipped.`
      : added,
  };
}

/**
 * Reading one code, which is recorded.
 *
 * Returns the code to the component rather than rendering it into the page, so
 * a listing never carries one in its HTML — the reveal is a deliberate act and
 * the result lives only in the browser that asked.
 */
export async function revealCodeAction(id: number): Promise<{ code?: string; error?: string }> {
  try {
    const result = await revealDigitalCode(id);

    return { code: result.code };
  } catch (error) {
    return toState(error, "We could not read that code.");
  }
}

export async function deleteCodeAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (!id) return;

  await deleteDigitalCode(id).catch(() => null);

  // The path is not known here, so the whole section is revalidated: a code
  // list is small and this happens rarely.
  revalidatePath("/admin/store/products", "layout");
}
