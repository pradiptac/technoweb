"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_PRESET, generate } from "@/lib/presets";
import { themeTokensCss } from "@/lib/themes";
import type { SiteImportBrand, SiteImportColours, SiteImportFace } from "@/types/api";

/**
 * The site's colours and fonts, as the stylesheets it served settled them
 * (`Brand`): six swatches, the two typefaces, and a tick to apply them to
 * this site. **Off until ticked** — the import never restyles the site it is
 * brought into unless somebody says so — and applying writes the same
 * settings the Appearance screen does.
 *
 * "Preview" frames the real site (`/theme-preview/current`, the Appearance
 * tab's own preview) and posts the tokens this brand would generate, so what
 * is shown is the palette the site would wear; a role the stylesheets did not
 * settle keeps the house colour in the preview, as it keeps the site's own
 * once applied. A custom font file is not in the preview (it is installed only
 * on import) and the preview says so.
 */

const ROLES: { key: keyof SiteImportColours; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
  { key: "topbar", label: "Top bar" },
];

/** What happens to one typeface, in a sentence. */
function faceNote(face: SiteImportFace | null | undefined): string {
  if (!face) return "Not settled by the stylesheets — this site keeps its own.";
  if (face.id) return `Matches ${face.family}, which this site already has.`;
  if (face.custom) return "Its font file will be installed in a free custom font slot.";
  return "Not available here and no font file was served — this site keeps its own.";
}

export function BrandPanel({
  brand, accept, colours, fonts, busy, onChange,
}: {
  brand: SiteImportBrand;
  accept: boolean;
  colours: boolean;
  fonts: boolean;
  busy: boolean;
  onChange: (next: { accept?: boolean; colours?: boolean; fonts?: boolean }) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const close = useCallback(() => setPreviewing(false), []);

  const found = ROLES.filter((r) => brand.colours[r.key]);
  const tokens = useMemo(() => {
    const base = DEFAULT_PRESET.inputs;
    const c = brand.colours;
    const display = brand.fonts.display?.id;
    const body = brand.fonts.body?.id;
    const theme = generate({
      primary: c.primary ?? base.primary,
      secondary: c.secondary ?? base.secondary,
      accent: c.accent ?? base.accent,
      background: c.background ?? base.background,
      text: c.text ?? base.text,
      fontDisplay: display ?? base.fontDisplay,
      fontBody: body ?? base.fontBody,
    }, "custom", "Imported");

    return themeTokensCss(c.topbar ? { ...theme, topbar: c.topbar } : theme);
  }, [brand]);

  useEffect(() => {
    if (!previewing) return;
    const post = () => frame.current?.contentWindow?.postMessage(
      { type: "tw:look", css: tokens, radius: "soft", density: "comfortable", surface: "flat", typeScale: "standard" }, window.location.origin,
    );
    const onReady = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && e.data?.type === "tw:look-ready") post();
    };
    post();
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [previewing, tokens]);

  if (!brand.found) {
    return (
      <fieldset>
        <legend className="mb-1 text-13 font-semibold">Colours and fonts</legend>
        <p className="measure text-12-5 text-muted">
          The site&apos;s stylesheets did not settle a colour or a typeface{brand.sheets === 0 ? " (none of its own could be read)" : ""}, so there is nothing to apply.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-13 font-semibold">Colours and fonts</legend>
      <p className="measure text-12-5 text-muted">
        Read from {brand.sheets > 0 ? `${brand.sheets} stylesheet${brand.sheets === 1 ? "" : "s"} and ` : ""}the pages&apos; own styles.
        Applying them changes how <strong>this</strong> site looks, as the Appearance settings do — so it is off until you say.
      </p>

      <ul className="flex flex-wrap gap-2" aria-label="Colours found">
        {ROLES.map((role) => {
          const hex = brand.colours[role.key];
          return (
            <li key={role.key} className="flex min-w-[6.5rem] flex-1 basis-[6.5rem] flex-col gap-1 rounded-md border border-line-strong bg-card p-2">
              <span
                aria-hidden
                className="block h-8 rounded border border-line"
                style={hex ? { backgroundColor: hex } : undefined}
              />
              <span className="text-12 font-semibold">{role.label}</span>
              <span className="font-mono text-12 text-muted">{hex ?? "not settled"}</span>
            </li>
          );
        })}
      </ul>

      <dl className="grid gap-2 text-12-5 sm:grid-cols-2">
        {(["display", "body"] as const).map((role) => {
          const face = brand.fonts[role];
          return (
            <div key={role}>
              <dt className="font-semibold">{role === "display" ? "Headlines" : "Body text"}: {face?.family ?? "—"}</dt>
              <dd className="text-muted">{faceNote(face)}</dd>
            </div>
          );
        })}
      </dl>

      <label className="flex items-center gap-2 text-13">
        <Switch checked={accept} disabled={busy} onChange={(e) => onChange({ accept: e.currentTarget.checked })} />
        <span className="font-semibold">Use this look for this site</span>
      </label>

      {accept && (
        <div className="ml-11 grid gap-1.5 text-13">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand-600" checked={colours} disabled={busy || found.length === 0}
              onChange={(e) => onChange({ colours: e.currentTarget.checked })} />
            <span>The colours ({found.length} of 6 found)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand-600" checked={fonts} disabled={busy || (!brand.fonts.display && !brand.fonts.body)}
              onChange={(e) => onChange({ fonts: e.currentTarget.checked })} />
            <span>The fonts</span>
          </label>
        </div>
      )}

      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewing(true)}>Preview these colours</Button>
      </div>

      <Modal
        open={previewing}
        onClose={close}
        size="xl"
        title="This site in the imported colours"
        description="Nothing is saved. A font file from the old site is installed only when you import, so the preview keeps this site's fonts for it."
        footer={<Button type="button" variant="secondary" onClick={close}>Close</Button>}
      >
        {previewing && (
          <iframe
            ref={frame}
            title="Live preview of the site in the imported colours"
            src="/theme-preview/current"
            className="block h-[60vh] w-full rounded-md border border-line bg-page"
          />
        )}
      </Modal>
    </fieldset>
  );
}
