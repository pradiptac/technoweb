import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  LinkedInOrganization, SocialAccountsStatus, SocialPost, SocialPostList,
} from "@/types/social-posts";

/**
 * LinkedIn and X posts, as the console reads and writes them (C7,
 * docs/social-posts.md). Every sentence is the API's: a refusal arrives as a
 * 422 on `text` and is drawn as it is.
 */

export async function getSocialPosts(params: { status?: string; network?: string; page?: number; per_page?: number } = {}): Promise<SocialPostList> {
  return apiFetch<SocialPostList>(`/admin/social-posts${query(params)}`, { token: await token() });
}

/**
 * Edit and approve are one request, so what goes out is exactly what was on
 * screen. `open_url` is where a person finishes the share themselves.
 */
export async function approveSocialPost(id: number, text: string, confirm: boolean): Promise<{ post: SocialPost; open_url: string | null }> {
  const res = await apiFetch<{ data: SocialPost; meta: { open_url: string | null } }>(`/admin/social-posts/${id}/approve`, {
    method: "POST", body: { text, ...(confirm ? { confirm: true } : {}) }, token: await token(),
  });

  return { post: res.data, open_url: res.meta?.open_url ?? null };
}

export async function discardSocialPost(id: number): Promise<SocialPost> {
  const res = await apiFetch<{ data: SocialPost }>(`/admin/social-posts/${id}/discard`, {
    method: "POST", token: await token(),
  });

  return res.data;
}

/** A fresh pair (LinkedIn, X) for a published record. */
export async function draftSocialPosts(type: string, id: number): Promise<SocialPost[]> {
  const res = await apiFetch<{ data: SocialPost[] }>("/admin/social-posts/draft", {
    method: "POST", body: { type, id }, token: await token(),
  });

  return res.data;
}

/* ---- The LinkedIn connection: `role:admin` --------------------------------- */

export async function getSocialAccountsStatus(): Promise<SocialAccountsStatus> {
  const res = await apiFetch<{ data: SocialAccountsStatus }>("/admin/settings/social", { token: await token() });

  return res.data;
}

/** The consent URL. The callback is this site's own path, which the API checks exactly. */
export async function authorizeLinkedIn(origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/settings/social/linkedin/authorize", {
    method: "POST", body: { redirect_uri: `${origin}/admin/settings/social/linkedin/callback` }, token: await token(),
  });

  return res.data.url;
}

export async function completeLinkedIn(code: string, state: string): Promise<{ account: string | null; organization_id: string | null }> {
  const res = await apiFetch<{ data: { account: string | null; organization_id: string | null } }>("/admin/settings/social/linkedin/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });

  return res.data;
}

export async function disconnectLinkedIn(): Promise<void> {
  await apiFetch("/admin/settings/social/linkedin/disconnect", { method: "POST", token: await token() });
}

/** The pages the connected person administers. A refusal is a 422 in LinkedIn's words. */
export async function getLinkedInOrganizations(): Promise<LinkedInOrganization[]> {
  const res = await apiFetch<{ data: LinkedInOrganization[] }>("/admin/settings/social/linkedin/organizations", { token: await token() });

  return res.data;
}

export async function chooseLinkedInOrganization(id: string, name: string | null): Promise<void> {
  await apiFetch("/admin/settings/social/linkedin/organization", {
    method: "POST", body: { id, ...(name ? { name } : {}) }, token: await token(),
  });
}
