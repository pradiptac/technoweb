"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createCoupon, deleteCoupon, updateCoupon } from "@/lib/admin";
import { rupeesToPaise } from "@/lib/money";

export type CouponFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The value field means two things, and this is where the decision is made.
 *
 * A percentage is a plain whole number; a fixed amount is rupees, converted to
 * paise by **parsing the text** rather than multiplying — `parseFloat("500.10")
 * * 100` is 50009.999999999996 in this runtime, and `Math.round` hides that
 * until the day it does not.
 */
function payload(formData: FormData): Record<string, unknown> {
  const type = String(formData.get("type") ?? "percentage");
  const raw = String(formData.get("value") ?? "").trim();

  const value = type === "percentage"
    ? Number(raw.replace(/[^\d]/g, "")) || 0
    : rupeesToPaise(raw) ?? 0;

  const optionalPaise = (key: string) => {
    const input = String(formData.get(key) ?? "").trim();

    return input === "" ? null : rupeesToPaise(input);
  };

  const optionalNumber = (key: string) => {
    const input = String(formData.get(key) ?? "").trim();

    return input === "" ? null : Number(input);
  };

  const optionalText = (key: string) => {
    const input = String(formData.get(key) ?? "").trim();

    return input === "" ? null : input;
  };

  return {
    code: String(formData.get("code") ?? "").trim(),
    type,
    value,
    minimum_order_paise: optionalPaise("minimum_order"),
    maximum_discount_paise: type === "percentage" ? optionalPaise("maximum_discount") : null,
    starts_at: optionalText("starts_at"),
    ends_at: optionalText("ends_at"),
    usage_limit: optionalNumber("usage_limit"),
    per_customer_limit: optionalNumber("per_customer_limit"),
    is_active: formData.get("is_active") === "1",
    description: optionalText("description"),
  };
}

function toState(error: unknown): CouponFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      return {
        // The API's own sentence when it sent one — "a percentage discount
        // cannot be more than 100" says which field and why.
        error: error.errors ? "Check the highlighted fields." : error.message,
        fieldErrors: error.errors,
      };
    }

    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage the store." };
  }

  return { error: "We could not save the code. Try again shortly." };
}

export async function createCouponAction(
  _previous: CouponFormState,
  formData: FormData,
): Promise<CouponFormState> {
  try {
    await createCoupon(payload(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/store/coupons");
  redirect("/admin/store/coupons?done=coupon-saved");
}

export async function updateCouponAction(
  _previous: CouponFormState,
  formData: FormData,
): Promise<CouponFormState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "Missing code." };

  try {
    await updateCoupon(id, payload(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/store/coupons");
  redirect("/admin/store/coupons?done=coupon-saved");
}

export async function deleteCouponAction(formData: FormData) {
  const id = Number(formData.get("id"));

  if (!id) return;

  try {
    await deleteCoupon(id);
  } catch {
    /*
      A used code cannot be deleted and the API says so with a 422. Redirecting
      to the list with a "could not delete" is the honest outcome — the form has
      already gone by the time this resolves, so there is nowhere to report into.
    */
    redirect("/admin/store/coupons?done=coupon-in-use");
  }

  revalidatePath("/admin/store/coupons");
  redirect("/admin/store/coupons?done=coupon-deleted");
}
