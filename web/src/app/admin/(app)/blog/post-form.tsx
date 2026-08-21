"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { CoverField } from "./cover-field";
import { createPostAction, updatePostAction, deletePostAction, type PostFormState } from "./actions";
import type { AdminBlogPost, StaffUser } from "@/types/api";

const initial: PostFormState = {};

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
  const [seoOpen, setSeoOpen] = useState(false);

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const defaults = post?.seo_defaults;
  const seo = post?.seo;

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

          <CoverField
            defaultPath={post?.cover_image_path ?? null}
            defaultUrl={post?.cover_image ?? null}
          />
        </aside>
      </div>

      <section className="mt-2 rounded-lg border border-line-strong bg-white">
        <button
          type="button"
          onClick={() => setSeoOpen((o) => !o)}
          aria-expanded={seoOpen}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span>
            <span className="text-[14.5px] font-semibold">SEO overrides</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Everything here is generated from the post unless you type something.
            </span>
          </span>
          <span className="text-[13px] font-semibold text-brand-600">{seoOpen ? "Hide" : "Edit"}</span>
        </button>

        {/*
          Rendered even when collapsed, and hidden rather than unmounted.
          Unmounting drops these fields out of the form entirely, so a save
          with the panel closed submitted no sitemap_include — which reads as
          "false" and quietly drops the post from sitemap.xml.
        */}
        <div hidden={!seoOpen}>
          <div className="border-t border-line px-5 pt-5 pb-1">
            <Field label="Meta title" htmlFor="seo_title" error={seoErr("title")}>
              <Input id="seo_title" name="seo_title" defaultValue={seo?.title ?? ""}
                placeholder={defaults?.title ?? ""} />
            </Field>

            <Field label="Meta description" htmlFor="seo_description" error={seoErr("description")}
              hint="Over 320 characters and search engines truncate it.">
              <Textarea id="seo_description" name="seo_description" rows={2}
                defaultValue={seo?.description ?? ""} placeholder={defaults?.description ?? ""} />
            </Field>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Canonical URL" htmlFor="seo_canonical_url" error={seoErr("canonical_url")}>
                <Input id="seo_canonical_url" name="seo_canonical_url" defaultValue={seo?.canonical_url ?? ""}
                  placeholder={defaults?.canonical_url ?? ""} />
              </Field>

              <Field label="Robots" htmlFor="seo_robots" error={seoErr("robots")}>
                <Input id="seo_robots" name="seo_robots" defaultValue={seo?.robots ?? ""}
                  placeholder={defaults?.robots ?? "index, follow"} />
              </Field>
            </div>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Focus keyword" htmlFor="seo_focus_keyword" error={seoErr("focus_keyword")}>
                <Input id="seo_focus_keyword" name="seo_focus_keyword" defaultValue={seo?.focus_keyword ?? ""} />
              </Field>

              <Field label="Schema type" htmlFor="seo_schema_type" error={seoErr("schema_type")}>
                <Input id="seo_schema_type" name="seo_schema_type" defaultValue={seo?.schema_type ?? ""}
                  placeholder={defaults?.schema_type ?? "Article"} />
              </Field>
            </div>

            <Field label="Social title" htmlFor="seo_og_title" error={seoErr("og_title")}>
              <Input id="seo_og_title" name="seo_og_title" defaultValue={seo?.og_title ?? ""}
                placeholder={defaults?.og_title ?? ""} />
            </Field>

            <Field label="Social description" htmlFor="seo_og_description" error={seoErr("og_description")}>
              <Textarea id="seo_og_description" name="seo_og_description" rows={2}
                defaultValue={seo?.og_description ?? ""} placeholder={defaults?.og_description ?? ""} />
            </Field>

            <label className="mb-[18px] flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" name="seo_sitemap_include" value="1"
                defaultChecked={seo?.sitemap_include ?? true} />
              Include in sitemap.xml
            </label>
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
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
      </div>
    </form>
  );
}
