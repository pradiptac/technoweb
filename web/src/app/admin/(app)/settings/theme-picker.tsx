"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Field, Input, Select } from "@/components/ui/input";
import { IconTile } from "@/components/ui/icon-tile";
import { FONT_CHOICES } from "@/lib/font-choices";
import { customFontsFor } from "@/lib/custom-fonts";
import { CustomFontsPanel } from "./custom-fonts-panel";
import { differs, nearestStep } from "@/lib/palette";
import { ColourField } from "./settings-fields";
import { DEFAULT_PRESET, PRESETS, generate, isHex, presetById, type Preset } from "@/lib/presets";
import { expand, paletteFor, themeTokensCss, themeVars, topBarFor, type PaletteInputs, type Theme } from "@/lib/themes";
import { DENSITIES, LOOK_PRESETS, RADII, SURFACES, TYPE_SCALES, type Density, type LookPreset, type Radius, type Surface, type TypeScale } from "@/lib/look";
import type { SettingRow } from "@/lib/admin";

/**
 * Appearance: nine presets, the twenty-five older themes behind a disclosure,
 * or five colours of your own — and two fonts, whichever you picked.
 *
 * Everything here is one form: `setting__theme` (radios), the five colour
 * inputs and the two font selects all post through the ordinary settings
 * save, so nothing about the action changed. The colour inputs stay in the
 * DOM while a preset is chosen — the `hidden` attribute, not unmounting — so
 * a custom palette somebody set up and then switched away from is still
 * saved and still there when they switch back.
 *
 * **The preview is the real thing.** It renders actual components — `Button`
 * classes, `IconTile`, the type roles — inside a wrapper that carries the
 * generated palette as inline custom properties, which is exactly what the
 * root layout does for the whole site. Every `bg-brand-600` in the preview
 * resolves through the same variable it would on the page. A mock made of
 * inline colours would be a second implementation of the theme.
 *
 * **A typed colour is hue intent, and the picker says when it moved it.** The
 * generator places every shade at a fixed lightness so text stays readable;
 * beside each colour box a second swatch appears only when the shade the
 * site will actually use differs from the one typed. "We adjusted your
 * yellow" shown, rather than a yellow that silently became brown.
 */
export function ThemePicker({ name, rows }: { name: string; rows: SettingRow[] }) {
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  // The fonts the company uploaded itself, read from the same rows on every
  // render — an upload re-renders this screen with the new ones.
  const ownFonts = customFontsFor(stored);
  const initialId = stored.theme || DEFAULT_PRESET.id;
  const seed = presetById(initialId === "olive" ? DEFAULT_PRESET.id : initialId)?.inputs ?? DEFAULT_PRESET.inputs;

  const [chosen, setChosen] = useState(initialId === "olive" ? DEFAULT_PRESET.id : initialId);
  const [inputs, setInputs] = useState<PaletteInputs>({
    primary: isHex(stored.theme_primary) ? stored.theme_primary : seed.primary,
    secondary: isHex(stored.theme_secondary) ? stored.theme_secondary : seed.secondary,
    accent: isHex(stored.theme_accent) ? stored.theme_accent : seed.accent,
    background: isHex(stored.theme_background) ? stored.theme_background : seed.background,
    text: isHex(stored.theme_text) ? stored.theme_text : seed.text,
    fontDisplay: stored.theme_font_display || seed.fontDisplay,
    fontBody: stored.theme_font_body || seed.fontBody,
  });
  // Blank is a value here: the theme's own dark band. Kept apart from
  // `inputs` because it is not one of the five the generator reads.
  const [topbar, setTopbar] = useState(isHex(stored.theme_topbar) ? stored.theme_topbar : "");
  // Corners and spacing (2026-10-05, `lib/look.ts`); unknown values read as the defaults.
  const [radius, setRadius] = useState<Radius>(RADII.includes(stored.theme_radius as Radius) ? stored.theme_radius as Radius : "soft");
  const [density, setDensity] = useState<Density>(DENSITIES.includes(stored.theme_density as Density) ? stored.theme_density as Density : "comfortable");
  const [surface, setSurface] = useState<Surface>(SURFACES.includes(stored.theme_surface as Surface) ? stored.theme_surface as Surface : "flat");
  const [typeScale, setTypeScale] = useState<TypeScale>(TYPE_SCALES.includes(stored.theme_type_scale as TypeScale) ? stored.theme_type_scale as TypeScale : "standard");

  const preset = presetById(chosen);

  /* What the site would wear if this were saved now. */
  const theme: Theme = useMemo(() => {
    const fonts = { fontDisplay: inputs.fontDisplay, fontBody: inputs.fontBody };
    const base = chosen === "custom"
      ? generate(inputs)
      : preset
        ? generate({ ...preset.inputs, ...fonts }, preset.id, preset.name)
        // A stored id no preset answers to (one of the retired legacy themes)
        // previews as the house preset, which is what the site renders for it.
        : generate({ ...DEFAULT_PRESET.inputs, ...fonts }, DEFAULT_PRESET.id, DEFAULT_PRESET.name);
    return isHex(topbar) ? { ...base, topbar: topbar.toLowerCase() } : base;
  }, [chosen, inputs, preset, topbar]);

  /*
    Re-assert every radio's checked state after each render. A successful
    save re-renders this tree, and React 19 resets the form's native controls
    to their first-paint state; for a radio with no `defaultChecked` that is
    the theme that was active *before* this edit. React does not repair it —
    from its side `chosen` never changed. Reported once as "I picked a theme,
    saved, and it shows the old one until I refresh".
  */
  const ref = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const input of el.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)) {
      const should = input.value === chosen;
      if (input.checked !== should) input.checked = should;
    }
  });

  const choosePreset = (p: Preset) => {
    setChosen(p.id);
    // A preset is a starting point: its colours land in the custom boxes so
    // "start from Ocean and nudge it" is one click and a nudge.
    setInputs((i) => ({ ...p.inputs, fontDisplay: i.fontDisplay, fontBody: i.fontBody }));
  };

  const set = (key: keyof PaletteInputs, value: string) => setInputs((i) => ({ ...i, [key]: value }));

  /* A look: palette, fonts, corners and spacing in one press — a starting point to nudge. */
  const chooseLook = (look: LookPreset) => {
    const p = presetById(look.palette);
    if (p) {
      setChosen(p.id);
      setInputs({ ...p.inputs, fontDisplay: look.fontDisplay, fontBody: look.fontBody });
    }
    setRadius(look.radius);
    setDensity(look.density);
    setSurface(look.surface);
    setTypeScale(look.typeScale);
  };
  const lookMatches = (look: LookPreset) => chosen === look.palette && inputs.fontDisplay === look.fontDisplay
    && inputs.fontBody === look.fontBody && radius === look.radius && density === look.density && surface === look.surface && typeScale === look.typeScale;

  /*
   * The live preview: the real site, framed, told what this form would save.
   * `/theme-preview/current` renders the active theme with `PreviewBridge`,
   * which swaps its token stylesheet and its two attributes for whatever is
   * posted here — the same `themeTokensCss()` string the root layout renders,
   * so the frame cannot show a palette the site would not.
   */
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [view, setView] = useState<"" | "specimen">("");
  const tokens = useMemo(() => themeTokensCss(theme), [theme]);
  useEffect(() => {
    const post = () => frame.current?.contentWindow?.postMessage(
      { type: "tw:look", css: tokens, radius, density, surface, typeScale }, window.location.origin,
    );
    post();
    const onReady = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && e.data?.type === "tw:look-ready") post();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [tokens, radius, density, surface, typeScale]);

  return (
    <fieldset ref={ref} className="sm:col-span-2">
      <legend className="mb-1 text-13-5 font-semibold">Colour palette</legend>
      <p className="measure mb-4 text-13 text-muted">
        One choice, applied to the site, the portal and this console. Whatever you pick, every
        shade is adjusted so text stays readable — the build refuses a palette that is not.
        Most of the site follows Primary; Secondary carries the eyebrows and the outlined
        buttons&apos; hover, Accent the highlights and the bands.
      </p>

      {/* ------------------------------------------------------ looks */}
      <p className="mb-2 text-11-5 font-semibold uppercase tracking-[.1em] text-muted">Start from a look</p>
      <div className="mb-5 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-5">
        {LOOK_PRESETS.map((look) => {
          const p = presetById(look.palette);
          const on = lookMatches(look);
          return (
            <button
              key={look.id}
              type="button"
              aria-pressed={on}
              onClick={() => chooseLook(look)}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors duration-(--duration-fast)",
                on ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
              )}
            >
              <span className="flex items-center gap-1" aria-hidden>
                {p && [p.inputs.primary, p.inputs.secondary, p.inputs.accent].map((hex, i) => (
                  <span key={i} className="block size-4 border border-black/10" style={{ background: hex, borderRadius: look.radius === "sharp" ? 2 : look.radius === "round" ? 999 : 5 }} />
                ))}
              </span>
              <span className="text-13-5 font-semibold text-ink">{look.label}</span>
              <span className="text-12 leading-snug text-muted">{look.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------- the nine presets */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {PRESETS.map((p) => (
          <label
            key={p.id}
            className={cn(
              "block cursor-pointer rounded-lg border p-3 text-center transition-colors",
              chosen === p.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
            )}
          >
            <input type="radio" name={name} value={p.id} checked={chosen === p.id} onChange={() => choosePreset(p)} className="sr-only" />
            <span className="flex justify-center gap-1.5" aria-hidden>
              {[p.inputs.primary, p.inputs.secondary, p.inputs.accent].map((hex, i) => (
                <span key={i} className="block size-5 rounded-full border border-black/10" style={{ background: hex }} />
              ))}
            </span>
            <span className="mt-2 block text-13 font-semibold text-ink">{p.name}</span>
          </label>
        ))}
      </div>

      {/* ------------------------------------------------ custom colours */}
      <label
        className={cn(
          "mt-3 block cursor-pointer rounded-lg border p-3 text-center transition-colors",
          chosen === "custom" ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
        )}
      >
        <input type="radio" name={name} value="custom" checked={chosen === "custom"} onChange={() => setChosen("custom")} className="sr-only" />
        <span className="text-14 font-semibold text-ink">Custom colours</span>
        <span className="block text-12-5 text-muted">Type a hex or use the picker. Choosing a preset above copies its colours here.</span>
      </label>

      <div hidden={chosen !== "custom"} className="mt-3 rounded-lg border border-line bg-surface p-4">
        <p className="mb-2 text-11-5 font-semibold uppercase tracking-[.1em] text-muted">Main colours</p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <ColourField id="theme_primary" label="Primary" hint="Buttons, links, the brand." value={inputs.primary} adjusted={nearestStep(brandRamp(theme), inputs.primary)} onChange={(v) => set("primary", v)} />
          <ColourField id="theme_secondary" label="Secondary" hint="Eyebrows, outlined buttons on hover." value={inputs.secondary} adjusted={theme.secondary ? nearestStep(theme.secondary, inputs.secondary) : inputs.secondary} onChange={(v) => set("secondary", v)} />
          <ColourField id="theme_accent" label="Accent" hint="Highlights, badges, the bands." value={inputs.accent} adjusted={theme.accent ? nearestStep(theme.accent, inputs.accent) : inputs.accent} onChange={(v) => set("accent", v)} />
        </div>
        <p className="mb-2 mt-2 text-11-5 font-semibold uppercase tracking-[.1em] text-muted">Base colours</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <ColourField id="theme_background" label="Background" hint="The page and its cards." value={inputs.background} adjusted={theme.colors.page} onChange={(v) => set("background", v)} />
          <ColourField id="theme_text" label="Text" hint="Body copy. Pushed darker if it would not read." value={inputs.text} adjusted={theme.colors.ink} onChange={(v) => set("text", v)} />
        </div>
      </div>

      {/* ------------------------------------------------------ fonts */}
      <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
        <Field label="Headline font" htmlFor="setting__theme_font_display" variant="float-static"
          hint="Applies to every theme, presets and older ones alike.">
          <Select id="setting__theme_font_display" name="setting__theme_font_display" value={inputs.fontDisplay}
            onChange={(e) => set("fontDisplay", e.target.value)}>
            {FONT_CHOICES.filter((f) => f.display).map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `var(${f.variable})` }}>{f.label}</option>
            ))}
            {ownFonts.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `var(${f.variable})` }}>{f.name} (your font)</option>
            ))}
          </Select>
        </Field>
        <Field label="Body font" htmlFor="setting__theme_font_body" variant="float-static"
          hint={FONT_CHOICES.find((f) => f.id === inputs.fontBody)?.note ?? ""}>
          <Select id="setting__theme_font_body" name="setting__theme_font_body" value={inputs.fontBody}
            onChange={(e) => set("fontBody", e.target.value)}>
            {FONT_CHOICES.filter((f) => f.body).map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `var(${f.variable})` }}>{f.label}</option>
            ))}
            {ownFonts.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: `var(${f.variable})` }}>{f.name} (your font)</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* A company's own typefaces: uploaded here, chosen in the two lists above. */}
      <CustomFontsPanel fonts={ownFonts} />

      {/* --------------------------- corners, spacing, cards, headings */}
      <div className="mt-2 grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Corners" htmlFor="setting__theme_radius" variant="float-static"
          hint="Cards, buttons, pictures and fields together, on the site and in the portal. Soft is how the site has always looked.">
          <Select id="setting__theme_radius" name="setting__theme_radius" value={radius} onChange={(e) => setRadius(e.target.value as Radius)}>
            <option value="soft">Soft</option>
            <option value="sharp">Sharp — nearly square</option>
            <option value="round">Round — generous curves</option>
          </Select>
        </Field>
        <Field label="Spacing" htmlFor="setting__theme_density" variant="float-static"
          hint="The room between the site's sections. Comfortable is how the site has always looked.">
          <Select id="setting__theme_density" name="setting__theme_density" value={density} onChange={(e) => setDensity(e.target.value as Density)}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact — more on each screen</option>
            <option value="airy">Airy — calm and premium</option>
          </Select>
        </Field>
        <Field label="Cards" htmlFor="setting__theme_surface" variant="float-static"
          hint="How every card sits on the page. Flat is how the site has always looked.">
          <Select id="setting__theme_surface" name="setting__theme_surface" value={surface} onChange={(e) => setSurface(e.target.value as Surface)}>
            <option value="flat">Flat</option>
            <option value="elevated">Elevated — a soft shadow</option>
            <option value="outline">Outline — a crisp border</option>
            <option value="soft">Soft — no border, a wide shadow</option>
            <option value="glow">Glow — a halo in the brand colour</option>
          </Select>
        </Field>
        <Field label="Headings" htmlFor="setting__theme_type_scale" variant="float-static"
          hint="How large every heading is set, in any theme. Standard is how the site has always looked.">
          <Select id="setting__theme_type_scale" name="setting__theme_type_scale" value={typeScale} onChange={(e) => setTypeScale(e.target.value as TypeScale)}>
            <option value="standard">Standard</option>
            <option value="compact">Compact — quieter</option>
            <option value="large">Large — bolder</option>
          </Select>
        </Field>
      </div>

      {/* ---------------------------------------------------- top bar */}
      <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
        <Field label="Top bar colour" htmlFor="setting__theme_topbar" variant="float-static" hint={
          <>
            The dark strip above the header, and the panel under it. Applies to every theme.
            Leave blank for the theme&apos;s own dark band. In dark mode the bar keeps this hue and
            darkens by itself — the preview shows both.
            {/* The bar moved because no text colour could read on it as typed — the
                same "adjusted" line ColourField shows for the five theme colours. */}
            {isHex(topbar) && differs(topbar, topBarFor(theme, "light").bar) && (
              <span className="mt-1 flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm border border-black/10 align-middle" style={{ background: topBarFor(theme, "light").bar }} />
                <span>adjusted to <code className="font-mono text-11-5">{topBarFor(theme, "light").bar}</code> so text stays readable</span>
              </span>
            )}
          </>
        }>
          <span className="flex items-center gap-2">
            <input
              type="color" aria-label="Top bar colour picker"
              value={isHex(topbar) ? topbar.toLowerCase() : topBarFor(theme, "light").bar}
              onChange={(e) => setTopbar(e.target.value)}
              className="size-11 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-card p-1"
            />
            <Input
              id="setting__theme_topbar" name="setting__theme_topbar" value={topbar}
              onChange={(e) => setTopbar(e.target.value.trim())}
              pattern="#[0-9a-fA-F]{6}" maxLength={7} spellCheck={false}
              className="font-mono text-14" placeholder="theme's dark band"
            />
            {topbar && (
              <button type="button" onClick={() => setTopbar("")} className="shrink-0 text-13 text-brand-ink hover:underline">
                Clear
              </button>
            )}
          </span>
        </Field>
      </div>

      {/* ---------------------------------------------------- preview */}
      <p className="mb-2 mt-2 text-11-5 font-semibold uppercase tracking-[.1em] text-muted">Preview — light and dark</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Specimen theme={theme} scheme="light" />
        <Specimen theme={theme} scheme="dark" />
      </div>

      {/* ------------------------------------------------ live preview */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-11-5 font-semibold uppercase tracking-[.1em] text-muted">Live preview — the real site, before you save</p>
        <div className="flex flex-wrap gap-1.5">
          {([["", "Homepage"], ["specimen", "Inner page"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={cn("min-h-8 rounded-md border px-2.5 text-12-5 font-semibold", view === v ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong text-muted hover:text-ink")}>
              {label}
            </button>
          ))}
          {([["desktop", "Desktop"], ["phone", "Phone"]] as const).map(([d, label]) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}
              className={cn("min-h-8 rounded-md border px-2.5 text-12-5 font-semibold", device === d ? "border-brand-500 bg-brand-50 text-brand-ink" : "border-line-strong text-muted hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-2">
        <iframe
          ref={frame}
          key={view}
          title="Live preview of the site in this look"
          src={`/theme-preview/current${view ? `/${view}` : ""}`}
          loading="lazy"
          className={cn("mx-auto block h-[560px] rounded-md border border-line bg-page", device === "phone" ? "w-[390px] max-w-full" : "w-full")}
        />
      </div>

      <p className="mt-2 text-13 text-muted">
        Currently selected: <strong className="text-ink">{theme.name}</strong>
        {" · "}{theme.fonts.display.label} / {theme.fonts.body.label}. Saving applies it at once — nothing else needs republishing.
      </p>

    </fieldset>
  );
}

function brandRamp(t: Theme) {
  const c = t.colors;
  return {
    50: c.brand50, 100: c.brand100, 200: c.brand200, 300: c.brand300, 400: c.brand400,
    500: c.brand500, 600: c.brand600, 700: c.brand700, 800: c.brand800, 900: c.brand900,
    ink: c.brandInk, on: c.brandOn ?? "#ffffff",
  };
}

/**
 * Real components in the palette being chosen, for one scheme.
 *
 * The wrapper carries every custom property `themeCss()` would emit, so the
 * Tailwind utilities inside — `bg-brand-600`, `text-secondary-ink` — resolve
 * through the same variables they would on the page. `color-scheme` is set
 * too, so native controls inside match.
 */
function Specimen({ theme, scheme }: { theme: Theme; scheme: "light" | "dark" }) {
  const vars = themeVars(theme, scheme) as Record<string, string>;
  const c = paletteFor(theme, scheme);
  const x = expand(theme, scheme);
  const bar = topBarFor(theme, scheme);

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ ...(vars as React.CSSProperties), background: c.page, color: c.ink, borderColor: c.lineStrong, colorScheme: scheme }}
      data-scheme={scheme}
    >
      {/* The top bar as it would paint: the strip's two text roles on its ground. */}
      <div className="flex items-center justify-between px-4 py-2 text-12" style={{ background: bar.bar, color: bar.muted }}>
        <span>+91 98765 43210 · support@example.in</span>
        <span className="rounded px-2 py-0.5" style={{ background: bar.bar2, color: bar.ink }}>Customer zone ⌄</span>
      </div>
      <div className="p-4">
      <p className="text-11 font-semibold uppercase tracking-[.13em]" style={{ color: x.secondary.ink }}>
        {scheme === "light" ? "Light" : "Dark"} · Solutions
      </p>
      <p className="mt-1.5 text-22 font-semibold leading-tight" style={{ fontFamily: `var(${theme.fonts.display.variable})` }}>
        Infrastructure that holds
      </p>
      <p className="mt-1.5 text-13-5" style={{ color: c.muted, fontFamily: `var(${theme.fonts.body.variable})` }}>
        Enterprise networks, servers and security — with a support desk behind them.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-lg px-3.5 py-2 text-13 font-semibold" style={{ background: c.brand600, color: c.brandOn ?? "#ffffff" }}>Book an audit</span>
        <span className="rounded-lg border px-3.5 py-2 text-13 font-semibold" style={{ borderColor: c.lineStrong, background: c.card, color: c.ink }}>Secondary</span>
        <span className="rounded-full border px-2.5 py-0.5 text-11-5 font-semibold" style={{ background: x.accent[50], color: x.accent.ink, borderColor: x.accent[200] }}>Featured</span>
      </div>
      <div className="mt-3 flex gap-2 rounded-lg p-2" style={{ background: c.surface2 }}>
        <IconTile name="network" size="sm" />
        <IconTile name="server" size="sm" />
        <IconTile name="lock" size="sm" />
        <IconTile name="wifi" size="sm" />
      </div>
      <p className="mt-2 text-12" style={{ color: c.faint }}>
        Muted labels and <span style={{ color: c.brandInk }}>a coloured link</span> on the card.
      </p>
      </div>
    </div>
  );
}

