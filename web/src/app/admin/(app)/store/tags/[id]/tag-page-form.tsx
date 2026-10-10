"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { EditorField } from "@/components/admin/editor-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { updateTagPageAction, type TagPageFormState } from "../actions";
import type { AdminStoreTag } from "@/types/store-tags";

const initial: TagPageFormState = {};

/** A new field must be listed on its tab, or its errors are charged to the first. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content", fields: ["heading", "intro"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

/**
 * A tag's page (0.157.0): the heading and introduction over its products, and
 * the SEO panel every indexable record has. The name, the slug and the Shown
 * switch stay on the list - renaming moves the address, and the list is where
 * that is said - so `slug` travels as a hidden input only to name the cache
 * tag to purge.
 */
export function TagPageForm({ tag }: { tag: AdminStoreTag }) {
  const [state, formAction, pending] = useActionState(updateTagPageAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      <FormDraft />
      <input type="hidden" name="id" value={tag.id} />
      <input type="hidden" name="slug" value={tag.slug} />

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {/* One child per tab: `Tabs` reads `children[i]` positionally. */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div>
          <Field label="Heading" htmlFor="heading" error={err("heading")}
            hint={`The page's title. Blank uses the tag's name, “${tag.name}”.`}>
            <Input id="heading" name="heading" defaultValue={tag.heading ?? ""} maxLength={160} aria-invalid={Boolean(err("heading"))} />
          </Field>

          <EditorField name="intro" label="Introduction" defaultValue={tag.intro ?? ""} error={err("intro")}
            hint="Shown above the products. A page with fewer than three products on sale is left out of search engines whatever is written here." />
        </div>

        <SeoPanel seo={tag.seo} defaults={tag.seo_defaults} error={seoErr} embedded record={{ type: "store_tag", id: tag.id }} />
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <Link href="/admin/store/tags"
          className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
