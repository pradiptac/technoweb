"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { createArticleAction, updateArticleAction, deleteArticleAction, type ArticleFormState } from "./actions";
import type { AdminKnowledgeArticle, KnowledgeCategory } from "@/types/api";

const initial: ArticleFormState = {};

/** Two panels: the article, and the overrides almost nobody touches. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "excerpt", "body", "status", "published_at",
             "knowledge_category_id", "tags"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

/** datetime-local wants "YYYY-MM-DDTHH:mm"; the API sends ISO-8601. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ArticleForm({
  article, categories, saved,
}: {
  article?: AdminKnowledgeArticle;
  categories: KnowledgeCategory[];
  saved?: boolean;
}) {
  const editing = Boolean(article);
  const [state, formAction, pending] = useActionState(
    editing ? updateArticleAction : createArticleAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={article!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {article?.status === "published"
            ? <>Live at <Link className="underline" href={`/knowledge-base/${article.slug}`}>/knowledge-base/{article.slug}</Link>.</>
            : "Saved as a draft — it is not in the knowledge base yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={article?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={article?.slug} className="font-mono text-[14px]"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Excerpt" htmlFor="excerpt" error={err("excerpt")}
              hint="Shown in search results and on the knowledge-base index. Max 500 characters.">
              <Textarea id="excerpt" name="excerpt" rows={3} defaultValue={article?.excerpt ?? ""}
                maxLength={500} aria-invalid={Boolean(err("excerpt"))} />
            </Field>

            <EditorField name="body" defaultValue={article?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={article?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Publish date" htmlFor="published_at" error={err("published_at")}
              hint="Leave blank when publishing and it is set to now.">
              <Input id="published_at" name="published_at" type="datetime-local"
                defaultValue={toLocalInput(article?.published_at ?? null)} />
            </Field>

            <Field label="Category" htmlFor="knowledge_category_id" error={err("knowledge_category_id")} variant="float-static">
              <Select id="knowledge_category_id" name="knowledge_category_id"
                defaultValue={article?.knowledge_category_id ?? ""}>
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="Tags" htmlFor="tags" error={err("tags")}
              hint="Comma separated. These are searched as well as the text, so add the words people actually type — “wifi” as well as “Wi-Fi”.">
              <Input id="tags" name="tags" defaultValue={(article?.tags ?? []).join(", ")}
                aria-invalid={Boolean(err("tags"))} />
            </Field>

            {editing && (
              <p className="mb-[18px] text-[12.5px] text-muted">
                {article!.view_count} view{article!.view_count === 1 ? "" : "s"} ·{" "}
                {article!.helpful_count} marked helpful
              </p>
            )}
          </aside>
        </div>

        <SeoPanel seo={article?.seo} defaults={article?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create article"}
        </Button>
        <Link href="/admin/knowledge-base" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deleteArticleAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${article!.title}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete article
            </Button>
          </span>
        )}
      </div>
    </form>
  );
}
