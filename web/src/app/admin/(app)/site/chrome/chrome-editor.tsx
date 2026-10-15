"use client";

import { useActionState, useId, useState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  FOOTER_PARTS, HEADER_PARTS, parseChrome, resolveFooter, resolveHeader,
  type ChromeSide, type FooterPartId, type HeaderPartId, type PartInfo, type StoredButton,
} from "@/themes/chrome-parts";
import { MANIFESTS } from "@/themes/manifests";
import { parseOptionsRow } from "@/themes/options";
import { saveSettingsAction, type SettingsFormState } from "../../settings/actions";

const initial: SettingsFormState = {};
/** `ThemeOptions::CTA_LABEL_MAX` on the API. */
const LABEL_MAX = 30;
/** `LinkPattern::REGEX` on the API: a path on this site, an http(s) address, a mailto: or a tel:. */
const HREF = /^(\/(?![/\\])[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+)$/i;
/** The header parts that live inside the strip above the bar, where a theme has one. */
const IN_TOPBAR = new Set<HeaderPartId>(["phone", "email", "search", "utility"]);

type Draft = Record<string, Record<string, unknown>>;

/** The parts in the order a theme draws them, with each reorderable group's members in the order chosen. */
function displayOrder<Id extends string>(side: ChromeSide<Id>, order: readonly Id[]): Id[] {
  const out = [...side.parts];
  for (const group of side.groups ?? []) {
    const slots = out.flatMap((id, i) => (group.includes(id) ? [i] : []));
    const sorted = order.filter((id) => group.includes(id));
    slots.forEach((slot, k) => { out[slot] = sorted[k]!; });
  }
  return out;
}

/**
 * The editor: one theme's header and footer parts, and a live frame of that
 * theme's real site beside them.
 *
 * Everything is edited as the *resolved* answer (what the site would draw
 * now) and written back as differences from the theme's own defaults — so a
 * switch left where the theme has it stores nothing, and "restore defaults"
 * is deleting two keys. The row is the Themes screen's: every other theme's
 * options and every other key are carried through untouched.
 */
export function ChromeEditor({ optionsRow, active }: { optionsRow: string; active: string }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);
  const [draft, setDraft] = useState<Draft>(() => parseOptionsRow(optionsRow));
  const [theme, setTheme] = useState(active);
  const [phone, setPhone] = useState(false);
  // A save re-renders the page with the row the API stored: start again from it.
  const [row, setRow] = useState(optionsRow);
  if (row !== optionsRow) {
    setRow(optionsRow);
    setDraft(parseOptionsRow(optionsRow));
  }
  const saved = JSON.stringify(parseOptionsRow(optionsRow));
  const json = JSON.stringify(draft);
  const dirty = json !== saved;

  const manifest = MANIFESTS.find((m) => m.id === theme) ?? MANIFESTS[0]!;
  const support = manifest.chrome;
  const stored = parseChrome(draft[theme]?.header, draft[theme]?.footer);
  const header = resolveHeader(support.header, stored.header);
  // The buttons are read raw, not parsed: a link half-typed is not yet a link, and parsing would eat it.
  const rawButtons = (draft[theme]?.header ?? {}) as { cta?: StoredButton; cta2?: StoredButton };
  const footer = resolveFooter(support.footer, stored.footer);

  // ---- writing differences back
  const writeTheme = (patch: { header?: object; footer?: object }) => {
    const mine: Record<string, unknown> = { ...(draft[theme] ?? {}) };
    for (const which of ["header", "footer"] as const) {
      if (!(which in patch)) continue;
      const next = patch[which]!;
      if (Object.keys(next).length > 0) mine[which] = next; else delete mine[which];
    }
    setDraft({ ...draft, [theme]: mine });
  };

  /** The differences for one side, from its resolved switches and order. */
  const diff = <Id extends string>(
    side: ChromeSide<Id>, show: Record<Id, boolean>, order: readonly Id[], skip: readonly string[] = [],
  ) => {
    const parts: Record<string, { on: boolean }> = {};
    for (const id of side.parts) {
      if (skip.includes(id)) continue;
      if (show[id] !== !side.off?.includes(id)) parts[id] = { on: show[id] };
    }
    const defaults = (side.groups ?? []).flat();
    const changed = order.some((id, i) => id !== defaults[i]);
    return { ...(Object.keys(parts).length ? { parts } : {}), ...(changed ? { order: [...order] } : {}) };
  };

  const buttonOut = (b: StoredButton | undefined, on: boolean): StoredButton | undefined => {
    const out: StoredButton = {};
    if (b?.label) out.label = b.label;
    if (b?.href) out.href = b.href;
    if (!on) out.on = false;
    return Object.keys(out).length ? out : undefined;
  };

  const setHeader = (change: { show?: Partial<Record<HeaderPartId, boolean>>; order?: HeaderPartId[]; cta?: StoredButton; cta2?: StoredButton }) => {
    const show = { ...header.show, ...change.show };
    const order = change.order ?? header.order;
    const next: Record<string, unknown> = { ...diff(support.header, show, order, ["cta", "cta2"]) };
    const cta = buttonOut(change.cta ?? rawButtons.cta, show.cta);
    const cta2 = buttonOut(change.cta2 ?? rawButtons.cta2, show.cta2);
    if (cta) next.cta = cta;
    if (cta2) next.cta2 = cta2;
    writeTheme({ header: next });
  };
  const setFooter = (change: { show?: Partial<Record<FooterPartId, boolean>>; order?: FooterPartId[] }) => {
    writeTheme({ footer: diff(support.footer, { ...footer.show, ...change.show }, change.order ?? footer.order) });
  };

  /** Swap two neighbours inside a group and give back the whole flattened order. */
  const moved = <Id extends string>(side: ChromeSide<Id>, order: readonly Id[], id: Id, delta: -1 | 1): Id[] => {
    const group = side.groups!.find((g) => g.includes(id))!;
    const sorted = order.filter((x) => group.includes(x));
    const i = sorted.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= sorted.length) return [...order];
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
    return side.groups!.flatMap((g) => (g === group ? sorted : order.filter((x) => g.includes(x))));
  };

  const hrefError = (b: StoredButton | undefined) => (b?.href && !HREF.test(b.href) ? "Use a path such as /contact, an https:// address, mailto: or tel:." : undefined);
  const invalid = Boolean(hrefError(rawButtons.cta) || hrefError(rawButtons.cta2));
  const reset = () => {
    const mine = { ...(draft[theme] ?? {}) };
    delete mine.header; delete mine.footer;
    setDraft({ ...draft, [theme]: mine });
  };
  const customised = Boolean(draft[theme]?.header || draft[theme]?.footer);

  const headerRows = displayOrder(support.header, header.order);
  const footerRows = displayOrder(support.footer, footer.order);

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title="Saved">The site shows it on its next request.</Alert>}
      <input type="hidden" name="setting__site_theme_options" value={json} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Field label="Theme" htmlFor="chrome-theme" variant="float-static" hint={theme === active ? "The theme the site is using now." : "Not the active theme — its choices are saved for when it is."}>
            <Select id="chrome-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {MANIFESTS.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === active ? " (active)" : ""}</option>)}
            </Select>
          </Field>

          <h2 className="mt-2 text-16 font-semibold text-ink">Header</h2>
          <ul className="mt-3 grid gap-2">
            {headerRows.map((id) => {
              const group = support.header.groups?.find((g) => g.includes(id));
              const sorted = header.order.filter((x) => group?.includes(x));
              const button = id === "cta" ? rawButtons.cta : id === "cta2" ? rawButtons.cta2 : undefined;
              return (
                <PartRow
                  key={id}
                  info={HEADER_PARTS[id]}
                  on={header.show[id]}
                  muted={IN_TOPBAR.has(id) && support.header.parts.includes("topbar") && !header.show.topbar}
                  onToggle={(on) => setHeader({ show: { [id]: on } })}
                  move={group ? { index: sorted.indexOf(id), count: group.length, onMove: (d) => setHeader({ order: moved(support.header, header.order, id, d) }) } : undefined}
                >
                  {(id === "cta" || id === "cta2") && header.show[id] && (
                    <ButtonFields
                      value={button}
                      error={hrefError(button)}
                      onChange={(b) => setHeader({ [id]: b })}
                    />
                  )}
                </PartRow>
              );
            })}
          </ul>

          <h2 className="mt-8 text-16 font-semibold text-ink">Footer</h2>
          <ul className="mt-3 grid gap-2">
            {footerRows.map((id) => {
              const group = support.footer.groups?.find((g) => g.includes(id));
              const sorted = footer.order.filter((x) => group?.includes(x));
              return (
                <PartRow
                  key={id}
                  info={FOOTER_PARTS[id]}
                  on={footer.show[id]}
                  onToggle={(on) => setFooter({ show: { [id]: on } })}
                  move={group ? { index: sorted.indexOf(id), count: group.length, onMove: (d) => setFooter({ order: moved(support.footer, footer.order, id, d) }) } : undefined}
                />
              );
            })}
          </ul>
          <p className="measure mt-4 text-12-5 text-muted">
            The phone and email in the mobile menu, and the footer on a small screen, follow the theme and
            are not affected. The light / dark switch in the header appears from 1600px wide; the footer&rsquo;s shows at every width.
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-16 font-semibold text-ink">Preview</h2>
            <div role="group" aria-label="Preview width" className="flex gap-1">
              <Button type="button" size="sm" variant={phone ? "ghost" : "soft"} aria-pressed={!phone} onClick={() => setPhone(false)}>Desktop</Button>
              <Button type="button" size="sm" variant={phone ? "soft" : "ghost"} aria-pressed={phone} onClick={() => setPhone(true)}>Phone</Button>
            </div>
          </div>
          <p className="mt-1 text-12-5 text-muted">The theme&rsquo;s real homepage as last saved. Save to see a change.</p>
          <iframe
            key={optionsRow}
            title={`${manifest.name} preview`}
            src={`/theme-preview/${theme}`}
            className={cn("mt-3 h-[640px] rounded-lg border border-line-strong bg-card", phone ? "mx-auto w-[360px] max-w-full" : "w-full")}
          />
        </div>
      </div>

      <FormActions dirty={dirty}>
        <Button type="submit" pending={pending} disabled={(!dirty && !pending) || invalid}>
          {pending ? "Saving…" : "Save header & footer"}
        </Button>
        <Button type="button" variant="ghost" disabled={!customised} onClick={reset}>
          Restore {manifest.name}&rsquo;s defaults
        </Button>
      </FormActions>
    </Form>
  );
}

function PartRow({
  info, on, onToggle, move, muted = false, children,
}: {
  info: PartInfo;
  on: boolean;
  onToggle: (on: boolean) => void;
  move?: { index: number; count: number; onMove: (delta: -1 | 1) => void };
  muted?: boolean;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <li className={cn("rounded-lg border border-line-strong bg-card p-3", muted && "opacity-60")}>
      <div className="flex items-center gap-3">
        <Switch id={id} checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-13-5 font-semibold text-ink">{info.label}</span>
          <span className="block text-12 text-muted">{info.blurb}</span>
        </label>
        {move && <ReorderButtons index={move.index} count={move.count} subject={info.label} onMove={move.onMove} dense />}
      </div>
      {children}
    </li>
  );
}

function ButtonFields({ value, error, onChange }: { value: StoredButton | undefined; error?: string; onChange: (b: StoredButton) => void }) {
  const id = useId();
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="Words" htmlFor={`${id}-label`} className="mb-0" hint="Blank keeps the theme's own words.">
        <Input
          id={`${id}-label`} maxLength={LABEL_MAX} value={value?.label ?? ""}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </Field>
      <Field label="Links to" htmlFor={`${id}-href`} className="mb-0" error={error} hint="Blank keeps the theme's own link.">
        <Input
          id={`${id}-href`} value={value?.href ?? ""} spellCheck={false} placeholder="/contact"
          onChange={(e) => onChange({ ...value, href: e.target.value.trim() })}
        />
      </Field>
    </div>
  );
}
