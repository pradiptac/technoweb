"use server";

import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import { testShiprocket } from "@/lib/admin";
import { revalidateSettingsScreens } from "./revalidate";

export type ShiprocketResult = { ok?: string; error?: string };

/**
 * "Test the connection" (docs/store.md "Shiprocket"): signs in to Shiprocket
 * afresh and lists the pickup locations — the only two calls there are that
 * change nothing in the account. Shiprocket has no test mode, so this is
 * deliberately all it does; a booking is only ever made from an order.
 *
 * The answer is Shiprocket's own words where it refused: they name what is
 * wrong with the credentials.
 */
export async function testShiprocketAction(): Promise<ShiprocketResult> {
  try {
    const result = await testShiprocket();
    revalidateSettingsScreens();

    return { ok: result.message };
  } catch (error) {
    revalidateSettingsScreens();

    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Only an administrator can test the Shiprocket connection." };

      return { error: error.message || "Shiprocket did not answer." };
    }

    return { error: "Shiprocket did not answer." };
  }
}
