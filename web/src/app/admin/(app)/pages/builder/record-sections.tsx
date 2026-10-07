"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Field, Select } from "@/components/ui/input";
import type { TabGroup } from "@/components/admin/form-tabs";
import type { PageBuilderOptions, StoredSection } from "@/types/api";
import type { AdminRecordSections, RecordBodyLayout } from "@/types/page-sections";
import { SectionBuilder } from "./section-builder";

/**
 * Builder sections on a record that is not a page (0.129.0,
 * docs/page-builder.md "Sections on other records") — the console half, shared
 * by the solution, service, industry and case-study forms.
 *
 * A record's page keeps its theme heading, its related lists, its FAQs and
 * its closing band; what the sections replace is the **written body**, and
 * only while the record says so (`body_layout`). So a form gains one tab,
 * **Sections**, holding that choice and — once sections are chosen — the
 * page builder itself, with the three things a body area cannot hold taken
 * out of it (`recordBuilderOptions`). The written body stays on the Content
 * tab, still posted, and comes back when the choice is switched.
 *
 * The tab is always in the form's list and its panel is always mounted, the
 * rule every tabbed form here keeps: the choice and the list post from
 * hidden-but-present controls, and a 422 on `blocks.2.data.heading` has a
 * tab to land on whichever layout is chosen.
 */

/** The tab, for a form's `GROUPS` — second, straight after Content. */
export const SECTIONS_TAB: TabGroup = { id: "sections", label: "Sections", fields: ["body_layout", "blocks"] };

export type RecordSectionsState = {
  layout: RecordBodyLayout;
  setLayout: (layout: RecordBodyLayout) => void;
  sections: StoredSection[];
  setSections: Dispatch<SetStateAction<StoredSection[]>>;
  /** The page draws the sections — chosen, whether or not any are laid out yet. */
  usingSections: boolean;
};

/** The choice and the list, held by the form so its Content tab can say which is showing. */
export function useRecordSections(record?: AdminRecordSections): RecordSectionsState {
  const [layout, setLayout] = useState<RecordBodyLayout>(record?.body_layout === "sections" ? "sections" : "body");
  const [sections, setSections] = useState<StoredSection[]>(record?.blocks ?? []);

  return { layout, setLayout, sections, setSections, usingSections: layout === "sections" };
}

/**
 * The page builder's options as a record's body area may use them: no hero
 * and none of the theme's homepage sections (the page already opens on its
 * own heading), nothing from the library that is one of those, and no page
 * templates or starting stacks, which are whole pages. The excluded types
 * are the API's (`record_sections.excluded_types`) — it refuses them on save
 * whatever is offered here.
 */
export function recordBuilderOptions(builder: PageBuilderOptions): PageBuilderOptions {
  const excluded = new Set(builder.record_sections?.excluded_types ?? []);

  return {
    ...builder,
    in_record: true,
    section_types: builder.section_types.filter((t) => !excluded.has(t.value)),
    section_presets: [],
    library: {
      sections: (builder.library?.sections ?? []).filter((s) => !s.type || !excluded.has(s.type)),
      templates: [],
    },
  };
}

/** A line for the Content tab while the page is showing its sections instead of what is written there. */
export function BodyReplacedNote({ state, kept = "What is written below is kept, and comes back if the layout is switched." }: {
  state: RecordSectionsState;
  /** What stays stored while it is not shown, as a sentence. */
  kept?: string;
}) {
  if (!state.usingSections) return null;

  return (
    <p className="mb-[18px] rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-13-5 text-muted">
      This page’s body is laid out as sections — see the <strong>Sections</strong> tab. {kept}
    </p>
  );
}

export function RecordSectionsPanel({ state, builder, media, errors, bodyField, storedBody, noun }: {
  state: RecordSectionsState;
  /** `GET /admin/pages/builder` — the page builder's own options. */
  builder: PageBuilderOptions;
  /** The record's `blocks_media`: a URL for every stored path. */
  media: Record<string, string>;
  errors: Record<string, string[]>;
  /** The form control holding the written body (`body`, or a solution's `overview`). */
  bodyField: string;
  /** That body as stored — what the server render and the first client render both read. */
  storedBody: string;
  /** What the record is, for the sentences: "solution", "case study". */
  noun: string;
}) {
  const { layout, setLayout, sections, setSections, usingSections } = state;
  const input = useRef<HTMLInputElement>(null);
  const options = useMemo(() => recordBuilderOptions(builder), [builder]);
  const layouts = builder.record_sections?.layouts ?? [];

  // A structural change — add, move, hide, remove — fires no input event of
  // its own, so the draft keeper and the leave guard are told here.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    input.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [sections]);

  // `FormDraft` writes a restored draft into the hidden input; read it back.
  useEffect(() => {
    const field = input.current;
    const form = field?.closest("form");
    if (!field || !form) return;
    const restored = () => {
      try {
        const parsed = JSON.parse(field.value);
        if (Array.isArray(parsed)) setSections(parsed as StoredSection[]);
      } catch { /* not ours to fix */ }
      const chosen = form.elements.namedItem("body_layout");
      if (chosen instanceof HTMLSelectElement) setLayout(chosen.value === "sections" ? "sections" : "body");
    };
    form.addEventListener("tw:draft-restored", restored);
    return () => form.removeEventListener("tw:draft-restored", restored);
  }, [setSections, setLayout]);

  // The written body as it stands in the form (its editor is uncontrolled),
  // for the builder's "This page's content". On the server — the builder
  // renders there too — it is the stored body.
  const readBody = () => {
    if (typeof document === "undefined") return storedBody;
    const field = input.current?.closest("form")?.elements.namedItem(bodyField);
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : storedBody;
  };

  return (
    <div>
      <input ref={input} type="hidden" name="blocks" value={JSON.stringify(sections)} />

      <div className="max-w-xl">
        <Field label="The page’s body shows" htmlFor="body_layout" error={errors.body_layout?.[0]} variant="float-static"
          hint={layouts.find((l) => l.value === layout)?.blurb}>
          <Select id="body_layout" name="body_layout" value={layout}
            onChange={(e) => setLayout(e.target.value === "sections" ? "sections" : "body")}>
            {layouts.length > 0
              ? layouts.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)
              : <><option value="body">Written body</option><option value="sections">Sections</option></>}
          </Select>
        </Field>
      </div>

      <p className="measure mb-5 text-13-5 text-muted">
        {usingSections
          ? `Sections take the place of the ${noun}’s written body only. Its heading, related lists, FAQs and closing band stay where they are.`
          : `Choose Sections to lay the ${noun}’s body out as sections — the same ones a builder page uses. Its heading, related lists, FAQs and closing band stay where they are.`}
        {usingSections && sections.length === 0 && " Until a section is added, the page goes on showing the written body."}
      </p>

      {usingSections && (
        <SectionBuilder
          sections={sections}
          setSections={setSections}
          options={options}
          media={media}
          errors={errors}
          pageId={null}
          readBody={readBody}
        />
      )}
    </div>
  );
}
