"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { previewAction, templateAction } from "../actions";
import type { NewsletterTemplate } from "@/types/api";

/**
 * The gallery, previewing the real thing.
 *
 * No thumbnails. A thumbnail is a picture of what a template looked like when
 * somebody generated it, and it goes stale the moment the renderer or the
 * branding changes — the preview here renders through the same path a send
 * uses, so what is shown is what would arrive.
 *
 * Rendered on demand rather than all at once: ten templates is ten iframes and
 * ten API calls to draw a grid nobody has looked at yet.
 */
export function TemplateGallery({ templates }: { templates: NewsletterTemplate[] }) {
  const [chosen, setChosen] = useState<NewsletterTemplate>(templates[0]);
  const [rendered, setRendered] = useState<{ id: number; html: string } | null>(null);

  useEffect(() => {
    let live = true;

    /*
      The full template is fetched here, because the index omits `blocks`.
      Previewing `chosen.blocks ?? []` would render an empty document that
      looks like a template with nothing in it — which is exactly what it did.
    */
    void templateAction(chosen.id)
      .then((full) => previewAction(full?.blocks ?? []))
      .then((html) => { if (live) setRendered({ id: chosen.id, html }); });

    return () => { live = false; };
  }, [chosen]);

  /*
    Derived rather than a flag set inside the effect. "Is this the preview for
    the template on screen" is a comparison, and setting a `loading` state
    synchronously in an effect body is a cascading render the lint rule
    correctly forbids.
  */
  const preview = rendered?.id === chosen.id ? rendered.html : "";
  const loading = rendered?.id !== chosen.id;

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
      <ul className="grid gap-2">
        {templates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setChosen(t)}
              aria-pressed={chosen.id === t.id}
              className={cn(
                "w-full rounded-lg border p-3 text-left",
                chosen.id === t.id
                  ? "border-brand-600 bg-brand-50"
                  : "border-line-strong bg-card hover:border-faint",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.name}</span>
                {t.is_system
                  ? <Badge tone="closed">Built in</Badge>
                  : <Badge tone="brand">Yours</Badge>}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted">{t.description}</p>
            </button>
          </li>
        ))}
      </ul>

      <div className="lg:sticky lg:top-16">
        <h2 className="mb-2 text-[13px] font-semibold">
          {chosen.name}
          {loading && <span className="ml-2 font-normal text-faint">rendering…</span>}
        </h2>

        {/*
          Sandboxed with nothing granted: a template carries a full document
          and its own `<style>`, which would otherwise leak into the console
          and let one restyle the page around it.
        */}
        <iframe
          title={`${chosen.name} preview`}
          srcDoc={preview}
          sandbox=""
          className="h-[72vh] w-full rounded-lg border border-line-strong bg-white"
        />
      </div>
    </div>
  );
}
