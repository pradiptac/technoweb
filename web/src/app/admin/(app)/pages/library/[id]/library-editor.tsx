"use client";

import { useEffect, useState, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { FormActions, SaveStatus } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import { REVISION_LOAD_EVENT, type RevisionLoad } from "@/lib/revisions";
import { useSaveStatus } from "@/lib/hooks/use-save-status";
import type { PageBuilderOptions, SavedSection, StoredSection } from "@/types/api";
import { SectionBuilder } from "../../builder/section-builder";
import { updateLibraryAction } from "../../library-actions";
import { DeleteLibraryButton } from "../delete-button";

/**
 * A library item in the page builder. It saves through a function rather than
 * a `<Form>` — the stack is state, not inputs — so it is `useSaveStatus()`
 * and `FormActions` with `dirty`, the menu builder's shape.
 */
export function LibraryEditor({ item, options }: { item: SavedSection; options: PageBuilderOptions }) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [category, setCategory] = useState(item.category ?? "");
  const [sections, setSectionsState] = useState<StoredSection[]>(item.blocks ?? []);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const { dirty, saving, message, touch, run } = useSaveStatus();
  const template = item.kind === "template";
  // A version from this item's history (0.145.0): in the fields, not saved, until Save is pressed.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [loadedMedia, setLoadedMedia] = useState<Record<string, string>>({});

  useEffect(() => {
    const onLoad = (event: Event) => {
      const detail = (event as CustomEvent<RevisionLoad>).detail;
      if (detail?.type !== "saved_section" || detail.id !== item.id) return;
      setName(detail.snapshot.name ?? "");
      setDescription(detail.snapshot.description ?? "");
      setSectionsState(detail.snapshot.blocks ?? []);
      setLoadedMedia((prev) => ({ ...prev, ...detail.media }));
      setLoaded(detail.at ?? "");
      touch();
    };
    document.addEventListener(REVISION_LOAD_EVENT, onLoad);
    return () => document.removeEventListener(REVISION_LOAD_EVENT, onLoad);
  }, [item.id, touch]);

  const setSections = (next: SetStateAction<StoredSection[]>) => { setSectionsState(next); touch(); };

  const save = () => run(async () => {
    const result = await updateLibraryAction(item.id, {
      name: name.trim(),
      description: template ? (description.trim() || null) : undefined,
      category: template ? (category || null) : undefined,
      blocks: sections,
    });
    setErrors(result.fieldErrors ?? {});
    if (result.ok) { setLoaded(null); router.refresh(); }
    return { error: result.ok ? null : (result.error ?? "It could not be saved.") };
  }, "Saved.");

  return (
    <div className="grid gap-4">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="library-name" error={errors.name?.[0]}>
          <Input id="library-name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); touch(); }} />
        </Field>
        {template && (
          <Field label="Description (optional)" htmlFor="library-description" error={errors.description?.[0]}>
            <Input id="library-description" value={description} maxLength={300} onChange={(e) => { setDescription(e.target.value); touch(); }} />
          </Field>
        )}
        {template && (options.library?.categories?.length ?? 0) > 0 && (
          <Field label="Category" htmlFor="library-category" variant="float-static" error={errors.category?.[0]}>
            <Select id="library-category" value={category} onChange={(e) => { setCategory(e.target.value); touch(); }}>
              <option value="">No category</option>
              {options.library!.categories!.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
        )}
      </div>

      {loaded !== null && (
        <Alert tone="info" title={loaded ? `Loaded the version from ${formatDate(loaded, "dateTime")}.` : "Loaded an earlier version."}>
          Press Save to keep it — nothing has been saved yet. Leave without saving and the item stays as it was.
        </Alert>
      )}

      {errors.blocks?.[0] && <p role="alert" className="text-13 text-err">{errors.blocks[0]}</p>}

      <SectionBuilder
        sections={sections}
        setSections={setSections}
        options={options}
        media={{ ...(item.blocks_media ?? {}), ...loadedMedia }}
        errors={errors}
        pageId={null}
        inLibrary
      />

      {(item.linked_from?.length ?? 0) > 0 && (
        <p className="text-13 text-muted">
          Placed linked on {item.linked_from!.map((u) => u.title).join(", ")}.
        </p>
      )}

      <FormActions dirty={dirty} onSave={save}>
        <Button type="button" pending={saving} disabled={saving || !name.trim()} onClick={save}>Save</Button>
        <SaveStatus dirty={dirty} message={message} />
        <span className="ml-auto">
          <DeleteLibraryButton id={item.id} name={item.name} onDeleted={() => router.push("/admin/pages/library")} />
        </span>
      </FormActions>
    </div>
  );
}
