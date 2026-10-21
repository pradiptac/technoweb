import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { RevisionType } from "@/types/revisions";

/** Team notes on a record (C2, docs/notifications.md): the kinds page history knows, the same per-kind owners. */
export type RecordNote = {
  id: number;
  author_name: string | null;
  body: string;
  mentioned: { id: number; name: string }[];
  created_at: string | null;
  can_delete: boolean;
};

/** The thread, oldest first, or **null when this account cannot read it** (403) — then no button is drawn. */
export async function getRecordNotes(type: RevisionType, id: number): Promise<RecordNote[] | null> {
  try {
    const out = await apiFetch<{ data: RecordNote[] }>(`/admin/record-notes${query({ type, id })}`, { token: await token() });
    return out.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

export async function postRecordNote(type: RevisionType, id: number, body: string, mentions: number[]): Promise<RecordNote> {
  const out = await apiFetch<{ data: RecordNote }>("/admin/record-notes", { method: "POST", body: { type, id, body, mentions }, token: await token() });
  return out.data;
}

export async function deleteRecordNote(noteId: number): Promise<void> {
  await apiFetch(`/admin/record-notes/${noteId}`, { method: "DELETE", token: await token() });
}
