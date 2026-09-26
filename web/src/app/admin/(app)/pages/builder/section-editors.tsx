"use client";

import Link from "next/link";
import { CoverField } from "@/components/admin/cover-field";
import { EditorField } from "@/components/admin/editor-field";
import { Field, Select } from "@/components/ui/input";
import {
  Choice, IconPick, ImagePath, NumberInput, Repeater, Row, Text, Toggle, getIn, useBlock, type Path,
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

    default:
      return <p className="text-13-5 text-muted">This kind of section is no longer offered. Remove it, or leave it — it is not drawn.</p>;
  }
}
