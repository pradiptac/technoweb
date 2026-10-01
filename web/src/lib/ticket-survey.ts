import "server-only";
import { apiFetch, ApiError } from "@/lib/api";

/**
 * The satisfaction survey a closed ticket's customer is emailed
 * (docs/tickets.md, "The satisfaction survey").
 *
 * Both calls are addressed by the token in the emailed link and are never
 * cached: a survey is one person's, and the page that reads it must show what
 * they answered a moment ago.
 */

export type TicketSurvey = {
  reference: string;
  subject: string;
  answered: boolean;
  rating: number | null;
  rating_label: string | null;
  comment: string | null;
  /** The five choices, from the API — never a list typed here. */
  ratings: { value: number; label: string }[];
  comment_max: number;
};

/** The survey, or null for a token nobody has (a 404) — the page says so. */
export async function getTicketSurvey(token: string): Promise<TicketSurvey | null> {
  // A token has one shape; anything else is not worth a request.
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  try {
    const res = await apiFetch<{ data: TicketSurvey }>(`/ticket-surveys/${token}`);
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function answerTicketSurvey(token: string, rating: number, comment: string): Promise<TicketSurvey> {
  const res = await apiFetch<{ data: TicketSurvey }>(`/ticket-surveys/${token}`, {
    method: "POST",
    body: { rating, comment },
  });

  return res.data;
}
