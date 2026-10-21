"use server";

import { redirect } from "next/navigation";

import { deleteRecordNote, getRecordNotes, postRecordNote, type RecordNote } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { mentionIdsFrom } from "@/lib/mentions";
import type { RevisionType } from "@/types/revisions";

export type RecordNotesState = { notes?: RecordNote[]; error?: string; fieldErrors?: Record<string, string[]> };

/** The dialog keeps its own list, so nothing is revalidated: the answer is the thread as it now stands. */
export async function postRecordNoteAction(type: RevisionType, id: number, _prev: RecordNotesState, formData: FormData): Promise<RecordNotesState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a note first.", fieldErrors: { body: ["Write a note first."] } };

  try {
    await postRecordNote(type, id, body, mentionIdsFrom(formData.getAll("mentions[]")));
    return { notes: (await getRecordNotes(type, id)) ?? [] };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) return { error: error.errors?.body?.[0] ?? error.message, fieldErrors: error.errors };
      if (error.status === 429) return { error: "You are writing notes too quickly. Wait a minute." };
    }
    return { error: "We could not save the note. Try again." };
  }
}

export async function deleteRecordNoteAction(type: RevisionType, id: number, noteId: number): Promise<RecordNotesState> {
  try {
    await deleteRecordNote(noteId);
    return { notes: (await getRecordNotes(type, id)) ?? [] };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Only the person who wrote a note, or an administrator, can delete it." };
      if (error.status === 404) return { notes: (await getRecordNotes(type, id)) ?? [] };
    }
    return { error: "We could not delete the note. Try again." };
  }
}
