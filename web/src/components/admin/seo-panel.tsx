"use client";

import { useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { Seo, SeoOverride } from "@/types/api";

/**
 * The SEO override panel, shared by every CMS entity.
 *
 * `seo` is what the editor actually typed — nulls included. `defaults` is what
 * the site derives when nothing is typed, shown as placeholder text so an
 * editor can see what they are overriding before they override it.
 *
 * The fields stay mounted while collapsed and are hidden rather than
 * unmounted. Unmounting drops them out of the form, and a missing checkbox
 * reads as false — which silently dropped posts from sitemap.xml.
 */
export function SeoPanel({
  seo, defaults, error,
}: {
  seo?: SeoOverride;
  defaults?: Seo;
  error: (field: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-2 rounded-lg border border-line-strong bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="text-[14.5px] font-semibold">SEO overrides</span>
          <span className="mt-0.5 block text-[13px] text-muted">
            Everything here is generated from the content unless you type something.
          </span>
        </span>
        <span className="text-[13px] font-semibold text-brand-600">{open ? "Hide" : "Edit"}</span>
      </button>

      <div hidden={!open}>
        <div className="border-t border-line px-5 pt-5 pb-1">
          <Field label="Meta title" htmlFor="seo_title" error={error("title")}>
            <Input id="seo_title" name="seo_title" defaultValue={seo?.title ?? ""}
              placeholder={defaults?.title ?? ""} />
          </Field>

          <Field label="Meta description" htmlFor="seo_description" error={error("description")}
            hint="Over 320 characters and search engines truncate it.">
            <Textarea id="seo_description" name="seo_description" rows={2}
              defaultValue={seo?.description ?? ""} placeholder={defaults?.description ?? ""} />
          </Field>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Canonical URL" htmlFor="seo_canonical_url" error={error("canonical_url")}>
              <Input id="seo_canonical_url" name="seo_canonical_url" defaultValue={seo?.canonical_url ?? ""}
                placeholder={defaults?.canonical_url ?? ""} />
            </Field>

            <Field label="Robots" htmlFor="seo_robots" error={error("robots")}>
              <Input id="seo_robots" name="seo_robots" defaultValue={seo?.robots ?? ""}
                placeholder={defaults?.robots ?? "index, follow"} />
            </Field>
          </div>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Focus keyword" htmlFor="seo_focus_keyword" error={error("focus_keyword")}>
              <Input id="seo_focus_keyword" name="seo_focus_keyword" defaultValue={seo?.focus_keyword ?? ""} />
            </Field>

            <Field label="Schema type" htmlFor="seo_schema_type" error={error("schema_type")}>
              <Input id="seo_schema_type" name="seo_schema_type" defaultValue={seo?.schema_type ?? ""}
                placeholder={defaults?.schema_type ?? ""} />
            </Field>
          </div>

          <Field label="Social title" htmlFor="seo_og_title" error={error("og_title")}>
            <Input id="seo_og_title" name="seo_og_title" defaultValue={seo?.og_title ?? ""}
              placeholder={defaults?.og_title ?? ""} />
          </Field>

          <Field label="Social description" htmlFor="seo_og_description" error={error("og_description")}>
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
  );
}
