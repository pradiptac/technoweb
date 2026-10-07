import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { token } from "./_shared";
import type {
  MailTemplateIndex, MailTemplateDetail, MailStatus, HunterAccount, InboundMailStatus,
} from "@/types/api";

export async function getMailStatus(): Promise<MailStatus> {
  const res = await apiFetch<{ data: MailStatus }>("/admin/settings/mail", { token: await token() });
  return res.data;
}

/**
 * The consent URL to send the administrator to.
 *
 * The redirect is built here rather than on the API, because only the frontend
 * knows the origin it is actually reachable at — the two are different hosts in
 * production. The API checks it against its own configured frontend before
 * echoing it to Google, so this cannot become an open redirect.
 */
export async function authorizeMailbox(transport: string, origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/settings/mail/authorize", {
    method: "POST",
    body: { transport, redirect_uri: `${origin}/admin/settings/mail/callback` },
    token: await token(),
  });
  return res.data.url;
}

export async function completeMailConnection(code: string, state: string): Promise<string> {
  const res = await apiFetch<{ data: { account: string } }>("/admin/settings/mail/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });
  return res.data.account;
}

export async function disconnectMailbox(): Promise<void> {
  await apiFetch<void>("/admin/settings/mail/disconnect", { method: "POST", token: await token() });
}

/**
 * Send one test message.
 *
 * With no address it goes to the signed-in administrator, which is the common
 * case. An address is accepted because the question this usually answers is
 * whether mail reaches *outside* — a message to an external inbox proves SPF,
 * DKIM and reputation in a way one to the same domain never can.
 */
export async function sendTestMail(email?: string): Promise<{ sent_to: string; transport: string }> {
  const res = await apiFetch<{ data: { sent_to: string; transport: string } }>(
    "/admin/settings/mail/test",
    { method: "POST", body: email ? { email } : {}, token: await token() },
  );
  return res.data;
}

/* ------------------------------------------------- the support mailbox */

export async function getInboundMailStatus(): Promise<InboundMailStatus> {
  const res = await apiFetch<{ data: InboundMailStatus }>("/admin/settings/tickets/inbound", { token: await token() });
  return res.data;
}

/**
 * The consent URL for the mailbox tickets are read from. Same shape as
 * `authorizeMailbox`, on its own callback path — the API accepts exactly
 * that path for this slot and refuses the outgoing mail one.
 */
export async function authorizeInboundMailbox(provider: string, origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/settings/tickets/inbound/authorize", {
    method: "POST",
    body: { provider, redirect_uri: `${origin}/admin/settings/tickets/callback` },
    token: await token(),
  });
  return res.data.url;
}

export async function completeInboundConnection(code: string, state: string): Promise<{ account: string; provider: string }> {
  const res = await apiFetch<{ data: { account: string; provider: string } }>("/admin/settings/tickets/inbound/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });
  return res.data;
}

export async function disconnectInboundMailbox(): Promise<void> {
  await apiFetch<void>("/admin/settings/tickets/inbound/disconnect", { method: "POST", token: await token() });
}

/** Connect, select the folder and count what is waiting. Reads only. */
export async function testInboundMail(): Promise<{ account: string; folder: string; unseen: number }> {
  const res = await apiFetch<{ data: { account: string; folder: string; unseen: number } }>(
    "/admin/settings/tickets/inbound/test",
    { method: "POST", body: {}, token: await token() },
  );
  return res.data;
}

/**
 * Prove the saved Hunter key works. Free on the plan — it reads the account
 * — and it returns what the plan has left, which is the figure worth seeing.
 */
export async function testHunterKey(): Promise<HunterAccount> {
  const res = await apiFetch<{ data: HunterAccount }>("/admin/settings/integrations/hunter/test", {
    method: "POST", body: {}, token: await token(),
  });
  return res.data;
}

export type SettingRow = {
  key: string;
  /** Always null for a credential — the API never sends one back. */
  value: string | null;
  type: string;
  is_secret?: boolean;
  /** Whether a value is stored. The only thing the UI can know about a secret. */
  is_set?: boolean;
  /** Resolved preview URL for the *_path settings that hold a media file. */
  url?: string | null;
  /**
   * The choices, for a setting whose value is one of a fixed set.
   *
   * Sent by the API rather than listed here — the same rule
   * `schema_type_options` follows, because two hand-written copies of one list
   * of strings is exactly the drift nothing type-checks across the wire.
   */
  options?: { value: string; label: string; description: string }[] | null;
};

export type SettingGroups = Record<string, SettingRow[]>;

/**
 * What the server will accept, as opposed to what the console has been told to
 * ask for.
 *
 * `capped` is the one that matters: it says php.ini is quietly overruling the
 * setting, which is otherwise invisible from a screen showing only the number
 * somebody typed.
 */
export type UploadLimits = {
  max_kb: number;
  max_video_kb: number;
  php_upload_max_kb: number;
  php_post_max_kb: number;
  php_ceiling_kb: number;
  /** Resolution ceiling. A different resource from file size — see the API. */
  max_megapixels: number;
  capped: boolean;
  video_capped: boolean;
};

/**
 * What the payments panel needs, and one thing that is not a setting.
 *
 * `webhook_url` is generated by the API from its own route table, so it cannot
 * drift the way a URL written into a template does — and it resolves against
 * that server's `APP_URL`, so a development machine shows its own address
 * rather than sending somebody to configure production by mistake.
 */
export type PaymentsMeta = {
  gateways: {
    value: string;
    label: string;
    /** Whether the code to drive it exists at all. */
    implemented: boolean;
    /** Whether this server has been given its keys. */
    configured: boolean;
    reason: string | null;
    fields: { key: string; label: string; secret: boolean; hint: string; options?: { value: string; label: string }[] }[];
  }[];
  active: string | null;
  /** Per gateway, each with its own URL and event names. */
  webhooks: Record<string, { url: string; events: string[] }>;
  webhook_url: string;
  webhook_events: string[];
};

export type SettingsPayload = { groups: SettingGroups; uploads: UploadLimits; payments: PaymentsMeta };

export async function getSettings(): Promise<SettingsPayload> {
  const res = await apiFetch<{
    data: SettingGroups;
    meta: { uploads: UploadLimits; payments: PaymentsMeta };
  }>("/admin/settings", { token: await token() });

  return { groups: res.data, uploads: res.meta.uploads, payments: res.meta.payments };
}

export async function saveSettings(settings: { key: string; value: string }[]): Promise<void> {
  await apiFetch<void>("/admin/settings", { method: "PATCH", body: { settings }, token: await token() });
}

/**
 * Removes a stored credential.
 *
 * Its own endpoint because a blank save means "unchanged" — the form can
 * never show the current value, so it submits blank every time, and treating
 * that as a delete would wipe the SMTP password on every unrelated save.
 */
export async function clearSettingSecret(key: string): Promise<void> {
  await apiFetch<void>("/admin/settings/clear-secret", { method: "POST", body: { key }, token: await token() });
}

/**
 * What the console posts when somebody saves their own wording.
 *
 * `body_text` is nullable and null means "derive it at send time" rather than
 * "was derived once and stored" — a stored derivation is a second body that
 * goes stale the moment the first is edited.
 */
export type MailTemplatePayload = {
  subject: string;
  body_html: string;
  body_text?: string | null;
  is_enabled?: boolean;
  sends?: boolean;
  /** Comma-separated, as typed; the API splits and checks each address. */
  cc?: string;
  bcc?: string;
  from_name?: string | null;
  from_email?: string | null;
};

export async function getMailTemplates(): Promise<MailTemplateIndex> {
  return apiFetch<MailTemplateIndex>("/admin/settings/email-templates", { token: await token() });
}

export async function getMailTemplate(key: string): Promise<MailTemplateDetail> {
  return apiFetch<MailTemplateDetail>(`/admin/settings/email-templates/${key}`, { token: await token() });
}

export async function saveMailTemplate(key: string, payload: MailTemplatePayload): Promise<{ unknown: string[] }> {
  const res = await apiFetch<{ data: unknown; meta: { unknown: string[] } }>(
    `/admin/settings/email-templates/${key}`,
    { method: "PUT", body: payload, token: await token() },
  );
  return { unknown: res.meta.unknown };
}

export async function resetMailTemplate(key: string): Promise<void> {
  await apiFetch<void>(`/admin/settings/email-templates/${key}`, { method: "DELETE", token: await token() });
}

/** The draft as it would be sent, rendered by the same method a real send uses. */
export async function previewMailTemplate(
  key: string,
  payload: MailTemplatePayload,
): Promise<{ subject: string; html: string; text: string; unknown: string[] }> {
  const res = await apiFetch<{
    data: { subject: string; html: string; text: string };
    meta: { unknown: string[] };
  }>(`/admin/settings/email-templates/${key}/preview`, { method: "POST", body: payload, token: await token() });

  return { ...res.data, unknown: res.meta.unknown };
}

export async function sendMailTemplateTest(
  key: string,
  payload: MailTemplatePayload & { email?: string | null },
): Promise<string> {
  const res = await apiFetch<{ data: { sent_to: string } }>(
    `/admin/settings/email-templates/${key}/test`,
    { method: "POST", body: payload, token: await token() },
  );
  return res.data.sent_to;
}

/** Prove the saved Search Console service account: one real query, the page count, Google's words on refusal. */
export async function testSearchConsole(): Promise<{ site: string; days: number; pages: number }> {
  const res = await apiFetch<{ data: { site: string; days: number; pages: number } }>("/admin/settings/integrations/gsc/test", {
    method: "POST", body: {}, token: await token(),
  });
  return res.data;
}

export type CustomFontSlot = { slot: number; id: string; name: string | null; regular: string | null; bold: string | null; variable: boolean };

/** Upload a company's own font into a slot: multipart, so `apiUpload` — `apiFetch` would send `{}`. */
export async function saveCustomFont(slot: 1 | 2, data: FormData): Promise<CustomFontSlot> {
  const res = await apiUpload<{ data: CustomFontSlot }>(`/admin/settings/fonts/${slot}`, data, { token: await token() });
  return res.data;
}

/** Empty a font slot; the API takes the site off it too. */
export async function removeCustomFont(slot: 1 | 2): Promise<void> {
  await apiFetch<void>(`/admin/settings/fonts/${slot}`, { method: "DELETE", token: await token() });
}

/** Prove the media CDN: one library file fetched through the saved address and compared with the server's copy. */
export async function testMediaCdn(): Promise<{ message: string; url: string }> {
  const res = await apiFetch<{ data: { message: string; url: string } }>("/admin/settings/media-cdn/test", {
    method: "POST", body: {}, token: await token(),
  });
  return res.data;
}

/** Prove the GA4 property with the same account: one real report for yesterday, the page count, Google's words on refusal. */
export async function testGoogleAnalytics(): Promise<{ property: string; days: number; pages: number }> {
  const res = await apiFetch<{ data: { property: string; days: number; pages: number } }>("/admin/settings/integrations/ga4/test", {
    method: "POST", body: {}, token: await token(),
  });
  return res.data;
}
