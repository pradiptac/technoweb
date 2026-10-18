"use server";

import { getWritingStatus, writeSubjects, writeText } from "@/lib/admin";
import type { WritingOutcome, WritingRequest, WritingStatus } from "@/types/writing";

// Nothing is saved by any of these, so nothing is revalidated.

/** Null when the status cannot be read; the buttons then draw nothing. */
export async function writingStatusAction(): Promise<WritingStatus | null> {
  try {
    return await getWritingStatus();
  } catch {
    return null;
  }
}

export async function writeAction(req: WritingRequest): Promise<WritingOutcome> {
  return writeText(req);
}

export async function subjectLinesAction(campaignId: number): Promise<{ ok: true; subjects: string[] } | { ok: false; error: string }> {
  return writeSubjects(campaignId);
}
