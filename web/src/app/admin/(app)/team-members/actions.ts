"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import { createTeamMember, deleteTeamMember, updateTeamMember, type TeamMemberPayload } from "@/lib/admin";

export type TeamMemberState = { error?: string; fieldErrors?: Record<string, string[]> };

type CertRow = NonNullable<TeamMemberPayload["certifications"]>[number];

/**
 * The repeater posts one JSON field. Malformed JSON is read as "none" rather
 * than throwing — a hidden field somebody has edited by hand should not take
 * the whole save down — and the key is **always** sent as an array, because
 * an absent one means "leave them alone" to the API.
 */
function certificationsFrom(formData: FormData): CertRow[] {
  const raw = String(formData.get("certifications") ?? "");
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r) => ({
        name: String(r.name ?? "").trim(),
        issuer: r.issuer ? String(r.issuer) : null,
        credential_id: r.credential_id ? String(r.credential_id) : null,
        issued_on: r.issued_on ? String(r.issued_on) : null,
        expires_on: r.expires_on ? String(r.expires_on) : null,
      }))
      .filter((r) => r.name !== "");
  } catch {
    return [];
  }
}

function payload(formData: FormData): TeamMemberPayload {
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  return {
    name: str("name"),
    designation: str("designation") || null,
    department: str("department") || null,
    photo_path: str("photo_path") || null,
    bio: str("bio") || null,
    email: str("email") || null,
    linkedin_url: str("linkedin_url") || null,
    status: str("status"),
    sort_order: Number(str("sort_order")) || 0,
    certifications: certificationsFrom(formData),
  };
}

function fail(error: unknown): TeamMemberState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };

    return { error: error.message };
  }

  return { error: "We could not save that. Try again." };
}

/** `/team` by tag; About by path (the homepage does not render the team). */
function published(): void {
  updateTag("team");
  revalidatePath("/about");
}

export async function createTeamMemberAction(_prev: TeamMemberState, formData: FormData): Promise<TeamMemberState> {
  let id: number;

  try {
    const row = await createTeamMember(payload(formData));
    id = row.id;
    published();
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/team-members/${id}?done=created`);
}

export async function updateTeamMemberAction(id: number, _prev: TeamMemberState, formData: FormData): Promise<TeamMemberState> {
  try {
    await updateTeamMember(id, payload(formData));
    published();
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/team-members/${id}?done=saved`);
}

export async function deleteTeamMemberAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (Number.isFinite(id) && id > 0) {
    await deleteTeamMember(id).catch(() => null);
    published();
  }

  redirect("/admin/team-members?done=team-member-deleted");
}
