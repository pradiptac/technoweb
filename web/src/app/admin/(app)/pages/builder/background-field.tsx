"use client";

import { CoverField } from "@/components/admin/cover-field";
import { Field, Input, Select } from "@/components/ui/input";
import { SECTION_KINDS, SECTION_TEXTURES, type SectionBackground, type SectionKind, type SectionTexture } from "@/themes/options";

/**
 * A section's ground — the Themes screen's section background, the same
 * five kinds and the same shape (`SectionBackground`), checked by the same
 * rule on the API (`ThemeOptions::background`). "Theme's own" stores nothing.
 * The ink on a colour is derived when the page is drawn so it clears AA on
 * every stop; nothing here asks for a text colour.
 */
export function BackgroundField({ value, onChange, error, idPrefix, media }: {
  value: SectionBackground | null;
  onChange: (next: SectionBackground | null) => void;
  error?: string;
  idPrefix: string;
  media: Record<string, string>;
}) {
  const bg = value ?? { kind: "default" as SectionKind };
  const kind = bg.kind ?? "default";
  const set = (patch: Partial<SectionBackground>) => {
    const next = { ...bg, ...patch };
    onChange(next.kind === "default" ? null : next);
  };
  const id = (k: string) => `${idPrefix}-bg-${k}`;

  return (
    <fieldset className="mt-2 rounded-lg border border-line bg-surface p-4">
      <legend className="px-1 text-13-5 font-semibold">Background</legend>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Background" htmlFor={id("kind")} variant="float-static"
          hint={SECTION_KINDS.find((k) => k.id === kind)?.blurb}>
          <Select id={id("kind")} value={kind} onChange={(e) => {
            const next = e.target.value as SectionKind;
            // The colours the controls show are the colours stored, so a
            // kind that needs one is never saved without it.
            set({
              kind: next,
              ...(next === "solid" || next === "gradient" || next === "image" ? { colour: bg.colour ?? "#0b1020" } : {}),
              ...(next === "gradient" ? { colour2: bg.colour2 ?? "#1e293b", angle: bg.angle ?? 135 } : {}),
            });
          }}>
            {SECTION_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </Select>
        </Field>

        {(kind === "solid" || kind === "gradient" || kind === "image") && (
          <Field label={kind === "image" ? "Overlay colour" : kind === "gradient" ? "First colour" : "Colour"} htmlFor={id("colour")} variant="float-static">
            <Input id={id("colour")} type="color" value={bg.colour ?? "#0b1020"} onChange={(e) => set({ colour: e.target.value })} className="h-11 p-1" />
          </Field>
        )}

        {kind === "gradient" && (
          <>
            <Field label="Second colour" htmlFor={id("colour2")} variant="float-static">
              <Input id={id("colour2")} type="color" value={bg.colour2 ?? "#1e293b"} onChange={(e) => set({ colour2: e.target.value })} className="h-11 p-1" />
            </Field>
            <Field label="Angle (degrees)" htmlFor={id("angle")}>
              <Input id={id("angle")} type="number" min={0} max={360} value={bg.angle ?? 135}
                onChange={(e) => set({ angle: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </Field>
          </>
        )}

        {kind !== "default" && (
          <Field label="Texture" htmlFor={id("texture")} variant="float-static"
            hint={SECTION_TEXTURES.find((t) => t.id === (bg.texture ?? "none"))?.blurb}>
            <Select id={id("texture")} value={bg.texture ?? "none"}
              onChange={(e) => set({ texture: e.target.value === "none" ? undefined : e.target.value as SectionTexture })}>
              {SECTION_TEXTURES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
        )}

        {kind === "image" && (
          <Field label="Overlay (0–90%)" htmlFor={id("overlay")} hint="How much of the overlay colour sits over the picture.">
            <Input id={id("overlay")} type="number" min={0} max={90} value={bg.overlay ?? 60}
              onChange={(e) => set({ overlay: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
        )}
      </div>

      {kind === "image" && (
        <CoverField
          name={`_media_${id("image")}`}
          label="Picture"
          defaultPath={bg.image_path ?? null}
          defaultUrl={bg.image_path ? media[bg.image_path] ?? bg.image_url ?? null : null}
          onPathChange={(p) => set({ image_path: p ?? undefined })}
        />
      )}

      {error && <p className="mt-1 text-12-5 text-err">{error}</p>}
    </fieldset>
  );
}
