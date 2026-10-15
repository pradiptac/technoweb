"use server";

import { revalidatePath } from "next/cache";
import { setNotFoundIgnored } from "@/lib/admin";

export type IgnoreState = { error?: string };

/**
 * "Not worth a redirect" for one address, and its undo.
 *
 * One action for both, told which by the form: the two buttons are the same
 * control on two views of the list. Ignored rather than deleted so the address
 * does not climb straight back onto the list on its next request — the row's
 * `ignored_at` survives a repeat, which is what makes ignoring last.
 */
export async function ignoreAddressAction(
  _previous: IgnoreState,
  formData: FormData,
): Promise<IgnoreState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "That address could not be found." };

  try {
    await setNotFoundIgnored(id, formData.get("ignored") === "1");
  } catch {
    return { error: "We could not update that address." };
  }

  revalidatePath("/admin/not-found");

  return {};
}
