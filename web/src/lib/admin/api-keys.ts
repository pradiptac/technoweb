import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { Paginated } from "@/types/api";
import type { AdminApiKey, ApiKeyDayCount, ApiKeyRequestRow, ApiScopeOption } from "@/types/api-keys";

/**
 * API keys — `role:admin`, beside webhooks.
 *
 * `createApiKey` and `rollApiKey` answer the row with `key` on it and nowhere
 * else: the API stores only a hash, so the form has to show it the moment it
 * arrives. The write fields are `name`, `scopes[]`, `expires_at` and
 * `allowed_ips` — never one called `key`.
 */
export type ApiKeyPayload = Partial<{
  name: string; scopes: string[]; expires_at: string | null; allowed_ips: string;
}>;

export async function getApiKeys(params: { page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<AdminApiKey> & { meta: { scopes: ApiScopeOption[]; base_url: string } }>(
    `/admin/api-keys${query(params)}`,
    { token: await token() },
  );
}

/** The scope options and base URL alone, for the *new* screen, which has no record to read them from. */
export async function getApiKeyMeta() {
  const res = await getApiKeys({ per_page: 1 });
  return res.meta;
}

export async function getApiKey(id: number): Promise<AdminApiKey> {
  const res = await apiFetch<{ data: AdminApiKey }>(`/admin/api-keys/${id}`, { token: await token() });
  return res.data;
}

export async function createApiKey(payload: ApiKeyPayload): Promise<AdminApiKey> {
  const res = await apiFetch<{ data: AdminApiKey }>("/admin/api-keys", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateApiKey(id: number, payload: ApiKeyPayload): Promise<AdminApiKey> {
  const res = await apiFetch<{ data: AdminApiKey }>(`/admin/api-keys/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteApiKey(id: number): Promise<void> {
  await apiFetch(`/admin/api-keys/${id}`, { method: "DELETE", token: await token() });
}

/** A new key in place of the old one; the old one stops working at once. */
export async function rollApiKey(id: number): Promise<AdminApiKey> {
  const res = await apiFetch<{ data: AdminApiKey }>(`/admin/api-keys/${id}/roll`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function revokeApiKey(id: number): Promise<AdminApiKey> {
  const res = await apiFetch<{ data: AdminApiKey }>(`/admin/api-keys/${id}/revoke`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function getApiKeyRequests(
  id: number,
  params: { status?: string; page?: number; per_page?: number } = {},
) {
  return apiFetch<Paginated<ApiKeyRequestRow> & { meta: { counts: ApiKeyDayCount[] } }>(
    `/admin/api-keys/${id}/requests${query(params)}`,
    { token: await token() },
  );
}
