"use server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * The bell's two presses, through the Next server — the API is never called
 * from the browser. A signed-in customer's portal token is forwarded so the
 * API stamps the account on the subscription and order updates reach this
 * browser; a guest's is broadcast-only. The API answers 202 whatever
 * happened, so there is nothing to report beyond "done".
 */
export async function subscribePushAction(token: string): Promise<{ ok: boolean }> {
  try {
    await apiFetch("/messaging/push/subscribe", { method: "POST", body: { token }, token: await getToken() });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function unsubscribePushAction(token: string): Promise<{ ok: boolean }> {
  try {
    await apiFetch("/messaging/push/unsubscribe", { method: "POST", body: { token } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
