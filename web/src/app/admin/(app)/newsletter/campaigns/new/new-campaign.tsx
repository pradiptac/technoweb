"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Alert } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createCampaignAction, previewAction, templateAction } from "../../actions";
import type { NewsletterTemplate } from "@/types/api";

/**
 * Choosing a template, and naming the campaign.
 *
 * The gallery previews the real rendered HTML rather than a screenshot: a
 * thumbnail is a picture of what a template looked like when somebody
 * generated it, and this project already documents what happens when the
 * preview and the thing previewed are produced by two different code paths.
 */
export function NewCampaign({ templates }: { templates: NewsletterTemplate[] }) {
  const [chosen, setChosen] = useState<NewsletterTemplate | null>(null);
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null);
  const [state, action, pending] = useActionState(createCampaignAction, {});

  useEffect(() => {
    if (!chosen) return;

    let live = true;

    // Fetched rather than read off `chosen`: the gallery index carries no
    // blocks, so previewing what it has renders an empty email.
    void templateAction(chosen.id)
      .then((full) => previewAction(full?.blocks ?? []))
      .then((html) => { if (live) setPreview({ id: chosen.id, html }); });

    return () => { live = false; };
  }, [chosen]);

  // Derived, so choosing "Blank" needs no setState inside the effect — the
  // pane simply has nothing whose id matches.
  const html = chosen && preview?.id === chosen.id ? preview.html : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px] lg:items-start">
      <div>
        {state.error && <Alert tone="err" title="Not created">{state.error}</Alert>}

        <h2 className="mb-2 text-[13px] font-semibold">Start from</h2>

        <ul className="mb-4 grid gap-2 sm:grid-cols-2">
          <li>
            <button
              type="button"
              onClick={() => setChosen(null)}
              aria-pressed={chosen === null}
              className={cn(
                "w-full rounded-lg border p-3.5 text-left",
                chosen === null ? "border-brand-600 bg-brand-50" : "border-line-strong bg-card hover:border-faint",
              )}
            >
              <p className="text-[13px] font-semibold">Blank</p>
              <p className="mt-0.5 text-[12.5px] text-muted">An empty body you build yourself.</p>
            </button>
          </li>

          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setChosen(t)}
                aria-pressed={chosen?.id === t.id}
                className={cn(
                  "w-full rounded-lg border p-3.5 text-left",
                  chosen?.id === t.id ? "border-brand-600 bg-brand-50" : "border-line-strong bg-card hover:border-faint",
                )}
              >
                <p className="text-[13px] font-semibold">{t.name}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{t.description}</p>
              </button>
            </li>
          ))}
        </ul>

        <form action={action} className="grid gap-2.5 rounded-lg border border-line-strong bg-card p-3.5">
          <input type="hidden" name="template_id" value={chosen?.id ?? ""} />
          {/*
            No blocks are posted: the API copies them from the template id.
            Sending them from here would mean posting what the gallery happens
            to hold, and the gallery deliberately holds none.
          */}

          <Field label="Campaign name" htmlFor="name" variant="float"
            hint="For you — it never appears in the email.">
            <Input id="name" name="name" required />
          </Field>

          <Field label="Subject" htmlFor="subject" variant="float"
            hint="You can change this later; nothing is sent until you say so.">
            <Input id="subject" name="subject" required />
          </Field>

          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Creating…" : "Create and edit"}
            </Button>
          </div>
        </form>
      </div>

      <aside className="lg:sticky lg:top-16">
        <h2 className="mb-2 text-[13px] font-semibold">
          {chosen ? chosen.name : "Preview"}
        </h2>

        {chosen ? (
          <iframe
            title={`${chosen.name} preview`}
            srcDoc={html}
            sandbox=""
            className="h-[62vh] w-full rounded-lg border border-line-strong bg-white"
          />
        ) : (
          <div className="grid h-[62vh] place-items-center rounded-lg border border-dashed border-line-strong bg-surface px-6 text-center">
            <p className="measure text-[13px] text-muted">
              Choose a template to see it. A blank campaign starts with nothing in the body.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
