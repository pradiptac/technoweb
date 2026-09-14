import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  Paginated,
} from "@/types/api";

/** One check from the scoring rubric, as it fired for this lead. */
export type LeadScoreReason = {
  key: string;
  label: string;
  weight: number;
  applies: boolean;
  passed: boolean;
  /** Only carried on a failure — a hint beside a passing check is noise. */
  hint: string | null;
};

export type LeadNote = {
  id: number;
  kind: "note" | "status" | "assigned" | "system";
  body: string | null;
  context: Record<string, unknown> | null;
  actor_name: string | null;
  created_at: string | null;
};

export type AdminLead = {
  /**
   * The conversation a chatbot lead came from.
   *
   * The reason a chat lead links rather than copies: the requirement is one
   * sentence typed into a small box, and what was said on the way to it is
   * usually what the call is about. System messages are excluded by the API —
   * the same boundary the visitor's own browser gets.
   */
  conversation?: { role: string; content: string; at: string | null }[];
  id: number;
  channel: "enquiry" | "form";
  form_name: string | null;

  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string | null;

  source_url: string | null;
  source_path: string | null;
  source_title: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;

  status: string;
  status_label: string;
  is_open: boolean;
  assigned_to: number | null;
  assignee_name?: string | null;
  follow_up_at: string | null;
  /*
    Answered by the API rather than worked out in the browser. The list filters
    on it server-side, and two answers to one word is how the newsletter ended
    up reporting 3 delivered on one screen and 4 on another.
  */
  is_overdue: boolean;
  value_paise: number | null;
  contacted_at: string | null;
  closed_at: string | null;

  score: number;
  score_band: "hot" | "warm" | "cold" | "unscored";
  created_at: string | null;

  /* Detail only — see `LeadResource::withDetail()`. */
  /**
   * The statuses this lead may move to, itself first.
   *
   * The console's dropdown is built from this rather than from every status,
   * because a dropdown is a promise: offering six and refusing four with a 422
   * is a form arguing with whoever is filling it in.
   */
  allowed_next?: { value: string; label: string }[];
  score_reasons?: LeadScoreReason[] | null;
  ip_address?: string | null;
  notes?: LeadNote[];
  submission?: { form_slug: string | null; data: Record<string, unknown> | null };
  related?: {
    id: number;
    subject: string | null;
    form_name: string | null;
    status: string;
    status_label: string;
    created_at: string | null;
  }[];
};

export type LeadIndex = Paginated<AdminLead> & {
  meta: {
    statuses: { value: string; label: string; open: boolean }[];
    bands: string[];
    /** Counted over the whole table, never the page. */
    new_count: number;
    overdue_count: number;
    assignees: { id: number; name: string }[];
    top_pages: { path: string; total: number }[];
  };
};

/**
 * The website assistant, from the console.
 *
 * `role:admin` on every one of these — the transcripts hold whatever visitors
 * typed, given by people with no account. Blast radius, the argument
 * `campaign_manager` was split out with.
 */
export type ChatDashboard = {
  from: string;
  to: string;
  conversations: number;
  questions: number;
  unanswered: number;
  /** Null, never zero, when nothing was asked — a rate over nothing is not 0%. */
  unanswered_rate: number | null;
  leads: number;
  lead_rate: number | null;
  rated: number;
  helpful_rate: number | null;
  tokens: number;
  by_intent: { intent: string; total: number }[];
  busiest_pages: { path: string; total: number }[];
  /**
   * Today, not the range: the daily cap is the only thing bounding the bill,
   * and it is about right now. `remaining` is null when there is no cap —
   * zero would read as "none left", the opposite of what the setting means.
   */
  today: {
    replies: number;
    cap: number;
    remaining: number | null;
    reached: boolean;
    tokens: number;
  };
};

export type ChatConversationRow = {
  id: number;
  started_at: string | null;
  last_message_at: string | null;
  questions: number;
  source_path: string | null;
  lead: { id: number; name: string | null; status: string | null } | null;
};

export type ChatConversationDetail = {
  id: number;
  started_at: string | null;
  source_path: string | null;
  source_title: string | null;
  tokens_used: number;
  lead: { id: number; name: string | null; status: string | null } | null;
  messages: {
    id: number;
    role: string;
    content: string;
    intent: string | null;
    grounded: boolean;
    rating: number | null;
    rating_note: string | null;
    at: string | null;
  }[];
};

/** Grouped, because a question forty people asked is one piece of work. */
export type ChatUnanswered = {
  ids: number[];
  question: string;
  asked: number;
  last_asked: string | null;
  conversation_id: number | null;
  resolved: boolean;
};

export async function getChatDashboard(params: { from?: string; to?: string } = {}): Promise<ChatDashboard> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();

  const res = await apiFetch<{ data: ChatDashboard }>(
    `/admin/chat/dashboard${qs ? `?${qs}` : ""}`, { token: await token() },
  );
  return res.data;
}

export async function getChatConversations(
  params: { q?: string; with_lead?: boolean; unanswered?: boolean; page?: number } = {},
): Promise<Paginated<ChatConversationRow>> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.with_lead) query.set("with_lead", "1");
  if (params.unanswered) query.set("unanswered", "1");
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();

  return apiFetch(`/admin/chat/conversations${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getChatConversation(id: number): Promise<ChatConversationDetail> {
  const res = await apiFetch<{ data: ChatConversationDetail }>(
    `/admin/chat/conversations/${id}`, { token: await token() },
  );
  return res.data;
}

export async function getChatUnanswered(params: { all?: boolean } = {}): Promise<ChatUnanswered[]> {
  const res = await apiFetch<{ data: ChatUnanswered[] }>(
    `/admin/chat/unanswered${params.all ? "?all=1" : ""}`, { token: await token() },
  );
  return res.data;
}

export async function resolveChatUnanswered(ids: number[]): Promise<void> {
  await apiFetch("/admin/chat/unanswered/resolve", {
    method: "POST",
    body: { ids },
    token: await token(),
  });
}
