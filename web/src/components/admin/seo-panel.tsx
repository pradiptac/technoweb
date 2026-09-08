"use client";

import { useCallback, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { AiSeoPanel, type SeoAiPatch } from "@/components/admin/ai-seo-panel";
import { cn } from "@/lib/utils";
import type { Seo, SeoOverride } from "@/types/api";

/**
 * The lengths the SEO overview scores against. They live here as well because
 * a screen that tells an editor a title is too long, next to a field that does
 * not count, is a screen that has told them to go and count it themselves.
 *
 * Same numbers as `App\Support\SeoScore`. Two places, and they have to agree:
 * the alternative is sending the count over the wire with every form, which is
 * a request for a constant.
 */
const LIMITS = {
  title: { min: 30, max: 60 },
  description: { min: 70, max: 160 },
} as const;

/**
 * The four combinations worth offering.
 *
 * A dropdown rather than the text box this was, because there are exactly
 * four sensible answers and typing one of them is four chances to typo a
 * directive that silently does nothing. The *API* deliberately still accepts
 * any string up to 60 characters: the robots vocabulary is open —
 * `noarchive`, `max-snippet:-1` — and constraining what an editor can pick is
 * not a reason to refuse what an integration might legitimately send.
 *
 * The blank entry is the panel's contract, not an omission: every field here
 * means "derive it" when it is empty, and a select with no empty option is a
 * field an editor can set but never unset.
 */
const ROBOTS = [
  ["index, follow", "Index, Follow"],
  ["noindex, follow", "Noindex, Follow"],
  ["index, nofollow", "Index, Nofollow"],
  ["noindex, nofollow", "Noindex, Nofollow"],
] as const;

/**
 * What the page will actually publish, which is the typed value **or the
 * derived one** — an empty override is not an empty title. Counting only what
 * was typed would report "0 characters" for a record whose derived title is
 * perfectly good, and send an editor to fix something that is not broken.
 */
function Counter({ value, derived, limits }: {
  value: string;
  derived: string;
  limits: { min: number; max: number };
}) {
  const effective = value.trim() || derived.trim();
  const n = [...effective].length;
  const state = n === 0 ? "empty" : n > limits.max ? "over" : n < limits.min ? "under" : "ok";

  return (
    <span className={cn(
      "tabular-nums",
      state === "over" ? "font-semibold text-err" : state === "under" ? "text-warn" : "text-faint",
    )}>
      {n} / {limits.min}–{limits.max} characters
      {value.trim() === "" && n > 0 && " (derived)"}
      {state === "over" && " — search engines will cut this off"}
    </span>
  );
}

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
 *
 * `embedded` drops the card and the collapse toggle, for forms that already
 * give SEO a tab of its own. A tab you click to reveal a panel you then click
 * again to open is one click too many, and the disclosure was only ever there
 * to keep a long single-column form from ending in forty fields nobody asked
 * for.
 */
export function SeoPanel({
  seo, defaults, error, embedded = false, record,
}: {
  seo?: SeoOverride;
  defaults?: Seo;
  error: (field: string) => string | undefined;
  embedded?: boolean;
  /**
   * The saved record, when there is one.
   *
   * The AI assistant reads a record's own copy, so it has nothing to work with
   * on a create form — and offering it there would produce a suggestion about
   * a page that does not exist. Absent means no assistant, which is exactly
   * what `/admin/blog/new` should show.
   */
  record?: { type: string; id: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const shown = embedded || open;

  /*
    Controlled, so the counters can see the value — and, since the assistant
    arrived, so a suggestion can be put into them.

    That second reason is why the *other* fields below became controlled too.
    Writing `input.value` from outside React looks like it works and is undone
    by the next render; a field an editor watched fill in and then silently
    empty is worse than one that never filled in at all.
  */
  const [title, setTitle] = useState(seo?.title ?? "");
  const [description, setDescription] = useState(seo?.description ?? "");
  const [focusKeyword, setFocusKeyword] = useState(seo?.focus_keyword ?? "");
  const [schemaType, setSchemaType] = useState(seo?.schema_type ?? "");
  const [keywords, setKeywords] = useState((seo?.secondary_keywords ?? []).join(", "));

  /*
    Applied field by field, and only where the suggestion actually said
    something. A blank value in a patch means "the model did not offer one",
    never "clear what is there" — an assistant that empties a title an editor
    wrote because it had no opinion about it is one nobody presses twice.
  */
  const applyAi = useCallback((patch: SeoAiPatch) => {
    if (patch.title) setTitle(patch.title);
    if (patch.description) setDescription(patch.description);
    if (patch.focus_keyword) setFocusKeyword(patch.focus_keyword);
    if (patch.schema_type) setSchemaType(patch.schema_type);
    if (patch.secondary_keywords?.length) setKeywords(patch.secondary_keywords.join(", "));
  }, []);

  /*
    A record with one possible type gets a disabled control rather than a
    hidden one. Removing the field would leave an editor wondering where it
    went on some screens and not others; showing it disabled, with the reason,
    answers the question before it is asked.
  */
  const schemaOptions = defaults?.schema_type_options ?? [];
  const schemaFixed = schemaOptions.length <= 1;

  return (
    <section className={embedded ? "" : "mt-2 rounded-lg border border-line-strong bg-card"}>
      {embedded ? (
        <p className="measure mb-4 text-[13px] text-muted">
          Everything here is generated from the content unless you type
          something. The greyed-out text is what the site will use if you leave
          a field blank.
        </p>
      ) : (
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
          <span className="text-[13px] font-semibold text-brand-ink">{open ? "Hide" : "Edit"}</span>
        </button>
      )}

      <div hidden={!shown}>
        <div className={embedded ? "max-w-[760px]" : "border-t border-line px-5 pt-5 pb-1"}>
          <Field
            label="Meta title" htmlFor="seo_title" error={error("title")}
            hint={<Counter value={title} derived={defaults?.title ?? ""} limits={LIMITS.title} />}
          >
            <Input id="seo_title" name="seo_title" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaults?.title ?? ""} />
          </Field>

          <Field
            label="Meta description" htmlFor="seo_description" error={error("description")}
            hint={<Counter value={description} derived={defaults?.description ?? ""} limits={LIMITS.description} />}
          >
            <Textarea id="seo_description" name="seo_description" rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={defaults?.description ?? ""} />
          </Field>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Canonical URL" htmlFor="seo_canonical_url" error={error("canonical_url")}>
              <Input id="seo_canonical_url" name="seo_canonical_url" defaultValue={seo?.canonical_url ?? ""}
                placeholder={defaults?.canonical_url ?? ""} />
            </Field>

            <Field label="Robots" htmlFor="seo_robots" error={error("robots")} variant="float-static">
              <Select id="seo_robots" name="seo_robots" defaultValue={seo?.robots ?? ""}>
                <option value="">Derived ({defaults?.robots ?? "index, follow"})</option>
                {ROBOTS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-x-4 sm:grid-cols-2">
            {/*
              This field was stored and read by nothing for months. The SEO
              overview now scores the title, description, URL and body against
              it, so the hint has to say what a useful answer looks like —
              filling it in is what turns four generic length checks into a
              question about this page.
            */}
            <Field label="Focus keyword" htmlFor="seo_focus_keyword" error={error("focus_keyword")}
              hint="The phrase you want this page to be found for. Checked against the title, description, URL and body on the SEO screen.">
              <Input id="seo_focus_keyword" name="seo_focus_keyword" value={focusKeyword}
                onChange={(e) => setFocusKeyword(e.target.value)}
                placeholder="network switch" />
            </Field>

            {/*
              The options come from the record, not from a list in here.

              `schema_type_options` is what this kind of record may legitimately
              declare itself to be — `App\Support\SchemaTypes` decides, and it
              is a short list because every entry has to be a drop-in for the
              derived type. A dropdown offering `Recipe` on a network switch is
              a promise the graph cannot keep, and this field spent months as
              free text that nothing read at all.

              Where a record has exactly one valid type the control is disabled
              and says why, the same way the mail panel disables a transport
              this server cannot build.
            */}
            <Field
              label="Schema type"
              htmlFor="seo_schema_type"
              error={error("schema_type")}
              /*
                A select always has a value, so its label can never sit inside
                the control waiting to be displaced — `float-static` is the
                variant `Field` documents for exactly this. Without it the
                label renders on top of the selected option, which is what the
                first cut of this did.
              */
              variant="float-static"
              hint={schemaFixed
                ? `A ${defaults?.schema_type} page has no alternative type that the markup would still support.`
                : "What this page declares itself to be in its structured data."}
            >
              <Select
                id="seo_schema_type"
                name="seo_schema_type"
                value={schemaType}
                onChange={(e) => setSchemaType(e.target.value)}
                disabled={schemaFixed}
                title={schemaFixed ? `Always ${defaults?.schema_type} for this kind of record.` : undefined}
              >
                <option value="">Derived ({defaults?.schema_type ?? "none"})</option>
                {schemaOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </Field>
          </div>

          {/*
            Secondary keywords: comma-separated here, an array on the wire.

            A text box rather than a tag control because that is what an editor
            types anyway, and the split happens once, in the action that builds
            the payload — the API takes an array so nothing downstream has to
            guess which delimiter was meant.
          */}
          <Field
            label="Secondary keywords"
            htmlFor="seo_secondary_keywords"
            error={error("secondary_keywords")}
            hint="Comma-separated, up to ten. Related phrases this page should also be found for — not variations of the focus keyword."
          >
            <Input
              id="seo_secondary_keywords"
              name="seo_secondary_keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="managed switch, PoE switch, 24-port switch"
            />
          </Field>

          <Field label="Social title" htmlFor="seo_og_title" error={error("og_title")}>
            <Input id="seo_og_title" name="seo_og_title" defaultValue={seo?.og_title ?? ""}
              placeholder={defaults?.og_title ?? ""} />
          </Field>

          <Field label="Social description" htmlFor="seo_og_description" error={error("og_description")}>
            <Textarea id="seo_og_description" name="seo_og_description" rows={2}
              defaultValue={seo?.og_description ?? ""} placeholder={defaults?.og_description ?? ""} />
          </Field>

          {/*
            The share image, which this panel has never had a field for.

            The column existed, the API validated it, and `SeoScore` has been
            marking records down six points for not having one — on a screen
            with no way to set it. Only landing pages could, through their own
            form. That is the gap this closes.
          */}
          <CoverField
            name="seo_og_image_path"
            label="Share image"
            description="Shown when this page is posted on social media or in a chat. Landscape, around 1200 x 630 px. Left blank, the site falls back to its default card."
            defaultPath={seo?.og_image_path ?? null}
            defaultUrl={seo?.og_image ?? null}
            accept=".png,.jpg,.jpeg,.webp"
          />

          <label className="mb-[18px] flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" name="seo_sitemap_include" value="1"
              defaultChecked={seo?.sitemap_include ?? true} />
            Include in sitemap.xml
          </label>

          {/*
            Last, deliberately. The fields above are what publishes; this is a
            tool for filling them in, and putting it first would make an
            optional assistant look like the way the screen is meant to be used.
          */}
          {record && <AiSeoPanel type={record.type} id={record.id} onApply={applyAi} />}
        </div>
      </div>
    </section>
  );
}
