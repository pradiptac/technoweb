"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { TemplateCategory } from "@/types/api";
import { TemplatePreview } from "./template-preview";

export type TemplateChoice = {
  id: number;
  name: string;
  description: string | null;
  count: number;
  category: string | null;
  category_label: string | null;
};

type Mode = "add" | "replace";

/**
 * "Apply a template" (0.162.0, docs/page-builder.md "The library"): the page
 * templates by category, each with its name, description and section count
 * and a Preview that draws it in the public site's own sections.
 *
 * On a page that already has sections a template is **added at the end** or
 * **replaces all of them**; replacing names how many go and asks first. On an
 * empty page there is nothing to choose between, so the one button is "Use
 * this template". Either way the sections are copied in with fresh ids as a
 * single undo step by the builder (`apply`), and nothing is saved until the
 * page is — the dialog says so.
 */
export function TemplatePicker({ open, onClose, templates, categories, sectionCount, onApply }: {
  open: boolean;
  onClose: () => void;
  templates: TemplateChoice[];
  categories: TemplateCategory[];
  /** How many sections the page has now. */
  sectionCount: number;
  /** Copies the template in; resolves once it has been, or the builder has said why not. */
  onApply: (id: number, mode: Mode) => Promise<void>;
}) {
  const [category, setCategory] = useState<string>("");
  const [confirming, setConfirming] = useState<TemplateChoice | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<TemplateChoice | null>(null);

  // Only the categories something is filed under are offered as filters.
  const used = categories.filter((c) => templates.some((t) => t.category === c.value));
  const shown = category ? templates.filter((t) => t.category === category) : templates;
  const empty = sectionCount === 0;

  const close = () => { setConfirming(null); onClose(); };
  const apply = async (t: TemplateChoice, mode: Mode) => {
    setBusy(t.id);
    await onApply(t.id, mode);
    setBusy(null);
    setConfirming(null);
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={close} size="lg" title={empty ? "Start from a template" : "Apply a template"}
        description="Every section is copied into this page, so the page can change without changing the template. Nothing is saved until you press Save on the page.">
        <div data-template-picker>
          {confirming ? (
            <div role="alertdialog" aria-label="Replace all sections" className="grid gap-3 rounded-lg border border-err/25 bg-err-soft p-4">
              <p className="text-14 font-semibold text-err">
                Replace {sectionCount} section{sectionCount === 1 ? "" : "s"} with “{confirming.name}”?
              </p>
              <p className="text-13 text-ink-2">
                The {sectionCount} section{sectionCount === 1 ? "" : "s"} on this page are taken out of the builder and the template’s
                {" "}{confirming.count} go in. Undo brings the old ones back; nothing is saved until you press Save.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" size="sm" pending={busy === confirming.id} disabled={busy !== null}
                  onClick={() => apply(confirming, "replace")}>
                  Replace {sectionCount} section{sectionCount === 1 ? "" : "s"}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirming(null)}>Back</Button>
              </div>
            </div>
          ) : (
            <>
              {used.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Template category">
                  {[{ value: "", label: "All" }, ...used].map((c) => (
                    <button key={c.value} type="button" aria-pressed={category === c.value} onClick={() => setCategory(c.value)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-12-5 font-medium transition-colors duration-(--duration-base)",
                        category === c.value ? "border-brand-ink bg-brand-600 text-brand-on" : "border-line-strong bg-card text-ink-2 hover:border-brand-300",
                      )}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              {shown.length === 0 ? (
                <p className="text-13 text-muted">No page templates in that category yet.</p>
              ) : (
                <ul className="grid gap-2">
                  {shown.map((t) => (
                    <li key={t.id} data-template-id={t.id} className="grid gap-2 rounded-lg border border-line-strong bg-card p-3.5">
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-14 font-semibold">{t.name}</span>
                          <span className="block text-12-5 text-muted">{t.description || "No description."}</span>
                        </span>
                        {t.category_label && <Badge tone="progress">{t.category_label}</Badge>}
                        <span className="text-12 text-faint">{t.count} section{t.count === 1 ? "" : "s"}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {empty ? (
                          <Button type="button" size="sm" pending={busy === t.id} disabled={busy !== null} onClick={() => apply(t, "add")}>
                            Use this template
                          </Button>
                        ) : (
                          <>
                            <Button type="button" size="sm" pending={busy === t.id} disabled={busy !== null} onClick={() => apply(t, "add")}
                              title="Its sections go after the ones on this page">
                              Add at the end
                            </Button>
                            <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirming(t)}
                              title="Takes the page’s sections out first, after asking">
                              Replace all sections
                            </Button>
                          </>
                        )}
                        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setPreviewing(t)}>
                          Preview<span className="sr-only"> {t.name}</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </Modal>
      {/* Stacked over the picker, which stays open under it: a programmatic close of a Modal also tells its parent. */}
      <TemplatePreview item={previewing} onClose={() => setPreviewing(null)} />
    </>
  );
}
