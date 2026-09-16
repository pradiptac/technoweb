"use client";

import { useId } from "react";
import { CoverField } from "@/components/admin/cover-field";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Field, Input, Select } from "@/components/ui/input";
import { announcementBand } from "@/lib/palette";
import { isHex } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { MANIFESTS } from "@/themes/manifests";
import {
  HERO_STYLES, HOME_SECTIONS, MENU_STYLES, SECTION_KINDS,
  type Choice, type HeroStyle, type MenuStyle, type SectionBackground, type SectionKind,
} from "@/themes/options";

/**
 * The stored choices for every theme, as the console edits them: the raw
 * row parsed, one object per theme id, values still loose. `resolveOptions`
 * on the site side applies the fallbacks; here the shape is kept exactly
 * as the editor left it so a partly-filled section survives a save.
 */
export type OptionsDraft = Record<string, {
  menu_style?: MenuStyle;
  hero_style?: HeroStyle;
  sections?: Record<string, Partial<SectionBackground> & { enabled?: boolean }>;
  section_order?: string[];
}>;

/**
 * The options panel under the gallery: menu style, inner-page heading
 * style and a background per homepage section, for the theme the radio
 * above has chosen. One draft holds every theme's choices and the whole
 * draft is posted as `setting__site_theme_options`, so switching the radio
 * switches which theme's options are shown and edited without losing the
 * others — the row is per theme by design (`themes/options.ts`).
 *
 * Nothing here has a `setting__` name of its own: `saveSettingsAction`
 * PATCHes every `setting__*` field it finds, and the colour pickers, the
 * selects and the cover fields are the draft's controls, not settings. The
 * JSON is the one field, in a hidden input the parent renders.
 *
 * A theme that ignores an option (`manifest.ignores`) still shows the
 * control, greyed with a sentence, rather than hiding it: an editor who
 * cannot find "inner page heading" under Editorial concludes the feature
 * is broken, not that the theme opens on a headline by design.
 */
export function ThemeOptionsEditor({
  theme, draft, onChange,
}: {
  theme: string;
  draft: OptionsDraft;
  onChange: (next: OptionsDraft) => void;
}) {
  const manifest = MANIFESTS.find((m) => m.id === theme);
  const mine = draft[theme] ?? {};
  const ignores = new Set(manifest?.ignores ?? []);
  const defaults = manifest?.defaults ?? {};

  const set = (patch: Partial<OptionsDraft[string]>) => onChange({ ...draft, [theme]: { ...mine, ...patch } });
  // A row is kept only while it says something: a background, or the
  // switch off. A default background on a shown section is no row at all.
  const setSection = (id: string, row: (Partial<SectionBackground> & { enabled?: boolean }) | null) => {
    const sections = { ...(mine.sections ?? {}) };
    const empty = row === null || ((row.kind ?? "default") === "default" && row.enabled !== false);
    if (empty) delete sections[id]; else sections[id] = row;
    set({ sections });
  };
  // The list as the site would draw it: the stored order first, then the
  // rest in the site's own order — `orderSections()`'s rule, without the
  // switched-off filter, since the console shows those too.
  const stored = mine.section_order ?? [];
  const ordered = [
    ...stored.map((id) => HOME_SECTIONS.find((h) => h.id === id)).filter((h): h is (typeof HOME_SECTIONS)[number] => h !== undefined),
    ...HOME_SECTIONS.filter((h) => !stored.includes(h.id)),
  ];
  const move = (index: number, delta: -1 | 1) => {
    const ids = ordered.map((h) => h.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    set({ section_order: ids });
  };

  return (
    <div className="mt-8 grid gap-8">
      <ChoiceTiles<MenuStyle>
        legend="Menu style"
        intro="How a section's links open under the header."
        choices={MENU_STYLES}
        value={mine.menu_style ?? defaults.menu_style ?? "mega"}
        onChange={(v) => set({ menu_style: v })}
        disabled={ignores.has("menu_style")}
        note={ignores.has("menu_style") ? `${manifest?.name} draws its own menu and does not use this.` : undefined}
        diagram={(id) => <MenuDiagram style={id} />}
      />

      <ChoiceTiles<HeroStyle>
        legend="Inner page heading"
        intro="How a first- or second-level page opens, with the section's banner from Settings → Page banners."
        choices={HERO_STYLES}
        value={mine.hero_style ?? defaults.hero_style ?? "banner"}
        onChange={(v) => set({ hero_style: v })}
        disabled={ignores.has("hero_style")}
        note={ignores.has("hero_style") ? `${manifest?.name} opens every page its own way and does not use this.` : undefined}
        diagram={(id) => <HeroDiagram style={id} />}
      />

      <section>
        <h2 className="text-15 font-semibold text-ink">Homepage sections</h2>
        <p className="measure mt-1 text-13 text-muted">
          Switch a section off, move it up or down, and give it a background &mdash; the
          theme&rsquo;s own ground, a colour, a gradient or a picture. The words on a colour
          are recoloured so they stay readable; a colour nothing can read on is nudged, and
          the row says so. A theme that does not draw a section skips it.
        </p>
        <div className="mt-4 grid gap-3">
          {ordered.map((s, i) => (
            <SectionRow
              key={s.id}
              label={s.label}
              index={i}
              count={ordered.length}
              value={mine.sections?.[s.id]}
              onChange={(row) => setSection(s.id, row)}
              onMove={(delta) => move(i, delta)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ChoiceTiles<T extends string>({
  legend, intro, choices, value, onChange, disabled, note, diagram,
}: {
  legend: string; intro: string; choices: readonly Choice<T>[]; value: T; onChange: (v: T) => void;
  disabled?: boolean; note?: string; diagram: (id: T) => React.ReactNode;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className={cn(disabled && "opacity-60")}>
      <legend className="text-15 font-semibold text-ink">{legend}</legend>
      <p className="measure mt-1 text-13 text-muted">{note ?? intro}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {choices.map((c) => {
          const on = c.id === value;
          return (
            <label
              key={c.id}
              className={cn(
                "block cursor-pointer rounded-lg border p-3 transition-colors",
                on ? "border-brand-500 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
                disabled && "cursor-not-allowed",
              )}
            >
              <input type="radio" name={name} value={c.id} checked={on} onChange={() => onChange(c.id)} className="sr-only" />
              <div className="aspect-[16/9] overflow-hidden rounded border border-line bg-surface" aria-hidden>{diagram(c.id)}</div>
              <span className="mt-2.5 block text-13-5 font-semibold text-ink">{c.label}</span>
              <span className="mt-0.5 block text-12 leading-snug text-muted">{c.blurb}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A header with a panel under its second item, at the width the style gives it. */
function MenuDiagram({ style }: { style: MenuStyle }) {
  const panel: Record<MenuStyle, string> = {
    simple: "left-[30%] w-[22%]",
    semi: "left-[30%] w-[40%]",
    mega: "left-[30%] w-[58%]",
    big: "left-[4%] w-[92%]",
  };
  const cols: Record<MenuStyle, number> = { simple: 1, semi: 2, mega: 3, big: 4 };
  return (
    <div className="relative h-full p-[6%]">
      <div className="flex h-[14%] items-center gap-[4%] rounded-sm bg-card px-[4%] ring-1 ring-line">
        <i className="h-[45%] w-[14%] rounded-xs bg-ink/70" />
        {[0, 1, 2, 3].map((i) => <i key={i} className={cn("h-[30%] w-[9%] rounded-xs", i === 1 ? "bg-brand-500" : "bg-faint/60")} />)}
      </div>
      <div className={cn("absolute top-[26%] h-[56%] rounded-sm bg-card p-[2.5%] shadow-2 ring-1 ring-line-strong", panel[style])}>
        <div className="grid h-full gap-[4%]" style={{ gridTemplateColumns: `repeat(${cols[style]}, 1fr)` }}>
          {Array.from({ length: cols[style] * (style === "simple" ? 4 : 2) }).map((_, i) => (
            <div key={i} className="flex items-center gap-[6%]">
              {style !== "simple" && <i className="aspect-square h-[55%] shrink-0 rounded-xs bg-brand-500/50" />}
              <i className="h-[22%] w-full rounded-xs bg-faint/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A page's opening block: where the picture goes and where the words sit. */
function HeroDiagram({ style }: { style: HeroStyle }) {
  const words = (align: "left" | "center") => (
    <div className={cn("flex w-full flex-col gap-[6%]", align === "center" ? "items-center" : "items-start")}>
      <i className="h-[7%] w-[18%] rounded-xs bg-brand-500" />
      <i className="h-[13%] w-[62%] rounded-xs bg-ink/80" />
      <i className="h-[7%] w-[48%] rounded-xs bg-faint/70" />
    </div>
  );
  if (style === "banner") return (
    <div className="flex h-[70%] items-center bg-dark px-[7%] text-white"><div className="w-[70%]">{words("left")}</div></div>
  );
  if (style === "cover") return (
    <div className="flex h-[92%] items-center justify-center bg-dark px-[7%] text-white"><div className="w-[80%]">{words("center")}</div></div>
  );
  if (style === "split") return (
    <div className="grid h-[80%] grid-cols-[1.1fr_1fr] items-center gap-[6%] px-[7%]">
      {words("left")}
      <i className="block aspect-[4/3] w-full rounded-sm bg-dark/80" />
    </div>
  );
  return <div className="flex h-[48%] items-center px-[7%]"><div className="w-[70%]">{words("left")}</div></div>;
}

type SectionRowValue = (Partial<SectionBackground> & { enabled?: boolean }) | undefined;

function SectionRow({
  label, index, count, value, onChange, onMove,
}: { label: string; index: number; count: number; value: SectionRowValue; onChange: (row: NonNullable<SectionRowValue> | null) => void; onMove: (delta: -1 | 1) => void }) {
  const id = useId();
  const kind: SectionKind = value?.kind ?? "default";
  const enabled = value?.enabled !== false;
  const patch = (p: Partial<SectionBackground> & { enabled?: boolean }) => onChange({ ...value, kind, ...p });
  const stops = [value?.colour, kind === "gradient" ? value?.colour2 : undefined].filter((c): c is string => isHex(c));
  const band = stops.length ? announcementBand(stops) : null;
  const moved = band && band.stops.some((s, i) => s.toLowerCase() !== stops[i]!.toLowerCase());

  return (
    <div className={cn("grid gap-3 rounded-lg border border-line-strong bg-card p-3.5 md:grid-cols-[auto_170px_180px_1fr] md:items-start", !enabled && "opacity-70")}>
      <div className="flex items-center gap-2 pt-1.5">
        <ReorderButtons index={index} count={count} subject={label} onMove={onMove} dense />
        <label className="flex cursor-pointer items-center gap-1.5 text-12-5 text-muted">
          <input type="checkbox" checked={enabled} onChange={(e) => patch({ enabled: e.target.checked ? undefined : false })} className="size-4 accent-brand-600" />
          Show
        </label>
      </div>
      <div className="flex items-center gap-2.5 pt-2">
        <span
          aria-hidden
          className="size-6 shrink-0 rounded-md border border-line-strong"
          style={
            kind === "gradient" && stops.length === 2
              ? { backgroundImage: `linear-gradient(${value?.angle ?? 135}deg, ${stops[0]}, ${stops[1]})` }
              : kind !== "default" && stops[0] ? { backgroundColor: stops[0] } : undefined
          }
        />
        <span className="text-13-5 font-semibold text-ink">{label}</span>
      </div>
      <Field label="Background" htmlFor={`${id}-kind`} variant="float-static" className="mb-0">
        <Select
          id={`${id}-kind`}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as SectionKind;
            onChange(next === "default"
              ? (enabled ? null : { kind: "default", enabled: false })
              : { kind: next, colour: value?.colour ?? (next === "image" ? "#0b0b12" : "#1e3a8a"), colour2: value?.colour2 ?? "#0b1020", overlay: value?.overlay ?? 60, image_path: value?.image_path, image_url: value?.image_url, enabled: value?.enabled });
          }}
        >
          {SECTION_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
      </Field>
      {kind !== "default" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ColourInput id={`${id}-c1`} label={kind === "image" ? "Overlay colour" : kind === "gradient" ? "First colour" : "Colour"} value={value?.colour ?? ""} onChange={(v) => patch({ colour: v })} />
          {kind === "gradient" && (
            <>
              <ColourInput id={`${id}-c2`} label="Second colour" value={value?.colour2 ?? ""} onChange={(v) => patch({ colour2: v })} />
              <Field label="Angle (degrees)" htmlFor={`${id}-angle`} variant="float-static" className="mb-0">
                <Input id={`${id}-angle`} type="number" min={0} max={360} value={value?.angle ?? 135} onChange={(e) => patch({ angle: Number(e.target.value) })} />
              </Field>
            </>
          )}
          {kind === "image" && (
            <>
              <Field label={`Overlay strength: ${value?.overlay ?? 60}%`} htmlFor={`${id}-ov`} variant="above" className="mb-0" hint="How much of the overlay colour sits over the picture. The words are graded against the colour, so more is safer.">
                <input id={`${id}-ov`} type="range" min={0} max={90} step={5} value={value?.overlay ?? 60} onChange={(e) => patch({ overlay: Number(e.target.value) })} className="w-full accent-brand-600" />
              </Field>
              <div className="sm:col-span-2">
                <CoverField
                  defaultPath={value?.image_path ?? null}
                  defaultUrl={value?.image_url ?? null}
                  name={`${id}-picture`}
                  label="Picture"
                  hint="A wide photograph, 1920px across or more."
                  onPathChange={(path) => patch({ image_path: path ?? undefined })}
                />
              </div>
            </>
          )}
          {moved && (
            <p className="text-12 text-muted sm:col-span-2">
              Adjusted to {band!.stops.map((s) => <code key={s} className="font-mono text-11-5"> {s}</code>)} on the site so the words stay readable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ColourInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={id} variant="float-static" className="mb-0">
      <span className="flex items-center gap-2">
        <input
          type="color" aria-label={`${label} picker`}
          value={isHex(value) ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-11 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-card p-1"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} pattern="#[0-9a-fA-F]{6}" maxLength={7} spellCheck={false} className="font-mono text-14" placeholder="#1e3a8a" />
      </span>
    </Field>
  );
}
