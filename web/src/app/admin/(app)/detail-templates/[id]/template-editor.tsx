"use client";

import { useMemo, useState, useTransition, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { FormActions, SaveStatus } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useSaveStatus } from "@/lib/hooks/use-save-status";
import type { TemplateRecordOption } from "@/lib/admin/detail-templates";
import type { AdminDetailTemplate, DetailTemplateKind, PageBuilderOptions, StoredSection } from "@/types/api";
import { SectionBuilder } from "../../pages/builder/section-builder";
import { recordBuilderOptions } from "../../pages/builder/record-sections";
import { activateTemplateAction, deactivateTemplateAction, deleteTemplateAction, saveTemplateAction } from "../actions";
import { TemplatePreview } from "./template-preview";

/**
 * A detail template in the section builder (0.161.0). It saves through a
 * function rather than a `<Form>` — the stack is state, not inputs — so it is
 * `useSaveStatus()` and `FormActions` with `dirty`, the library editor's shape.
 *
 * The builder gets the options a record's body area gets (no hero, no theme
 * sections, no page templates) plus the kind's own record blocks, offered under
 * "Add a section". Switching a template on or off acts on what is **saved**,
 * so it waits for a save rather than quietly switching on something other than
 * what is on screen.
 */
export function TemplateEditor({ template, options, kind, records }: {
  template: AdminDetailTemplate;
  options: PageBuilderOptions;
  kind: DetailTemplateKind;
  records: TemplateRecordOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(template.name);
  const [sections, setSectionsState] = useState<StoredSection[]>(template.blocks ?? []);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  // A refused preview marks the cards the way a refused save does, until the next save answers.
  const [previewErrors, setPreviewErrors] = useState<Record<string, string[]> | null>(null);
  const { dirty, saving, message, touch, run } = useSaveStatus();
  const [switching, startSwitch] = useTransition();
  const builderOptions = useMemo(() => recordBuilderOptions(options), [options]);

  const setSections = (next: SetStateAction<StoredSection[]>) => { setSectionsState(next); touch(); };

  const save = () => run(async () => {
    const result = await saveTemplateAction(template.id, { name: name.trim(), blocks: sections });
    setErrors(result.fieldErrors ?? {});
    setPreviewErrors(null);
    if (result.ok) router.refresh();
    return { error: result.ok ? null : (result.error ?? "It could not be saved.") };
  }, "Saved.");

  const toggle = (on: boolean) => startSwitch(async () => {
    const result = await (on ? activateTemplateAction : deactivateTemplateAction)(template.id);
    if (!result.ok) {
      toast({ tone: "err", title: result.error ?? "It could not be changed." });
      return;
    }
    toast({
      tone: "ok",
      title: on ? `“${template.name}” is on` : `“${template.name}” is off`,
      body: on ? `Every ${kind.noun} page now follows it.` : `${kind.label} are back to the layout they have in code.`,
    });
    router.refresh();
  });

  const remove = () => startSwitch(async () => {
    const warning = template.is_active
      ? `Delete “${template.name}”? It is switched on, so every ${kind.noun} page goes back to its layout in code.`
      : `Delete “${template.name}”? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    const result = await deleteTemplateAction(template.id);
    if (!result.ok) {
      toast({ tone: "err", title: result.error ?? "It could not be deleted." });
      return;
    }
    router.push("/admin/detail-templates");
  });

  return (
    <div className="grid gap-4">
      <div className="max-w-xl">
        <Field label="Name" htmlFor="template-name" error={errors.name?.[0]}>
          <Input id="template-name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); touch(); }} />
        </Field>
      </div>

      {errors.blocks?.[0] && <Alert tone="err" title="The template needs attention" dismissible={false}>{errors.blocks[0]}</Alert>}

      <SectionBuilder
        sections={sections}
        setSections={setSections}
        options={builderOptions}
        media={template.blocks_media ?? {}}
        errors={previewErrors ?? errors}
        pageId={null}
        kind={kind}
        previewSlot={(
          <TemplatePreview kind={kind} records={records} sections={sections} onErrors={setPreviewErrors} />
        )}
      />

      <FormActions dirty={dirty} onSave={save}>
        <Button type="button" pending={saving} disabled={saving || !name.trim()} onClick={save}>Save</Button>
        {template.is_active ? (
          <Button type="button" variant="secondary" pending={switching} disabled={switching || dirty} onClick={() => toggle(false)}
            title={dirty ? "Save first" : undefined}>
            Switch off
          </Button>
        ) : (
          <Button type="button" variant="secondary" pending={switching} disabled={switching || dirty} onClick={() => toggle(true)}
            title={dirty ? "Save first: switching on uses the saved template" : undefined}>
            Switch on
          </Button>
        )}
        <SaveStatus dirty={dirty} message={message} />
        <span className="ml-auto">
          <Button type="button" variant="destructive" size="sm" disabled={switching} onClick={remove}>Delete template</Button>
        </span>
      </FormActions>
    </div>
  );
}
