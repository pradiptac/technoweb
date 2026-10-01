"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import { CoverField } from "@/components/admin/cover-field";
import { RelationPicker } from "@/components/admin/relation-picker";
import { createPostAction, updatePostAction, deletePostAction, type PostFormState } from "./actions";
import type { CustomFieldGroupDefinition, AdminBlogPost, StaffUser, AnswerBlockKindOption } from "@/types/api";

const initial: PostFormState = {};

/** Four panels' worth of fields; the lists map a 422 back to its tab. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "excerpt", "body", "status", "published_at", "author_id", "is_featured", "comments_enabled", "category_ids"] },
  { id: "media", label: "Media", fields: ["cover_image_path"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
  // The AEO tab (docs/aeo-geo-contract.md §7). Last, so every tab above keeps its place.
  { id: "aeo", label: "AEO", fields: ["answer_blocks", "faqs"] },
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
  post, staff, categories, saved, kinds, fieldGroups,
}: {
  post?: AdminBlogPost;
  staff: StaffUser[];
  /** Every blog category, empty ones included, for the picker. */
  categories: { id: number; name: string }[];
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
  /** `meta.custom_field_groups` from the index, for a new record; an edit reads the record's own. */
  fieldGroups?: CustomFieldGroupDefinition[];
}) {
  const editing = Boolean(post);
  const [state, formAction, pending] = useActionState(
    editing ? updatePostAction : createPostAction,
    initial,
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  /** Per-row errors arrive as e.g. answer_blocks.0.answer; surface the first. */
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];
  const defaults = post?.seo_defaults;
  const seo = post?.seo;

  // Custom fields (docs/custom-content.md): the groups that apply, from the API.
  const customGroups = post?.custom_field_groups ?? fieldGroups ?? [];
  const { tabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
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
              <Input id="slug" name="slug" defaultValue={post?.slug} className="font-mono text-14"
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

            <Field label="Featured" htmlFor="is_featured" error={err("is_featured")} variant="float-static"
              hint="Featured posts fill the lead area at the top of the blog.">
              <Select id="is_featured" name="is_featured" defaultValue={post?.is_featured ? "1" : "0"}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </Select>
            </Field>

            <Field label="Comments on this post" htmlFor="comments_enabled" error={err("comments_enabled")} variant="float-static"
              hint="Readers can comment only while comments are also switched on in Blog → Settings.">
              <Select id="comments_enabled" name="comments_enabled" defaultValue={post?.comments_enabled === false ? "0" : "1"}>
                <option value="1">Open</option>
                <option value="0">Closed</option>
              </Select>
            </Field>

            <RelationPicker
              name="category_ids"
              label="Categories"
              hint="Where the post is filed on the blog. Add or rename categories under Blog → Blog categories."
              options={categories}
              defaultValue={post?.category_ids ?? post?.categories?.map((c) => c.id) ?? []}
              error={err("category_ids") ?? rowErr("category_ids")}
            />
            <Link href="/admin/blog-categories" className="-mt-2 mb-4 text-12-5 font-semibold text-brand-ink hover:underline">
              Manage categories →
            </Link>
          </aside>
        </div>

        <div className="max-w-[420px]">
          <CoverField
            // The ratio the post page and og:image both use — see the
            // `aspect-[1200/630]` on the article template.
            hint="PNG, JPG, GIF or WebP. 1200 x 630 px — the ratio the post and its share card both use."
            defaultPath={post?.cover_image_path ?? null}
            defaultUrl={post?.cover_image ?? null}
          />
        </div>

        <SeoPanel seo={seo} defaults={defaults} error={seoErr} embedded record={post ? { type: 'blog_post', id: post.id } : null} />

        {/*
          The AEO tab, one child: the readiness scores and the assistant on
          top, the answer blocks under them, then the FAQs this record
          gained with them. See docs/aeo-geo-contract.md §7.
        */}
        <div>
          <AeoGeoPanel record={post ? { type: 'blog_post', id: post.id } : null} blocks={post?.answer_blocks} />
          <AnswerBlocksField defaultValue={post?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
          <FaqField defaultValue={post?.faqs ?? []} error={rowErr("faqs")} />
        </div>

        {/* The Fields tab — last, and only when a custom field group applies. */}
        {customGroups.length > 0 && (
          <CustomFieldsPanel groups={customGroups} values={post?.custom_fields} media={post?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />
        )}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create post"}
        </Button>
        <Link href="/admin/blog" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
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
    </Form>
  );
}
