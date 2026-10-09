import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { PreviewLink, PreviewLinkRead, PreviewType } from "@/types/api";

/**
 * Draft share links (0.138.0, `docs/admin-console.md`). One read, one create
 * (which replaces), one revoke — the API narrows each to the role that owns
 * the record's kind, so the same call answers 403 for an account that may
 * edit the record's screen but not share it.
 */

/**
 * The record's link, or **null when this account cannot share it** (a 403),
 * or the API predates the route (a 404). The panel draws nothing for null:
 * a share button the account would only be refused on is worse than none.
 */
export async function getPreviewLink(type: PreviewType, id: number): Promise<PreviewLinkRead | null> {
  try {
    return await apiFetch<PreviewLinkRead>(`/admin/preview-links${query({ type, id })}`, { token: await token() });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

/** Makes a link for the record, replacing any it had. */
export async function createPreviewLink(payload: { type: PreviewType; id: number; days: number }): Promise<PreviewLink> {
  const res = await apiFetch<{ data: PreviewLink }>("/admin/preview-links", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function revokePreviewLink(id: number): Promise<void> {
  await apiFetch(`/admin/preview-links/${id}`, { method: "DELETE", token: await token() });
}
