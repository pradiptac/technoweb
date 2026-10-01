"use server";

import { ApiError } from "@/lib/api";
import { answerTicketSurvey, type TicketSurvey } from "@/lib/ticket-survey";

export type SurveyResult = {
  /** The survey as the API now holds it. */
  saved?: TicketSurvey;
  error?: string;
};

/**
 * Record the rating, and the comment if there is one.
 *
 * Called by the survey page from the browser — on arrival with the rating the
 * emailed button carried, when another button is pressed, and when the
 * feedback is sent — always with both values, so a later call never loses
 * what an earlier one saved. It is a POST on purpose (see
 * `TicketSurveyController`): the emailed link itself is a GET that anything
 * may fetch, and the rating is recorded by the page running in a browser,
 * never by the fetch of a link.
 */
export async function saveSurveyAction(token: string, rating: number, comment: string): Promise<SurveyResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose one of the five ratings." };
  }

  try {
    return { saved: await answerTicketSurvey(token, rating, comment) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.errors?.comment?.[0] ?? error.message };
      if (error.status === 404) return { error: "This survey link is not valid any more." };
    }

    return { error: "We could not save your answer just now. Please try again in a moment." };
  }
}
