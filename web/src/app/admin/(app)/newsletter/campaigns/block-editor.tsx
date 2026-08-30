"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { IconLayers } from "@/components/icons";
import { MediaBrowser } from "@/components/admin/media-browser";
import type { NewsletterBlock } from "@/types/api";

/**
 * The email body, as an ordered list of blocks.
 *
 * A flat list with move buttons rather than a drag-and-drop canvas, and that
 * is a deliberate ceiling rather than a shortcut: an email is one column, so
 * there is no two-dimensional arrangement for a canvas to express — the only
 * question a block has is what comes before it. The menu builder makes the
 * same call for the same reason, and both keep a keyboard path because the
 * console is gated on audits that fail an interface a keyboard cannot drive.
 *
 * Every field here maps to something `EmailRenderer` knows how to emit. A
 * block type it does not know renders as nothing rather than as an error in
 * somebody's inbox, so the two lists can drift without breaking a send — but
 * they should not, and this is the shorter of the two.
 */

const TYPES: { value: string; label: string; hint: string }[] = [
  { value: "heading", label: "Heading", hint: "One line, large." },
  { value: "text", label: "Text", hint: "A paragraph or several." },
  { value: "image", label: "Image", hint: "Full width, with alt text." },
  { value: "button", label: "Button", hint: "One action, drawn as a real button." },
  { value: "article", label: "Article", hint: "Image, heading, text and a link together." },
  { value: "product", label: "Product", hint: "A picture beside a name, SKU and link." },
  { value: "columns", label: "Two columns", hint: "Side by side, stacking on a phone." },
  { value: "divider", label: "Divider", hint: "A rule." },
  { value: "spacer", label: "Spacer", hint: "Vertical space." },
  { value: "header", label: "Header", hint: "Your logo at the top." },
  { value: "footer", label: "Footer", hint: "Address and the unsubscribe link. Required." },
];

export function BlockEditor({
  blocks, disabled, onChange, templates,
}: {
  blocks: NewsletterBlock[];
  disabled?: boolean;
  onChange: (blocks: NewsletterBlock[]) => void;
  templates: { id: number; name: string }[];
}) {
  const [adding, setAdding] = useState("text");
  const [open, setOpen] = useState<number | null>(null);

  const patch = (index: number, changes: Partial<NewsletterBlock>) =>
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...changes } : b)));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  const add = () => {
    onChange([...blocks, starter(adding)]);
    setOpen(blocks.length);
  };

  const hasFooter = blocks.some((b) => b.type === "footer");

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">Body</h2>
        <span className="text-[12px] text-faint">{blocks.length} block{blocks.length === 1 ? "" : "s"}</span>
      </div>

      {/*
        Said here rather than only in the health check, because by the time the
        check runs somebody has finished writing. The footer carries the
        unsubscribe link, and a campaign without one cannot be sent at all.
      */}
      {!hasFooter && blocks.length > 0 && (
        <p className="mb-2 rounded border border-warn/25 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          No footer block yet. It carries the unsubscribe link and the postal address, and
          sending is refused without one.
        </p>
      )}

      {blocks.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="Nothing in this email yet">
          Add blocks below, or start from a template — a template is just a set of blocks you
          can then edit.
        </EmptyState>
      ) : (
        /*
          `min-w-0` on both, because `truncate` on the label is not enough.

          A grid item's automatic minimum size is its **min-content**, and the
          block summary is a media URL — one unbreakable 300px run. So the
          column was sized to fit a string that was being ellipsised anyway,
          and every field on the tab rendered 490px wide inside a 342px phone.
          Truncation decides what is painted; this decides what the column is
          allowed to demand.
        */
        <ul className="grid min-w-0 gap-1.5">
          {blocks.map((block, i) => (
            <li key={i} className="min-w-0 rounded-lg border border-line-strong bg-card">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {TYPES.find((t) => t.value === block.type)?.label ?? block.type}
                  <span className="ml-2 font-normal text-faint">{summarise(block)}</span>
                </span>

                <div className="flex shrink-0 items-center gap-0.5">
                  <Move label="Move up" onClick={() => move(i, i - 1)} disabled={disabled || i === 0}>↑</Move>
                  <Move label="Move down" onClick={() => move(i, i + 1)} disabled={disabled || i === blocks.length - 1}>↓</Move>
                  <Move label="Remove" onClick={() => onChange(blocks.filter((_, j) => j !== i))} disabled={disabled}>✕</Move>
                  <button
                    type="button"
                    onClick={() => setOpen(open === i ? null : i)}
                    aria-expanded={open === i}
                    aria-label={`Edit block ${i + 1}`}
                    className="grid size-6 place-items-center rounded text-[13px] text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    {open === i ? "−" : "✎"}
                  </button>
                </div>
              </div>

              {open === i && (
                <div className="grid gap-2.5 border-t border-line px-2.5 py-3 sm:grid-cols-2">
                  <BlockFields block={block} disabled={disabled} onPatch={(c) => patch(i, c)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        The hint sits **below the row**, not inside the Field.

        `items-end` bottom-aligns every child, and a Field carrying a hint is
        taller than the button beside it — so the button lined up with the
        bottom of the hint text rather than with the select, floating half a
        line low. Moving the hint out makes the row's children the same height,
        which is what `items-end` was being asked to do all along.

        `aria-describedby` is set by hand to keep what `Field` would have wired
        up. Field's docblock says a caller's own value wins, and the paragraph
        below carries the matching id — so the description is still announced
        with the control rather than orphaned beside it.
      */}
      <div className="mt-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Add a block" htmlFor="block-type" variant="float-static" className="mb-0">
            <Select
              id="block-type"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              disabled={disabled}
              aria-describedby="block-type-hint"
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>

          <Button type="button" size="sm" variant="secondary" onClick={add} disabled={disabled}>Add</Button>
        </div>

        <p id="block-type-hint" className="mt-1.5 text-[12.5px] text-faint">
          {TYPES.find((t) => t.value === adding)?.hint}
          {templates.length > 0 && blocks.length === 0 && " Or pick a template when you create the campaign."}
        </p>
      </div>
    </div>
  );
}

/**
 * An image field that opens the media library.
 *
 * Not a URL box. Asking somebody to "paste a URL from the media library" makes
 * them open a second tab, find the file, copy an address and come back — and
 * the address they paste is a stored path with a `?v=` on it, which is a
 * filename that does not exist. It also loses the alt text, which lives with
 * the file precisely so it is written once.
 *
 * Picking fills the alt text too, and only when the block has none: an
 * override somebody typed for this email is theirs, and the library's
 * description must not overwrite it.
 */
function ImageField({
  label, value, alt, disabled, onPick,
}: {
  label: string;
  value: string;
  alt?: string;
  disabled?: boolean;
  onPick: (image: { url: string; alt: string }) => void;
}) {
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="sm:col-span-2">
      <p className="mb-1 text-[12px] font-semibold text-muted">{label}</p>

      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // A plain <img>: a runtime URL on the API's own origin, in a fixed
          // box, for the length of one form — the same call `MediaBrowser`
          // makes for its tiles.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={alt || ""}
            className="h-16 w-24 rounded border border-line-strong bg-surface object-cover"
          />
        ) : (
          <div className="grid h-16 w-24 place-items-center rounded border border-dashed border-line-strong bg-surface text-[11.5px] text-faint">
            None
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={disabled}
            onClick={() => setBrowsing(true)}>
            {value ? "Change" : "Choose from the library"}
          </Button>

          {value && (
            <Button type="button" size="sm" variant="ghost" disabled={disabled}
              onClick={() => onPick({ url: "", alt: alt ?? "" })}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <MediaBrowser
        open={browsing}
        onClose={() => setBrowsing(false)}
        onPick={(image) => onPick(image)}
      />
    </div>
  );
}

function BlockFields({
  block, disabled, onPatch,
}: {
  block: NewsletterBlock;
  disabled?: boolean;
  onPatch: (changes: Partial<NewsletterBlock>) => void;
}) {
  const text = (key: string, label: string, hint?: string, wide = false) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Field label={label} htmlFor={`${key}-field`} variant="float" hint={hint}>
        <Input
          id={`${key}-field`}
          value={String(block[key] ?? "")}
          disabled={disabled}
          onChange={(e) => onPatch({ [key]: e.target.value })}
        />
      </Field>
    </div>
  );

  switch (block.type) {
    case "heading":
      return (
        <>
          {text("text", "Heading", undefined, true)}
          <Field label="Size" htmlFor="level" variant="float-static">
            <Select
              id="level"
              value={String(block.level ?? 1)}
              disabled={disabled}
              onChange={(e) => onPatch({ level: Number(e.target.value) })}
            >
              <option value="1">Large</option>
              <option value="2">Medium</option>
              <option value="3">Small</option>
            </Select>
          </Field>
        </>
      );

    case "text":
      return (
        <div className="sm:col-span-2">
          <Field
            label="Text"
            htmlFor="html"
            variant="float"
            hint="Basic HTML is allowed and sanitised on save — the same allowlist the rest of the CMS uses. Use {{first_name}} for the reader's name."
          >
            <textarea
              id="html"
              rows={5}
              disabled={disabled}
              value={String(block.html ?? "")}
              onChange={(e) => onPatch({ html: e.target.value })}
              className="w-full rounded border border-line-strong bg-card px-3 py-2 text-[13px]"
            />
          </Field>
        </div>
      );

    case "image":
      return (
        <>
          <ImageField
            label="Image"
            value={String(block.src ?? "")}
            alt={String(block.alt ?? "")}
            disabled={disabled}
            onPick={(image) => onPatch({
              src: image.url,
              // The library's alt text fills an empty field and never
              // overwrites one somebody wrote for this email.
              alt: String(block.alt ?? "") || image.alt,
            })}
          />
          {text("alt", "Alt text", "Most clients block images by default — this is what is read instead.", true)}
          {text("href", "Links to", "Optional.", true)}
        </>
      );

    case "button":
      return (
        <>
          {text("label", "Button text")}
          {text("href", "Links to", "A full https:// address.")}
        </>
      );

    case "article":
      return (
        <>
          {text("heading", "Heading", undefined, true)}
          {text("text", "Text", undefined, true)}
          <ImageField
            label="Image"
            value={String(block.image ?? "")}
            alt={String(block.alt ?? "")}
            disabled={disabled}
            onPick={(image) => onPatch({ image: image.url, alt: String(block.alt ?? "") || image.alt })}
          />
          {text("href", "Links to")}
          {text("link_label", "Link text")}
        </>
      );

    case "product":
      return (
        <>
          {text("name", "Product name")}
          {text("sku", "SKU")}
          {text("text", "Description", undefined, true)}
          <ImageField
            label="Image"
            value={String(block.image ?? "")}
            disabled={disabled}
            onPick={(image) => onPatch({ image: image.url })}
          />
          {text("href", "Links to")}
        </>
      );

    case "columns":
      return <ColumnFields block={block} disabled={disabled} onPatch={onPatch} />;

    case "spacer":
      return (
        <Field label="Height in pixels" htmlFor="height" variant="float">
          <Input
            id="height"
            type="number"
            min={4}
            max={80}
            value={String(block.height ?? 24)}
            disabled={disabled}
            onChange={(e) => onPatch({ height: Number(e.target.value) })}
          />
        </Field>
      );

    case "footer":
      return (
        <>
          {text("company", "Company name", "Falls back to the newsletter settings.")}
          {text("address", "Postal address", "Falls back to the newsletter settings.")}
          {text("text", "Footer line", "Why they are receiving this.", true)}
          <p className="text-[12.5px] text-faint sm:col-span-2">
            The unsubscribe link is added automatically and cannot be removed.
          </p>
        </>
      );

    case "header":
      return text("company", "Company name", "Used when no logo is set.", true);

    default:
      return <p className="text-[12.5px] text-faint sm:col-span-2">Nothing to configure.</p>;
  }
}

function ColumnFields({
  block, disabled, onPatch,
}: {
  block: NewsletterBlock;
  disabled?: boolean;
  onPatch: (changes: Partial<NewsletterBlock>) => void;
}) {
  const columns = (Array.isArray(block.columns) ? block.columns : []) as Record<string, string>[];

  const patchColumn = (index: number, key: string, value: string) =>
    onPatch({ columns: columns.map((c, i) => (i === index ? { ...c, [key]: value } : c)) });

  return (
    <>
      {columns.map((column, i) => (
        <fieldset key={i} className="rounded border border-line p-2.5">
          <legend className="px-1 text-[12px] font-semibold text-muted">Column {i + 1}</legend>

          <div className="grid gap-2">
            <Field label="Heading" htmlFor={`col-${i}-heading`} variant="float">
              <Input id={`col-${i}-heading`} value={column.heading ?? ""} disabled={disabled}
                onChange={(e) => patchColumn(i, "heading", e.target.value)} />
            </Field>
            <Field label="Text" htmlFor={`col-${i}-text`} variant="float">
              <Input id={`col-${i}-text`} value={column.text ?? ""} disabled={disabled}
                onChange={(e) => patchColumn(i, "text", e.target.value)} />
            </Field>
            <Field label="Links to" htmlFor={`col-${i}-href`} variant="float">
              <Input id={`col-${i}-href`} value={column.href ?? ""} disabled={disabled}
                onChange={(e) => patchColumn(i, "href", e.target.value)} />
            </Field>

            <ImageField
              label="Image"
              value={column.image ?? ""}
              alt={column.alt ?? ""}
              disabled={disabled}
              /*
                One patch, not two calls.

                `patchColumn` maps over `columns` from the closure, so calling
                it twice in a row applies the second to the *pre-first* array
                and the image would be thrown away by the alt text. Both
                changes go in together.
              */
              onPick={(image) => onPatch({
                columns: columns.map((c, j) => (j === i
                  ? { ...c, image: image.url, alt: c.alt || image.alt }
                  : c)),
              })}
            />
          </div>
        </fieldset>
      ))}
    </>
  );
}

function Move({
  label, onClick, disabled, children,
}: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      // 24px, the audit's floor for a target with another inside 24px of its
      // centre — and these sit in a row of four.
      className="grid size-6 place-items-center rounded text-[13px] text-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** A new block with enough in it to render as something rather than nothing. */
function starter(type: string): NewsletterBlock {
  switch (type) {
    case "heading": return { type, text: "A heading", level: 1 };
    case "text": return { type, html: "<p>Write something here.</p>" };
    case "button": return { type, label: "Read more", href: "https://www.technoware.in" };
    case "columns": return { type, columns: [{ heading: "One", text: "" }, { heading: "Two", text: "" }] };
    case "spacer": return { type, height: 24 };
    case "footer": return { type };
    default: return { type };
  }
}

/** A one-line hint of what a block holds, for the collapsed row. */
function summarise(block: NewsletterBlock): string {
  const first = (value: unknown) => String(value ?? "").replace(/<[^>]+>/g, " ").trim().slice(0, 48);

  switch (block.type) {
    case "heading": return first(block.text);
    case "text": return first(block.html);
    case "button": return first(block.label);
    case "image": return first(block.alt) || first(block.src);
    case "article": return first(block.heading);
    case "product": return first(block.name);
    case "spacer": return `${block.height ?? 24}px`;
    default: return "";
  }
}
