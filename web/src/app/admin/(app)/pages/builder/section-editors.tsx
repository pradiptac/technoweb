"use client";

import Link from "next/link";
import { CoverField } from "@/components/admin/cover-field";
import { EditorField } from "@/components/admin/editor-field";
import { Field, Select } from "@/components/ui/input";
import {
  Choice, FilePath, IconPick, ImagePath, NumberInput, Repeater, Row, Text, Toggle, getIn, useBlock, type Path,
} from "../../blocks/editors/shared";
import type { PageBuilderOptions, PageSectionType } from "@/types/api";

/**
 * One section's fields, by type (`docs/page-builder.md`).
 *
 * Built from the content blocks' editor primitives (`blocks/editors/shared`)
 * — each field bound to a **path** into the section's `data` rather than to
 * an input name, so reordering sections is a state change, never a renaming,
 * and a 422 keyed `blocks.3.data.items.0.title` finds its field by the same
 * path. None of these controls is named: the whole list posts as one hidden
 * JSON input, and a named control inside it would post a second copy.
 *
 * Every select is fed by what the API sends (`GET /admin/pages/builder`):
 * the section types, the hero layouts, the card sources and the published
 * blocks, sliders, galleries, forms and categories — never a list written
 * here, the `meta.transitions` rule.
 */

/** What a freshly added section starts with: the choices a type needs made, made. */
export function blankData(type: PageSectionType): Record<string, unknown> {
  switch (type) {
    case "hero": return { layout: "centered" };
    case "rich_text": return {};
    case "media_text": return { media: "image", side: "right" };
    case "features": return { columns: 3, items: [{}] };
    case "cards": return { source: "solutions", limit: 6, columns: 3 };
    case "faq": return { source: "custom", items: [{}] };
    case "logos": return { source: "clients" };
    case "video": return { source: "youtube" };
    case "divider": return { size: "medium", rule: true };
    case "stats": return { display: "figures", columns: 4, items: [{}, {}, {}] };
    case "steps": return { layout: "vertical", items: [{}, {}, {}] };
    case "tabs": return { items: [{}, {}] };
    case "checklist": return { columns: 2, items: [{}, {}, {}] };
    case "cta": return { tone: "accent", call: true };
    case "comparison": return { plans: [{}, {}], rows: [{}, {}, {}] };
    case "timeline": return { items: [{}, {}, {}] };
    case "before_after": return { before_label: "Before", after_label: "After", start: 50 };
    case "testimonials": return { items: [{}, {}, {}] };
    case "team": return {};
    case "downloads": return { items: [{}] };
    case "countdown": return {};
    case "columns": return { columns: [{}, {}] };
    case "map": return {};
    default: return {};
  }
}

/** A one-line reminder of what a collapsed section holds. */
export function summaryOf(data: Record<string, unknown>): string {
  for (const key of ["heading", "quote", "kicker"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const COLUMNS = [{ value: "2", label: "Two" }, { value: "3", label: "Three" }, { value: "4", label: "Four" }];
const LIST_COLUMNS = [{ value: "1", label: "One" }, { value: "2", label: "Two" }, { value: "3", label: "Three" }];

/** The kicker, heading and lede most bands open with. */
function Head() {
  return (
    <>
      <Text path={["kicker"]} label="Kicker" />
      <Text path={["heading"]} label="Heading" />
      <Text path={["lede"]} label="Lede" multiline />
    </>
  );
}

/**
 * A select over a **number** — columns, and the id of a block, slider,
 * gallery or form. The shared `Choice` reads strings only, and these are
 * stored as integers (`SectionRules::normalise`), so through it a saved
 * "four columns" or a chosen slider would show as the fallback.
 */
function NumberChoice({ path, label, options, placeholder, hint }: {
  path: Path;
  label: string;
  options: { value: string; label: string }[];
  /** An empty first option — "Choose…" — for a reference nothing has picked yet. */
  placeholder?: string;
  hint?: string;
}) {
  const { content, set, err, idPrefix } = useBlock();
  const value = getIn(content, path);
  const id = `${idPrefix ?? "b"}-${path.join("-")}`;
  const current = typeof value === "number" || typeof value === "string" ? String(value) : placeholder !== undefined ? "" : options[0]?.value ?? "";

  return (
    <Field label={label} htmlFor={id} hint={hint} error={err(path)} variant="float-static">
      <Select id={id} value={current} onChange={(e) => set(path, e.target.value === "" ? undefined : Number(e.target.value))}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

function Buttons() {
  return (
    <fieldset className="mb-2">
      <legend className="mb-2 text-14 font-semibold">Buttons</legend>
      <Row>
        <Text path={["primary", "label"]} label="First button — label" />
        <Text path={["primary", "href"]} label="First button — link" placeholder="/contact" />
      </Row>
      <Row>
        <Text path={["secondary", "label"]} label="Second button — label" />
        <Text path={["secondary", "href"]} label="Second button — link" />
      </Row>
    </fieldset>
  );
}

/** A video from the library — the slide repeater's picker, widened to MP4. */
function VideoPath({ path, label }: { path: Path; label: string }) {
  const { content, set, err, media, idPrefix } = useBlock();
  const value = getIn(content, path);
  const stored = typeof value === "string" ? value : null;
  const message = err(path);

  return (
    <div>
      <CoverField
        name={`_media_${idPrefix ?? "b"}-${path.join("-")}`}
        label={label}
        accept=".mp4,.webm"
        hint="An MP4 from the media library. Keep it short and small — it loads when somebody presses play."
        defaultPath={stored}
        defaultUrl={stored ? media[stored] ?? null : null}
        onPathChange={(p) => set(path, p ?? undefined)}
      />
      {message && <p className="-mt-3 mb-4 text-12-5 text-err">{message}</p>}
    </div>
  );
}

/** The body editor, bound to `data.body`. Named only so a draft can carry it back; the API never reads the name. */
function Body({ sectionId, label = "Text" }: { sectionId: string; label?: string }) {
  const { content, set, err } = useBlock();
  const value = getIn(content, ["body"]);

  return (
    <EditorField
      name={`_sb_${sectionId}_body`}
      label={label}
      defaultValue={typeof value === "string" ? value : ""}
      error={err(["body"])}
      hint="Shortcodes work here, as in any page body."
      onChange={(html) => set(["body"], html || undefined)}
    />
  );
}

/**
 * Plans, then rows with one cell per plan. A row's cells are addressed by
 * the plan's position, so the inputs are labelled with each plan's name and
 * a removed plan takes its column of cells with it.
 */
function ComparisonEditor() {
  const { content, set } = useBlock();
  const plans = Array.isArray(content.plans) ? (content.plans as { name?: string }[]) : [];
  const highlightOptions = [{ value: "", label: "None" }, ...plans.map((p, i) => ({ value: String(i), label: p?.name || `Plan ${i + 1}` }))];

  // Removing a plan removes that position from every row, so cells stay under
  // their plans — one write, because each `set` starts from the same snapshot.
  const removePlan = (i: number) => {
    const rows = Array.isArray(content.rows) ? (content.rows as { cells?: unknown[] }[]) : [];
    const hl = typeof content.highlight === "number" ? content.highlight : null;
    const next: Record<string, unknown> = {
      ...content,
      plans: plans.filter((_, j) => j !== i),
      rows: rows.map((r) => (Array.isArray(r?.cells) ? { ...r, cells: r.cells.filter((_, j) => j !== i) } : r)),
    };
    if (hl === null || hl === i) delete next.highlight;
    else if (hl > i) next.highlight = hl - 1;
    set([], next as never);
  };

  return (
    <>
      <Head />
      <fieldset className="mb-6">
        <legend className="mb-1 text-14 font-semibold">Plans, across the top</legend>
        <p className="mb-3 text-12-5 text-faint">Two to four.</p>
        <ol className="grid gap-3 sm:grid-cols-2">
          {plans.map((_, i) => (
            <li key={i} className="rounded-lg border border-line-strong bg-card p-4">
              <Text path={["plans", i, "name"]} label={`Plan ${i + 1} — name`} required />
              <Text path={["plans", i, "note"]} label="Under the name" placeholder="₹9,000 a year" />
              {plans.length > 2 && (
                <button type="button" onClick={() => removePlan(i)} className="text-12-5 font-semibold text-err underline">Remove this plan</button>
              )}
            </li>
          ))}
        </ol>
        {plans.length < 4 && (
          <button type="button" onClick={() => set(["plans"], [...plans, {}] as never)} className="mt-3 rounded border border-line-strong bg-card px-3 py-1.5 text-13 font-semibold">Add a plan</button>
        )}
      </fieldset>
      <NumberChoice path={["highlight"]} label="Recommended plan" options={highlightOptions.slice(1)} placeholder="None" />
      <Repeater path={["rows"]} label="Rows, down the side" subject="Row" min={1} max={20} blank={() => ({})}
        hint="In each cell: yes for a tick, no for a cross, a few words, or leave it blank." row={(p) => (
          <>
            <Text path={[...p, "label"]} label="Feature" required />
            <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan, j) => (
                <Text key={j} path={[...p, "cells", j]} label={plan?.name || `Plan ${j + 1}`} placeholder="yes" />
              ))}
            </div>
          </>
        )} />
      <Text path={["primary", "label"]} label="Button under the table — label" />
      <Text path={["primary", "href"]} label="Button under the table — link" placeholder="/contact" />
    </>
  );
}

/** Each column's heading and editor body; the bodies are cleaned on save like any page body. */
function ColumnsEditor({ sectionId }: { sectionId: string }) {
  const { content, set, err } = useBlock();
  const columns = Array.isArray(content.columns) ? (content.columns as { heading?: string; body?: string }[]) : [];

  return (
    <>
      <Head />
      <fieldset className="mb-6">
        <legend className="mb-1 text-14 font-semibold">Columns</legend>
        <p className="mb-3 text-12-5 text-faint">Two or three, side by side from tablet width.</p>
        <ol className="grid gap-4">
          {columns.map((c, i) => (
            <li key={i} className="rounded-lg border border-line-strong bg-card p-4">
              <Text path={["columns", i, "heading"]} label={`Column ${i + 1} — heading`} />
              <EditorField
                name={`_sb_${sectionId}_col${i}`}
                label="Text"
                defaultValue={typeof c?.body === "string" ? c.body : ""}
                error={err(["columns", i, "body"])}
                onChange={(html) => set(["columns", i, "body"], html || undefined)}
              />
              {columns.length > 2 && (
                <button type="button" onClick={() => set(["columns"], columns.filter((_, j) => j !== i) as never)} className="text-12-5 font-semibold text-err underline">Remove this column</button>
              )}
            </li>
          ))}
        </ol>
        {columns.length < 3 && (
          <button type="button" onClick={() => set(["columns"], [...columns, {}] as never)} className="mt-3 rounded border border-line-strong bg-card px-3 py-1.5 text-13 font-semibold">Add a column</button>
        )}
      </fieldset>
    </>
  );
}

function Picker({ path, label, options, empty, emptyHref }: {
  path: Path;
  label: string;
  options: { value: string; label: string }[];
  empty: string;
  emptyHref: string;
}) {
  if (!options.length) {
    return (
      <p className="mb-[18px] rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-13-5 text-muted">
        {empty} <Link href={emptyHref} className="font-semibold text-brand-ink underline">Make one</Link>.
      </p>
    );
  }
  return <NumberChoice path={path} label={label} options={options} placeholder="Choose…" />;
}

export function SectionEditor({ type, sectionId, options }: {
  type: string;
  sectionId: string;
  options: PageBuilderOptions;
}) {
  const { content } = useBlock();

  switch (type) {
    case "hero": {
      const layout = typeof content.layout === "string" ? content.layout : "centered";
      return (
        <>
          <Choice path={["layout"]} label="Layout" options={options.hero_layouts} fallback="centered"
            hint={options.hero_layouts.find((l) => l.value === layout)?.blurb} />
          <Text path={["kicker"]} label="Kicker" hint="A few words over the heading. Optional." />
          <Text path={["heading"]} label="Heading" required hint="First on the page, this is the page’s own title (its h1)." />
          <Text path={["lede"]} label="Lede" multiline />
          <ImagePath path={["image_path"]} label="Picture" hint={layout === "centered" ? "Not drawn in the centred layout." : "Needed for the split and cover layouts."} />
          <Buttons />
        </>
      );
    }

    case "rich_text":
      return (
        <>
          <Text path={["heading"]} label="Heading" hint="Optional — the body can carry its own headings." />
          <Body sectionId={sectionId} />
        </>
      );

    case "media_text": {
      const kind = typeof content.media === "string" ? content.media : "image";
      return (
        <>
          <Text path={["kicker"]} label="Kicker" />
          <Text path={["heading"]} label="Heading" required />
          <Body sectionId={sectionId} />
          <Row>
            <Choice path={["media"]} label="Beside the words" fallback="image" options={[
              { value: "image", label: "A picture" }, { value: "youtube", label: "A YouTube video" }, { value: "mp4", label: "A video from the library" },
            ]} />
            <Choice path={["side"]} label="On which side" fallback="right" options={[
              { value: "right", label: "Right" }, { value: "left", label: "Left" },
            ]} />
          </Row>
          {kind === "image" && <ImagePath path={["image_path"]} label="Picture" />}
          {kind === "youtube" && <Text path={["youtube"]} label="YouTube link" placeholder="https://www.youtube.com/watch?v=…" hint="Played only when somebody presses it, from youtube-nocookie.com." />}
          {kind === "mp4" && <VideoPath path={["video_path"]} label="Video" />}
          <Buttons />
        </>
      );
    }

    case "features":
      return (
        <>
          <Text path={["kicker"]} label="Kicker" />
          <Text path={["heading"]} label="Heading" />
          <Text path={["lede"]} label="Lede" multiline />
          <NumberChoice path={["columns"]} label="Columns" options={COLUMNS} />
          <Repeater path={["items"]} label="Points" subject="Point" min={1} max={12} blank={() => ({})} row={(p) => (
            <>
              <IconPick path={[...p, "icon"]} />
              <Text path={[...p, "title"]} label="Title" required />
              <Text path={[...p, "body"]} label="One line" multiline />
              <Row>
                <Text path={[...p, "href"]} label="Link" placeholder="/solutions/networking" />
                <Text path={[...p, "link_label"]} label="Link text" placeholder="Learn more" />
              </Row>
            </>
          )} />
        </>
      );

    case "cards": {
      const source = typeof content.source === "string" ? content.source : "solutions";
      const categories = source === "products" ? options.product_categories : source === "store_products" ? options.store_categories : null;
      return (
        <>
          <Text path={["kicker"]} label="Kicker" />
          <Text path={["heading"]} label="Heading" />
          <Text path={["lede"]} label="Lede" multiline />
          <Row>
            <Choice path={["source"]} label="What to list" options={options.card_sources} fallback="solutions" />
            {categories && (
              <Choice path={["category"]} label="Category" fallback=""
                options={[{ value: "", label: "Every category" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]} />
            )}
          </Row>
          <Row>
            <NumberInput path={["limit"]} label="How many" min={1} max={12} hint="Up to twelve, newest or first in order." />
            <NumberChoice path={["columns"]} label="Columns" options={COLUMNS} />
          </Row>
          <p className="-mt-2 mb-4 text-12-5 text-faint">A live list: what is published now, drawn the way the theme draws its grids.</p>
        </>
      );
    }

    case "content_block":
      return (
        <Picker path={["block_id"]} label="Content block"
          options={options.content_blocks.map((b) => ({ value: String(b.id), label: `${b.type_label} — ${b.name}` }))}
          empty="There is no published content block yet." emptyHref="/admin/blocks/cta" />
      );

    case "slider":
      return (
        <>
          <Text path={["heading"]} label="Heading" />
          <Picker path={["slider_id"]} label="Slider" options={options.sliders.map((s) => ({ value: String(s.id), label: s.name }))}
            empty="There is no published slider yet." emptyHref="/admin/sliders/new" />
        </>
      );

    case "gallery":
      return (
        <>
          <Text path={["heading"]} label="Heading" />
          <Picker path={["gallery_id"]} label="Gallery" options={options.galleries.map((g) => ({ value: String(g.id), label: g.name }))}
            empty="There is no published gallery yet." emptyHref="/admin/galleries/new" />
        </>
      );

    case "form":
      return (
        <>
          <Text path={["heading"]} label="Heading" />
          <Text path={["lede"]} label="Lede" multiline />
          <Picker path={["form_id"]} label="Form" options={options.forms.map((f) => ({ value: String(f.id), label: f.name }))}
            empty="There is no published form yet." emptyHref="/admin/forms/new" />
        </>
      );

    case "faq": {
      const source = typeof content.source === "string" ? content.source : "custom";
      return (
        <>
          <Text path={["heading"]} label="Heading" placeholder="Common questions" />
          <Choice path={["source"]} label="Which questions" fallback="custom" options={[
            { value: "custom", label: "Written here" }, { value: "page", label: "This page’s FAQs (the AEO tab)" },
          ]} hint="Either way they join the page’s one FAQ listing for search engines." />
          {source === "custom" && (
            <Repeater path={["items"]} label="Questions" subject="Question" min={1} max={30} blank={() => ({})} row={(p) => (
              <>
                <Text path={[...p, "question"]} label="Question" required />
                <Text path={[...p, "answer"]} label="Answer" multiline required />
              </>
            )} />
          )}
        </>
      );
    }

    case "logos":
      return (
        <>
          <Text path={["heading"]} label="Caption" placeholder="Trusted by" />
          <Choice path={["source"]} label="Whose logos" fallback="clients" options={[
            { value: "clients", label: "Clients (the company profile)" }, { value: "brands", label: "Brands you carry" },
          ]} hint="The strip moves the way the theme moves its homepage strip." />
        </>
      );

    case "testimonial":
      return (
        <>
          <Text path={["quote"]} label="Quotation" multiline required />
          <Row>
            <Text path={["name"]} label="Who said it" required />
            <Text path={["role"]} label="Their role" />
          </Row>
          <ImagePath path={["photo_path"]} label="Photo" hint="Optional. Drawn as a small circle." />
        </>
      );

    case "video": {
      const source = typeof content.source === "string" ? content.source : "youtube";
      return (
        <>
          <Text path={["heading"]} label="Heading" />
          <Choice path={["source"]} label="Where from" fallback="youtube" options={[
            { value: "youtube", label: "YouTube" }, { value: "mp4", label: "The media library" },
          ]} />
          {source === "youtube"
            ? <Text path={["youtube"]} label="YouTube link" placeholder="https://www.youtube.com/watch?v=…" hint="Played only when somebody presses it, from youtube-nocookie.com." />
            : <VideoPath path={["video_path"]} label="Video" />}
          <Text path={["caption"]} label="Caption" />
        </>
      );
    }

    case "divider":
      return (
        <Row>
          <Choice path={["size"]} label="Space" fallback="medium" options={[
            { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" },
          ]} />
          <div className="pt-3"><Toggle path={["rule"]} label="Draw a line" /></div>
        </Row>
      );

    case "stats": {
      const display = typeof content.display === "string" ? content.display : "figures";
      const measured = display !== "figures";
      return (
        <>
          <Head />
          <Row>
            <Choice path={["display"]} label="Drawn as" fallback="figures" options={[
              { value: "figures", label: "Large figures" }, { value: "rings", label: "Rings" }, { value: "bars", label: "Bars" },
            ]} hint={measured ? "Each figure needs a percentage — how full its ring or bar is." : "Each figure counts up as the section arrives."} />
            {display !== "bars" && <NumberChoice path={["columns"]} label="Columns, at most" options={COLUMNS} hint="Never more columns than figures." />}
          </Row>
          <Repeater path={["items"]} label="Figures" subject="Figure" min={1} max={8} blank={() => ({})} row={(p) => (
            <>
              <Row>
                <Text path={[...p, "value"]} label="Figure" required placeholder="340+" />
                <Text path={[...p, "label"]} label="What it counts" required placeholder="Sites supported" />
              </Row>
              {measured
                ? <NumberInput path={[...p, "percent"]} label="Percentage" min={0} max={100} hint="0 to 100." />
                : <IconPick path={[...p, "icon"]} />}
            </>
          )} />
        </>
      );
    }

    case "steps":
      return (
        <>
          <Head />
          <Choice path={["layout"]} label="Layout" fallback="vertical" options={[
            { value: "vertical", label: "Down the page, joined by a line" }, { value: "horizontal", label: "Across the page, as cards" },
          ]} />
          <Repeater path={["items"]} label="Steps" subject="Step" min={2} max={8} blank={() => ({})} row={(p) => (
            <>
              <Text path={[...p, "title"]} label="Title" required />
              <Text path={[...p, "body"]} label="One or two lines" multiline />
              <IconPick path={[...p, "icon"]} />
            </>
          )} />
        </>
      );

    case "tabs":
      return (
        <>
          <Head />
          <Repeater path={["items"]} label="Tabs" subject="Tab" min={2} max={8} blank={() => ({})} row={(p) => (
            <>
              <Row>
                <Text path={[...p, "label"]} label="Tab label" required hint="A word or two." />
                <Text path={[...p, "heading"]} label="Heading in the panel" />
              </Row>
              <Text path={[...p, "body"]} label="Words" multiline required hint="Plain text; a blank line starts a new paragraph." />
              <ImagePath path={[...p, "image_path"]} label="Picture" hint="Optional. Shown beside the words from laptop width, in 4:3." />
            </>
          )} />
        </>
      );

    case "checklist":
      return (
        <>
          <Head />
          <NumberChoice path={["columns"]} label="Columns, at most" options={LIST_COLUMNS} />
          <Repeater path={["items"]} label="Points" subject="Point" min={1} max={24} blank={() => ({})} row={(p) => (
            <>
              <Text path={[...p, "text"]} label="Point" required />
              <IconPick path={[...p, "icon"]} />
            </>
          )} />
          <Buttons />
        </>
      );

    case "cta":
      return (
        <>
          <Text path={["kicker"]} label="Kicker" />
          <Text path={["heading"]} label="Heading" required />
          <Text path={["lede"]} label="Line under it" multiline />
          <Choice path={["tone"]} label="Colour" fallback="accent" options={[
            { value: "accent", label: "Accent — as the inner pages close" }, { value: "brand", label: "Brand — as the homepage closes" },
          ]} hint="Drawn the way the active theme draws its closing band." />
          <Buttons />
          <Toggle path={["call"]} label="With no second button, offer “Call” with the site’s number" />
        </>
      );

    case "comparison":
      return <ComparisonEditor />;

    case "timeline":
      return (
        <>
          <Head />
          <Repeater path={["items"]} label="Milestones" subject="Milestone" min={2} max={12} blank={() => ({})} row={(p) => (
            <>
              <Row>
                <Text path={[...p, "date"]} label="Date" required placeholder="2014" hint="A year, a month, a quarter." />
                <Text path={[...p, "title"]} label="What happened" required />
              </Row>
              <Text path={[...p, "body"]} label="One or two lines" multiline />
            </>
          )} />
        </>
      );

    case "before_after":
      return (
        <>
          <Text path={["heading"]} label="Heading" />
          <Text path={["lede"]} label="Lede" multiline />
          <Row>
            <ImagePath path={["before_path"]} label="Before" hint="Both pictures are drawn 16:10; take them from the same spot." />
            <ImagePath path={["after_path"]} label="After" />
          </Row>
          <Row cols={3}>
            <Text path={["before_label"]} label="Before — label" placeholder="Before" />
            <Text path={["after_label"]} label="After — label" placeholder="After" />
            <NumberInput path={["start"]} label="Divider starts at" min={10} max={90} hint="10 to 90 percent from the left." />
          </Row>
          <Text path={["caption"]} label="Caption" />
        </>
      );

    case "testimonials":
      return (
        <>
          <Head />
          <Repeater path={["items"]} label="Quotations" subject="Quotation" min={2} max={9} blank={() => ({})} row={(p) => (
            <>
              <Text path={[...p, "quote"]} label="Quotation" multiline required />
              <Row>
                <Text path={[...p, "name"]} label="Who said it" required />
                <Text path={[...p, "role"]} label="Their role" />
              </Row>
              <ImagePath path={[...p, "photo_path"]} label="Photo" hint="Optional. Without one, their initial is drawn." />
            </>
          )} />
        </>
      );

    case "team":
      return (
        <>
          <Head />
          <Row>
            <Text path={["department"]} label="Department" hint="Blank for everybody; or one department, spelled as on Company → Team." />
            <NumberInput path={["limit"]} label="How many, at most" min={1} max={48} />
          </Row>
          <Toggle path={["group"]} label="Group the people by department" />
          <p className="-mt-2 mb-4 text-12-5 text-faint">A live list: the published team, in its own order, drawn as the theme draws its team cards. <Link href="/admin/team-members" className="font-semibold text-brand-ink underline">Edit the team</Link>.</p>
        </>
      );

    case "downloads":
      return (
        <>
          <Head />
          <Repeater path={["items"]} label="Files" subject="File" min={1} max={20} blank={() => ({})} row={(p) => (
            <>
              <Text path={[...p, "title"]} label="Title" required placeholder="AMC brochure" />
              <FilePath path={[...p, "file_path"]} label="File" noun="a file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                hint="From the media library's Files tab. Its size and kind are shown beside the button." />
              <Text path={[...p, "note"]} label="One line about it" placeholder="Four pages, updated October 2026" />
            </>
          )} />
        </>
      );

    case "countdown":
      return (
        <>
          <Text path={["kicker"]} label="Kicker" />
          <Text path={["heading"]} label="Heading" required placeholder="The offer ends in" />
          <Text path={["lede"]} label="Lede" multiline />
          <Row>
            <Text path={["ends_at"]} label="Ends" type="datetime-local" required hint="In the site's own timezone." />
            <Text path={["done_text"]} label="Once it has passed" placeholder="This offer has ended." />
          </Row>
          <Buttons />
        </>
      );

    case "columns":
      return <ColumnsEditor sectionId={sectionId} />;

    case "map":
      return (
        <>
          <Text path={["heading"]} label="Heading" placeholder="Find us" />
          <Text path={["lede"]} label="Lede" multiline />
          <Text path={["url"]} label="Google Maps embed address" required placeholder="https://www.google.com/maps/embed?pb=…"
            hint={"In Google Maps: Share, then “Embed a map”, then copy the src=\"…\" from the code."} />
          <Text path={["address"]} label="Address" multiline hint="Shown on the map's card until somebody loads the map." />
        </>
      );

    default:
      return <p className="text-13-5 text-muted">This kind of section is no longer offered. Remove it, or leave it — it is not drawn.</p>;
  }
}
