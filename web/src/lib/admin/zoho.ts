import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { ZohoBooksStatus } from "@/types/zoho";

/**
 * Zoho Books (docs/store.md "Zoho Books invoices"): the connection and its
 * test are `role:admin`; making one order's invoice is a store manager's.
 */

export async function getZohoBooksStatus(): Promise<ZohoBooksStatus> {
  const res = await apiFetch<{ data: ZohoBooksStatus }>("/admin/settings/zoho-books", { token: await token() });

  return res.data;
}

/** The consent URL. The callback is this site's own path, which the API checks exactly. */
export async function authorizeZohoBooks(origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/settings/zoho-books/authorize", {
    method: "POST", body: { redirect_uri: `${origin}/admin/store/settings/zoho/callback` }, token: await token(),
  });

  return res.data.url;
}

export async function completeZohoBooks(code: string, state: string): Promise<string> {
  const res = await apiFetch<{ data: { account: string } }>("/admin/settings/zoho-books/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });

  return res.data.account;
}

export async function disconnectZohoBooks(): Promise<void> {
  await apiFetch("/admin/settings/zoho-books/disconnect", { method: "POST", token: await token() });
}

/** One real read with what is saved. A refusal is a 422 carrying Zoho's own words. */
export async function testZohoBooks(): Promise<{ taxes: number; ready: boolean; missing: string[] }> {
  const res = await apiFetch<{ data: { taxes: number; ready: boolean; missing: string[] } }>("/admin/settings/zoho-books/test", {
    method: "POST", token: await token(),
  });

  return res.data;
}

/** Make this order's invoice now. Answers the invoice number; a refusal is a 422 in Zoho's words. */
export async function createZohoInvoice(orderNumber: string): Promise<{ status: string; invoice_number: string | null }> {
  const res = await apiFetch<{ data: { status: string; invoice_number: string | null } }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/zoho-invoice`,
    { method: "POST", token: await token() },
  );

  return res.data;
}
