"use client";

import Link from "next/link";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CoverField } from "@/components/admin/cover-field";
import { createPostAction, updatePostAction, deletePostAction, type PostFormState } from "./actions";
import type { AdminBlogPost, StaffUser } from "@/types/api";

const initial: PostFormState = {};

/** Four panels' worth of fields; the lists map a 422 back to its tab. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "excerpt", "body", "status", "published_at", "author_id"] },
  { id: "media", label: "Media", fields: ["cover_image_path"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

/** datetime-local wants "YYYY-MM-DDTHH:mm"; the API sends ISO-8601. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create and edit share one form — they differ only in initial values and
 * which action they post to. This is the first CRUD form in the admin area,
 * so it is the shape the remaining CMS entities should follow.
 */
export function PostForm({
  post, staff, saved,
}: {
  post?: AdminBlogPost;
  staff: StaffUser[];
  saved?: boolean;
}) {
  const editing = Boolean(post);
  const [state, formAction, pending] = useActionState(
    editing ? updatePostAction : createPostAction,
    initial,
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const defaults = post?.seo_defaults;
  const seo = post?.seo;

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={post!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {post?.status === "published"
            ? <>Live at <Link className="underline" href={`/blog/${post.slug}`}>/blog/{post.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={post?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={post?.slug} className="font-mono text-[14px]"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Excerpt" htmlFor="excerpt" error={err("excerpt")}
              hint="Shown on the blog index and used as the meta description when no SEO override is set. Max 500 characters.">
              <Textarea id="excerpt" name="excerpt" rows={3} defaultValue={post?.excerpt ?? ""}
                maxLength={500} aria-invalid={Boolean(err("excerpt"))} />
            </Field>

            <EditorField name="body" defaultValue={post?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={post?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Publish date" htmlFor="published_at" error={err("published_at")}
              hint="Leave blank when publishing and it is set to now.">
              <Input id="published_at" name="published_at" type="datetime-local"
                defaultValue={toLocalInput(post?.published_at ?? null)} />
            </Field>

            <Field label="Author" htmlFor="author_id" error={err("author_id")} variant="float-static">
              <Select id="author_id" name="author_id" defaultValue={post?.author_id ?? ""}>
                <option value="">Unattributed</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </aside>
        </div>

        <div className="max-w-[420px]">
          <CoverField
            defaultPath={post?.cover_image_path ?? null}
            defaultUrl={post?.cover_image ?? null}
          />
        </div>

        <SeoPanel seo={seo} defaults={defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create post"}
        </Button>
        <Link href="/admin/blog" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deletePostAction}
              formNoValidate
              // Deleting is irreversible and the button sits next to Save.
              onClick={(e) => {
                if (!window.confirm(`Delete "${post!.title}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete post
            </Button>
          </span>
        )}
      </FormActions>
    </form>
  );
}
