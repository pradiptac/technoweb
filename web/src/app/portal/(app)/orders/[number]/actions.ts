"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api";
import { requestMyReturn } from "@/lib/portal";
import { returnPayload } from "@/lib/return-payload";
import type { ReturnFormState } from "@/components/store/return-form";

/**
 * A return of one of the customer's own orders (docs/store.md "Returns") —
 * the path the form takes without photographs. The API decides whether the
 * order may return anything and how much; this only words its answer.
 */
export async function requestMyReturnAction(
  orderNumber: string,
  _prev: ReturnFormState,
  formData: FormData,
): Promise<ReturnFormState> {
  try {
    const { message } = await requestMyReturn(orderNumber, returnPayload(formData));
    revalidatePath(`/portal/orders/${orderNumber}`);

    return { ok: message };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/portal/login");
      if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      if (error.status === 429) return { error: "That is a lot of requests in a short time. Wait a minute and try again." };
      if (error.status === 404) return { error: "That order could not be found." };
    }

    return { error: "We could not send that. Try again shortly, or raise a ticket." };
  }
}
