"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createShippingZone, deleteShippingZone, moveShippingZone, saveShippingSettings, updateShippingZone,
} from "@/lib/admin";
import { rupeesToPaise } from "@/lib/money";

export type ShippingFormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

/**
 * A refusal in the API's own words. Every rule about a zone is the API's —
 * one default, a state in one active zone, a rate to quote from — and its
 * sentence says which and why, so it is shown as it came rather than
 * paraphrased into something less useful.
 */
function toState(error: unknown, noun: string): ShippingFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      const first = Object.values(error.errors ?? {}).flat()[0];

      return {
        error: typeof first === "string" ? first : "Check the highlighted fields.",
        fieldErrors: error.errors,
      };
    }

    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Only a store manager or an administrator can change how delivery is charged." };
  }

  return { error: `We could not save the ${noun}. Try again shortly.` };
}

/**
 * What the public site says about delivery — the product page's sentence, the
 * trust strip, the JSON-LD on every cached product page — reads the `store`
 * settings and the product pages' tag, so a change to the mode or the flat
 * charge purges both. `updateTag`, so the person who saved sees it on the
 * next request.
 */
function purgePublic() {
  updateTag("settings");
  updateTag("store-products");
  revalidatePath("/admin/store/shipping");
}

/** The mode, the flat charge and the default weight. */
export async function saveShippingSettingsAction(_p: ShippingFormState, formData: FormData): Promise<ShippingFormState> {
  const flat = rupeesToPaise(String(formData.get("flat") ?? "0")) ;
  const weight = Number(String(formData.get("default_weight") ?? "").replace(/[^\d]/g, ""));

  if (flat === null) return { error: "The flat charge is an amount in rupees, such as 60 or 49.50.", fieldErrors: { flat_paise: ["An amount in rupees."] } };
  if (!weight || weight < 1) return { error: "The default weight is a whole number of grams, at least 1.", fieldErrors: { default_weight_grams: ["At least 1 gram."] } };

  try {
    await saveShippingSettings({
      mode: String(formData.get("mode") ?? "flat") === "zones" ? "zones" : "flat",
      flat_paise: flat,
      default_weight_grams: weight,
    });
  } catch (error) {
    return toState(error, "delivery settings");
  }

  purgePublic();

  return { ok: true };
}

/** The zone form's fields as the API takes them. Rupees become paise by parsing the text. */
function zonePayload(formData: FormData): Record<string, unknown> {
  const optionalPaise = (key: string) => {
    const input = String(formData.get(key) ?? "").trim();

    return input === "" ? null : rupeesToPaise(input);
  };

  const isDefault = formData.get("is_default") === "1";
  const delivers = isDefault ? true : formData.get("delivers") !== "0";

  // Slabs arrive as one JSON value built by the repeater, in the order typed.
  let rates: unknown = [];

  try {
    rates = JSON.parse(String(formData.get("rates") ?? "[]"));
  } catch {
    rates = [];
  }

  return {
    name: String(formData.get("name") ?? "").trim(),
    is_default: isDefault,
    delivers,
    is_active: isDefault ? true : formData.get("is_active") === "1",
    states: isDefault ? [] : formData.getAll("states").map(String),
    free_above_paise: delivers ? optionalPaise("free_above") : null,
    extra_per_kg_paise: delivers ? optionalPaise("extra_per_kg") : null,
    rates: delivers ? rates : [],
  };
}

export async function saveShippingZoneAction(_p: ShippingFormState, formData: FormData): Promise<ShippingFormState> {
  const id = Number(formData.get("id")) || 0;

  try {
    if (id) await updateShippingZone(id, zonePayload(formData));
    else await createShippingZone(zonePayload(formData));
  } catch (error) {
    return toState(error, "zone");
  }

  revalidatePath("/admin/store/shipping");

  return { ok: true };
}

/** Deleted only once the API accepted it: a refusal reports itself and purges nothing. */
export async function deleteShippingZoneAction(_p: ShippingFormState, formData: FormData): Promise<ShippingFormState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "Missing zone." };

  try {
    await deleteShippingZone(id);
  } catch (error) {
    return toState(error, "zone");
  }

  revalidatePath("/admin/store/shipping");

  return { ok: true };
}

export async function moveShippingZoneAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const direction = formData.get("direction") === "up" ? "up" : "down";

  if (!id) return;

  try {
    await moveShippingZone(id, direction);
  } catch {
    // A move that was not made leaves the list as it was, which the next render shows.
  }

  revalidatePath("/admin/store/shipping");
}
