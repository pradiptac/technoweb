"use client";

import { useActionState, useId } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CoverField } from "@/components/admin/cover-field";
import { FormActions } from "@/components/admin/form-actions";
import { TeamCertificationsField } from "@/components/admin/team-certifications-field";
import { createTeamMemberAction, updateTeamMemberAction, type TeamMemberState } from "./actions";
import type { TeamMemberMeta } from "@/lib/admin";
import type { AdminTeamMember } from "@/types/api";

const initial: TeamMemberState = {};

/**
 * One pane. The certifications repeater is the only repeating field, and the
 * department is a text input with a datalist of the departments already in
 * use — so "Support" and "support" do not become two groups on the team page.
 */
export function TeamMemberForm({ member, meta }: { member?: AdminTeamMember; meta: TeamMemberMeta }) {
  const action = member ? updateTeamMemberAction.bind(null, member.id) : createTeamMemberAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const departmentsId = useId();
  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  // The API reports per-row problems as certifications.0.name; surface the first.
  const certErr = err("certifications")
    ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith("certifications."))?.[1]?.[0];

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" error={err("name")}>
              <Input id="name" name="name" defaultValue={member?.name} required maxLength={120} autoComplete="off" />
            </Field>
            <Field label="Designation" htmlFor="designation" error={err("designation")} hint="“Network Engineer”, “Support Desk Lead”.">
              <Input id="designation" name="designation" defaultValue={member?.designation ?? ""} maxLength={120} />
            </Field>
          </div>

          <Field
            label="Department"
            htmlFor="department"
            error={err("department")}
            hint="The team page groups people by this. Pick an existing one from the list or type a new one."
          >
            <Input id="department" name="department" list={departmentsId} defaultValue={member?.department ?? ""} maxLength={80} autoComplete="off" />
          </Field>
          <datalist id={departmentsId}>
            {meta.departments.map((d) => <option key={d} value={d} />)}
          </datalist>

          <Field label="Bio" htmlFor="bio" error={err("bio")} hint="A sentence or two. Plain text.">
            <Textarea id="bio" name="bio" rows={3} defaultValue={member?.bio ?? ""} maxLength={1000} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={err("email")} hint="Optional — and public if filled: it becomes a mail link on their card.">
              <Input id="email" name="email" type="email" defaultValue={member?.email ?? ""} autoComplete="off" />
            </Field>
            <Field label="LinkedIn" htmlFor="linkedin_url" error={err("linkedin_url")} hint="Optional. The full https://www.linkedin.com/in/… address.">
              <Input id="linkedin_url" name="linkedin_url" type="url" defaultValue={member?.linkedin_url ?? ""} placeholder="https://www.linkedin.com/in/" />
            </Field>
          </div>

          <TeamCertificationsField defaultValue={member?.certifications ?? []} error={certErr} />
        </div>

        <aside>
          <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}>
            <Select id="status" name="status" defaultValue={member?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>

          <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lower numbers first. Departments appear in the order of their first member.">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={member?.sort_order ?? 0} />
          </Field>

          <CoverField
            name="photo_path"
            label="Photo"
            accept=".png,.jpg,.jpeg,.webp"
            defaultPath={member?.photo_path ?? null}
            defaultUrl={member?.photo ?? null}
            hint="Landscape, face centred — the card crops to 4:3. Without one, initials are shown."
          />
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : member ? "Save team member" : "Add team member"}
        </Button>
      </FormActions>
    </Form>
  );
}
