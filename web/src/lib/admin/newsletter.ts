import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  Paginated, NewsletterSubscriber, NewsletterGroup, NewsletterCampaign, NewsletterTemplate, NewsletterAudience, NewsletterHealth, NewsletterSuppression, NewsletterWebhookMeta, NewsletterDashboard, NewsletterVerificationReport, NewsletterReport, QueueHealth, NewsletterImportAnalysis,
} from "@/types/api";

export async function getNewsletterDashboard(): Promise<NewsletterDashboard> {
  const res = await apiFetch<{ data: NewsletterDashboard }>("/admin/newsletter/dashboard", { token: await token() });
  return res.data;
}

export type SubscriberQuery = {
  q?: string; status?: string; group?: string; suppressed?: string; verification?: string;
  page?: number; per_page?: number;
};

export type SubscriberIndex = Paginated<NewsletterSubscriber> & {
  meta: Paginated<NewsletterSubscriber>["meta"] & {
    statuses: { value: string; label: string }[];
    verifications: { value: string; label: string }[];
    total_active: number;
    total_suppressed: number;
  };
};

/** The Hunter verification screen: breakdown, allowance, queue, ledger. */
export async function getNewsletterVerification(): Promise<NewsletterVerificationReport> {
  const res = await apiFetch<{ data: NewsletterVerificationReport }>("/admin/newsletter/verification", { token: await token() });
  return res.data;
}

/** Ask Hunter about one address now. A 422 carries the reason it could not. */
export async function verifySubscriber(id: number): Promise<NewsletterSubscriber> {
  const res = await apiFetch<{ data: NewsletterSubscriber }>(`/admin/newsletter/subscribers/${id}/verify`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function getNewsletterSubscribers(params: SubscriberQuery = {}): Promise<SubscriberIndex> {
  return apiFetch<SubscriberIndex>(`/admin/newsletter/subscribers${query(params)}`, { token: await token() });
}

export async function createNewsletterSubscriber(payload: Record<string, unknown>): Promise<NewsletterSubscriber> {
  const res = await apiFetch<{ data: NewsletterSubscriber }>("/admin/newsletter/subscribers", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteNewsletterSubscriber(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/subscribers/${id}`, { method: "DELETE", token: await token() });
}

export async function unsubscribeSubscriber(id: number, note?: string): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/subscribers/${id}/unsubscribe`, {
    method: "POST", body: { note }, token: await token(),
  });
}

export async function getNewsletterGroups(): Promise<NewsletterGroup[]> {
  const res = await apiFetch<{ data: NewsletterGroup[] }>("/admin/newsletter/groups", { token: await token() });
  return res.data;
}

export async function createNewsletterGroup(payload: Record<string, unknown>): Promise<NewsletterGroup> {
  const res = await apiFetch<{ data: NewsletterGroup }>("/admin/newsletter/groups", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateNewsletterGroup(id: number, payload: Record<string, unknown>): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/groups/${id}`, { method: "PATCH", body: payload, token: await token() });
}

export async function deleteNewsletterGroup(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/groups/${id}`, { method: "DELETE", token: await token() });
}

export async function getNewsletterTemplates(): Promise<NewsletterTemplate[]> {
  const res = await apiFetch<{ data: NewsletterTemplate[] }>("/admin/newsletter/templates", { token: await token() });
  return res.data;
}

export async function getNewsletterTemplate(id: number): Promise<NewsletterTemplate> {
  const res = await apiFetch<{ data: NewsletterTemplate }>(`/admin/newsletter/templates/${id}`, { token: await token() });
  return res.data;
}

/** Render blocks without saving — what the editor's preview pane calls. */
export async function previewNewsletterBlocks(blocks: unknown[], preheader?: string | null): Promise<string> {
  const res = await apiFetch<{ data: { html: string } }>("/admin/newsletter/templates/preview", {
    method: "POST", body: { blocks, preheader }, token: await token(),
  });
  return res.data.html;
}

export type CampaignIndex = Paginated<NewsletterCampaign> & {
  meta: Paginated<NewsletterCampaign>["meta"] & { statuses: { value: string; label: string }[] };
};

export async function getNewsletterCampaigns(params: { q?: string; status?: string; page?: number; per_page?: number } = {}): Promise<CampaignIndex> {
  return apiFetch<CampaignIndex>(`/admin/newsletter/campaigns${query(params)}`, { token: await token() });
}

/**
 * Whether anything will deliver a send, asked fresh.
 *
 * Not cached and not folded into the campaign: it is a fact about the
 * deployment, and a value read when the page was rendered says the scheduler
 * was alive then rather than now.
 */
export async function getNewsletterQueue(): Promise<QueueHealth> {
  const res = await apiFetch<{ data: QueueHealth }>("/admin/newsletter/queue", { token: await token() });
  return res.data;
}

export async function getNewsletterCampaign(id: number): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>(`/admin/newsletter/campaigns/${id}`, { token: await token() });
  return res.data;
}

export async function createNewsletterCampaign(payload: Record<string, unknown>): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>("/admin/newsletter/campaigns", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateNewsletterCampaign(id: number, payload: Record<string, unknown>): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>(`/admin/newsletter/campaigns/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteNewsletterCampaign(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/campaigns/${id}`, { method: "DELETE", token: await token() });
}

export async function duplicateNewsletterCampaign(id: number): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>(`/admin/newsletter/campaigns/${id}/duplicate`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function getCampaignAudience(id: number): Promise<NewsletterAudience> {
  const res = await apiFetch<{ data: NewsletterAudience }>(`/admin/newsletter/campaigns/${id}/audience`, { token: await token() });
  return res.data;
}

export async function getCampaignHealth(id: number): Promise<NewsletterHealth> {
  const res = await apiFetch<{ data: NewsletterHealth }>(`/admin/newsletter/campaigns/${id}/health`, { token: await token() });
  return res.data;
}

export async function sendCampaignTest(id: number, email?: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/newsletter/campaigns/${id}/test`, {
    method: "POST", body: { email }, token: await token(),
  });
}

export async function sendCampaign(id: number, scheduledAt?: string | null): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/newsletter/campaigns/${id}/send`, {
    method: "POST", body: { scheduled_at: scheduledAt ?? null }, token: await token(),
  });
}

export async function cancelCampaign(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/campaigns/${id}/cancel`, { method: "POST", token: await token() });
}

export async function getCampaignReport(id: number): Promise<NewsletterReport> {
  const res = await apiFetch<{ data: NewsletterReport }>(`/admin/newsletter/campaigns/${id}/report`, { token: await token() });
  return res.data;
}

export type SuppressionList = Paginated<NewsletterSuppression> & {
  meta: { webhook?: NewsletterWebhookMeta };
};

export async function getNewsletterSuppressions(params: { q?: string; reason?: string; page?: number } = {}): Promise<SuppressionList> {
  return apiFetch<SuppressionList>(`/admin/newsletter/suppressions${query(params)}`, { token: await token() });
}

export async function addNewsletterSuppression(email: string, note?: string): Promise<void> {
  await apiFetch<void>("/admin/newsletter/suppressions", {
    method: "POST", body: { email, note }, token: await token(),
  });
}

export async function liftNewsletterSuppression(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/suppressions/${id}`, { method: "DELETE", token: await token() });
}

/**
 * `apiUpload`, not `apiFetch`.
 *
 * `apiFetch` JSON-encodes its body, so a FormData handed to it arrives as
 * `{}` and Laravel answers "the file field is required" — which reads as the
 * upload being rejected rather than as never having been sent. Multipart needs
 * fetch to generate the boundary itself.
 */
export async function analyseNewsletterImport(form: FormData): Promise<NewsletterImportAnalysis> {
  const res = await apiUpload<{ data: NewsletterImportAnalysis }>(
    "/admin/newsletter/imports/analyse", form, { token: await token() },
  );
  return res.data;
}

export async function runNewsletterImport(payload: Record<string, unknown>): Promise<Record<string, number>> {
  const res = await apiFetch<{ data: Record<string, number> }>("/admin/newsletter/imports", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

/** Addresses pasted as text — the third way an audience arrives. */
export async function pasteNewsletterAddresses(
  text: string,
  groupIds: number[] = [],
): Promise<{
  added: number; updated: number; already: number; suppressed: number; invalid: number;
  rejected: { value: string; reason: string | null }[];
}> {
  const res = await apiFetch<{ data: {
    added: number; updated: number; already: number; suppressed: number; invalid: number;
    rejected: { value: string; reason: string | null }[];
  } }>("/admin/newsletter/subscribers/paste", {
    method: "POST", body: { text, group_ids: groupIds }, token: await token(),
  });

  return res.data;
}
