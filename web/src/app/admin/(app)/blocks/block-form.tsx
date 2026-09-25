"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { cn } from "@/lib/utils";
import type { AdminContentBlock, BlockMeta, BlockType } from "@/types/api";
import type { BlockState } from "./actions";
import { BlockEditorProvider, setIn, type Json, type Obj, type Path } from "./editors/shared";
import { CtaEditor } from "./editors/cta-editor";
import { StatsEditor } from "./editors/stats-editor";
import { PricingEditor } from "./editors/pricing-editor";
import { StackEditor } from "./editors/stack-editor";

/**
 * Creating and editing a content block.
 *
 * The content is one nested object held in state and posted as JSON in a
 * hidden field — the slide repeater's approach, for the same reason: plans
 * inside sets and technologies inside groups are objects already, and a
 * reorder is a state change rather than a renaming of every input after it.
 * A 422 comes back keyed `content.items.0.value`; each field finds its own
 * message by path, and the summary at the top lists any it cannot place.
 *
 * The layout is chosen from tiles carrying the API's own label and blurb
 * (`meta.layouts`), never a list written here.
 */
export function BlockForm({ type, meta, block, brands, action }: {
  type: BlockType;
  meta: BlockMeta;
  block?: AdminContentBlock | null;
  brands: { id: number; name: string }[];
  action: (prev: BlockState, formData: FormData) => Promise<BlockState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const layouts = meta.layouts[type] ?? [];
  const [layout, setLayout] = useState(block?.layout ?? layouts[0]?.value ?? "");
  const [content, setContent] = useState<Obj>((block?.content as Obj | undefined) ?? {});
  const [status, setStatus] = useState(block?.status ?? "draft");

  const set = useCallback((path: Path, value: Json | undefined) => {
    setContent((c) => setIn(c, path, value) as Obj);
  }, []);

  const errors = useMemo(() => state.fieldErrors ?? {}, [state.fieldErrors]);
  const err = useCallback((path: Path) => errors[`content.${path.join(".")}`]?.[0], [errors]);
  const typeLabel = meta.types.find((t) => t.value === type)?.label ?? "Block";
  const ctx = useMemo(() => ({ content, set, err, media: block?.media ?? {}, brands }), [content, set, err, block?.media, brands]);

  // Field errors the form has no field for (a whole list, a key it no longer shows).
  const stray = Object.entries(errors).filter(([k]) => !k.startsWith("content.") && !["name", "slug", "layout", "status", "is_default"].includes(k));

  return (
    <Form action={formAction} state={state}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="layout" value={layout} />
      <input type="hidden" name="content" value={JSON.stringify(content)} />

      {state.error && (
        <Alert tone="err" title="Could not save">
          {state.error}
          {(stray.length > 0 || errors["content"]) && (
            <ul className="mt-1 list-disc pl-5">
              {errors["content"] && <li>{errors["content"][0]}</li>}
              {stray.map(([k, v]) => <li key={k}>{v[0]}</li>)}
            </ul>
          )}
        </Alert>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-15 font-semibold">Layout</h2>
        {errors.layout && <p className="mb-2 text-12-5 text-err">{errors.layout[0]}</p>}
        <div role="radiogroup" aria-label={`${typeLabel} layout`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {layouts.map((l) => (
            <label
              key={l.value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-4 transition-colors duration-(--duration-base)",
                layout === l.value ? "border-brand-600 ring-2 ring-brand-500/30" : "border-line-strong hover:border-brand-300",
              )}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="_layout_choice" className="accent-brand-600" checked={layout === l.value} onChange={() => setLayout(l.value)} />
                <span className="text-14 font-semibold">{l.label}</span>
              </span>
              <span className="text-12-5 text-muted">{l.blurb}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8 grid gap-x-4 lg:grid-cols-[1fr_1fr_12rem]">
        <Field label="Name" htmlFor="name" error={errors.name?.[0]} hint="For you — the console lists it by this.">
          <Input id="name" name="name" defaultValue={block?.name ?? ""} required />
        </Field>
        <Field label="Slug" htmlFor="slug" error={errors.slug?.[0]} hint="The shortcode's name. Changing it breaks every page that embeds the old one. Blank makes one from the name.">
          <Input id="slug" name="slug" defaultValue={block?.slug ?? ""} />
        </Field>
        <Field label="Status" htmlFor="status" variant="float-static" error={errors.status?.[0]}>
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </section>

      {type === "cta" && (
        <div className="-mt-4 mb-8">
          <label htmlFor="is_default" className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-13-5">
            <input id="is_default" type="checkbox" name="is_default" value="1" className="size-4 accent-brand-600" defaultChecked={block?.is_default ?? false} />
            Use as the site default — the closing band at the foot of every page
          </label>
          <p className="mt-1 text-12-5 text-faint">
            Only a published banner can be the default, and only one at a time. Pages with their own heading keep it; they take the buttons and layout from here.
          </p>
          {errors.is_default && <p className="mt-1 text-12-5 text-err">{errors.is_default[0]}</p>}
        </div>
      )}

      <section className="mb-4">
        <h2 className="mb-3 text-15 font-semibold">Content</h2>
        <BlockEditorProvider value={ctx}>
          {type === "cta" && <CtaEditor layout={layout} />}
          {type === "stats" && <StatsEditor layout={layout} />}
          {type === "pricing" && <PricingEditor layout={layout} />}
          {type === "stack" && <StackEditor layout={layout} />}
        </BlockEditorProvider>
      </section>

      {block && (
        <section className="mb-6 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="text-14 font-semibold">Embed this</h2>
          <p className="mt-1 text-12-5 text-muted">Paste into any page, post or article body:</p>
          <code className="mt-2 block font-mono text-13 select-all">{block.shortcode}</code>
        </section>
      )}

      <FormActions>
        <Button type="submit" pending={pending}>{block ? "Save" : `Create ${typeLabel.toLowerCase()}`}</Button>
      </FormActions>
    </Form>
  );
}
