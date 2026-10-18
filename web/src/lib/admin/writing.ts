import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { WritingOutcome, WritingRequest, WritingStatus } from "@/types/writing";

const GENERIC = "Writing help is not available right now.";

/** A refusal (403, 404, 422) is the API's own sentence, returned rather than thrown. */
function refusal(error: unknown): { ok: false; error: string } {
  if (error instanceof ApiError && [403, 404, 422].includes(error.status)) {
    return { ok: false, error: error.errors?.writing?.[0] ?? error.message ?? GENERIC };
  }
  return { ok: false, error: GENERIC };
}

export async function getWritingStatus(): Promise<WritingStatus> {
  return (await apiFetch<{ data: WritingStatus }>("/admin/writing/status", { token: await token() })).data;
}

export async function writeText(req: WritingRequest): Promise<WritingOutcome> {
  try {
    const res = await apiFetch<{ data: { output: string } }>("/admin/writing", { method: "POST", body: req, token: await token() });

    return { ok: true, output: res.data.output };
  } catch (error) {
    return refusal(error);
  }
}

export async function writeSubjects(campaignId: number): Promise<{ ok: true; subjects: string[] } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ data: { subjects: string[] } }>("/admin/writing/subjects", { method: "POST", body: { campaign_id: campaignId }, token: await token() });

    return { ok: true, subjects: res.data.subjects };
  } catch (error) {
    return refusal(error);
  }
}
