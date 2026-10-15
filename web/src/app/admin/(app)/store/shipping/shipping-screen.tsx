"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Alert, Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty";
import { FormActions } from "@/components/admin/form-actions";
import { SettingSwitch } from "@/components/admin/setting-switch";
import { formatPaise, paiseToRupeeInput, rupeesToPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ShippingScreenData, ShippingZone } from "@/lib/admin";
import {
  deleteShippingZoneAction, moveShippingZoneAction, saveShippingSettingsAction, saveShippingZoneAction,
  type ShippingFormState,
} from "./actions";

const initial: ShippingFormState = {};

/** 500 → "500 g", 1500 → "1.5 kg". */
function weight(grams: number): string {
  return grams < 1000 ? `${grams} g` : `${Number((grams / 1000).toFixed(3))} kg`;
}

/**
 * How delivery is charged: the mode and the flat figure on top, then the zones
 * with their weight slabs (0.142.0, docs/store.md "Delivery charges and
 * shipping zones").
 *
 * Every rule is the API's — one default zone, a state in one active zone, a
 * rate to quote from, zones mode refused until it can quote — and this only
 * shows its sentence. What it adds is the picture: the states a zone holds,
 * the slabs read off in words, and a count of the products that will be
 * weighed at the shop's default because nobody entered a weight.
 */
export function ShippingScreen({ data }: { data: ShippingScreenData }) {
  return (
    <div className="grid gap-6">
      <SettingsPanel data={data} />
      <ZonesPanel data={data} />
    </div>
  );
}

/* ----------------------------------------------------------- the mode */

function SettingsPanel({ data }: { data: ShippingScreenData }) {
  const [state, formAction, pending] = useActionState(saveShippingSettingsAction, initial);
  const [mode, setMode] = useState<"flat" | "zones">(data.mode);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const option = (value: "flat" | "zones", title: string, body: string, disabled = false) => (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5",
        disabled ? "cursor-not-allowed border-line bg-surface-2 opacity-60"
          : mode === value ? "border-brand-600 bg-brand-50" : "border-line-strong bg-card hover:border-brand-300",
      )}
    >
      <input type="radio" name="mode" value={value} checked={mode === value} disabled={disabled}
        onChange={() => setMode(value)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]" />
      <span className="min-w-0">
        <span className="block text-14 font-medium">{title}</span>
        <span className="block text-12-5 text-muted">{body}</span>
      </span>
    </label>
  );

  return (
    <Card as="section" interactive={false} padding="md">
      <h2 className="mb-1 text-15 font-semibold">How delivery is charged</h2>
      <p className="measure mb-4 text-13 text-muted">
        The charge a customer sees is the charge they pay: it is added to any order that ships something, and
        to nothing else. Coupons never discount it, and a basket of licences and downloads has none.
      </p>

      <Form action={formAction} state={state} noValidate>
        {state.error && <Alert tone="err" title="Could not save" dismissible={false}>{state.error}</Alert>}
        {state.ok && !state.error && <Alert tone="ok" title="Delivery settings saved">The shop uses them from the next basket.</Alert>}

        <fieldset className="mb-4 grid gap-2 lg:grid-cols-2">
          <legend className="sr-only">Charging method</legend>
          {option("flat", "One flat charge", "The same figure on every order that ships. Leave it at 0 for free delivery.")}
          {option(
            "zones", "By zone and weight",
            data.zones_ready
              ? "Groups of states, each with rates by weight slab. Worked out from the basket's weight and the delivery state."
              : `Not available yet. ${data.zones_missing || "Make a default zone below with at least one weight slab first."}`,
            !data.zones_ready && data.mode !== "zones",
          )}
        </fieldset>

        {err("mode") && <p className="-mt-2 mb-3 text-12-5 text-err">{err("mode")}</p>}

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Flat charge (₹)" htmlFor="flat" error={err("flat_paise")}
            hint={mode === "zones" ? "Not used while delivery is charged by zone." : "0 means free delivery."}>
            <Input id="flat" name="flat" inputMode="decimal" defaultValue={paiseToRupeeInput(data.flat_paise)}
              aria-invalid={Boolean(err("flat_paise"))} />
          </Field>

          <Field label="Weight of a product with none entered (grams)" htmlFor="default_weight" error={err("default_weight_grams")}
            hint="Used for every product and option that has no weight of its own.">
            <Input id="default_weight" name="default_weight" type="number" min={1} inputMode="numeric"
              defaultValue={data.default_weight_grams} aria-invalid={Boolean(err("default_weight_grams"))} />
          </Field>
        </div>

        {data.products_without_weight > 0 && (
          <p className="measure mb-2 text-13 text-muted">
            <strong className="text-ink">{data.products_without_weight}</strong> shop {data.products_without_weight === 1 ? "product has" : "products have"} no
            weight, so {data.products_without_weight === 1 ? "it is" : "they are"} weighed at the default above.{" "}
            <Link href="/admin/store/products?no_weight=1" className="font-semibold text-brand-ink hover:underline">Show them</Link>
          </p>
        )}

        {mode === "zones" && (
          <p className="measure mb-2 text-13 text-muted">
            In zones mode the Google shopping feed and the product markup state no delivery price — it depends on
            where the parcel goes. Set your shipping rules in Merchant Center itself.
          </p>
        )}

        <FormActions>
          <Button type="submit" pending={pending}>{pending ? "Saving…" : "Save delivery settings"}</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* ------------------------------------------------------------- zones */

function ZonesPanel({ data }: { data: ShippingScreenData }) {
  const [editing, setEditing] = useState<ShippingZone | "new" | null>(null);
  const [removing, setRemoving] = useState<ShippingZone | null>(null);
  const names = useMemo(() => Object.fromEntries(data.states.map((s) => [s.value, s.label])), [data.states]);
  const hasDefault = data.zones.some((z) => z.is_default);

  return (
    <Card as="section" interactive={false} padding="md">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-15 font-semibold">Zones</h2>
        <Button type="button" size="sm" onClick={() => setEditing("new")}>Add a zone</Button>
      </div>
      <p className="measure mb-4 text-13 text-muted">
        A zone is a group of states with its own rates. The delivery state picks the zone; the basket&rsquo;s weight
        picks the slab. {hasDefault ? "" : "Start with the default zone — “Rest of India” — which answers for every state no other zone claims."}
      </p>

      {data.zones.length === 0 ? (
        <EmptyState compact title="No zones yet">Zones are only used when delivery is charged by zone and weight.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {data.zones.map((zone, i) => (
            <li key={zone.id} className="rounded-lg border border-line-strong p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-14-5 font-semibold">
                    {zone.name}
                    {zone.is_default && <Badge tone="brand" dot={false}>Default</Badge>}
                    {!zone.delivers && <Badge tone="urgent" dot={false}>Not delivered</Badge>}
                    {!zone.is_active && <Badge tone="closed" dot={false}>Switched off</Badge>}
                  </h3>
                  <p className="mt-1 text-13 text-muted">
                    {zone.is_default
                      ? "Every state no other active zone claims."
                      : zone.states.map((c) => names[c] ?? c).join(", ")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {/* Plain forms: a move is one press, and the list re-renders in the new order. */}
                  {(["up", "down"] as const).map((direction) => (
                    <form key={direction} action={moveShippingZoneAction}>
                      <input type="hidden" name="id" value={zone.id} />
                      <input type="hidden" name="direction" value={direction} />
                      <button
                        type="submit"
                        disabled={direction === "up" ? i === 0 : i === data.zones.length - 1}
                        aria-label={`Move ${zone.name} ${direction === "up" ? "earlier" : "later"}`}
                        className="grid size-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                      >
                        {direction === "up" ? "↑" : "↓"}
                      </button>
                    </form>
                  ))}
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(zone)}>Edit</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(zone)}>Delete</Button>
                </div>
              </div>

              {zone.delivers && (
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-13 sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">Rates</dt>
                  <dd className="tabular-nums">
                    {zone.rates.map((r) => `up to ${weight(r.up_to_grams)} — ${formatPaise(r.charge_paise)}`).join(" · ")}
                    {zone.extra_per_kg_paise !== null && zone.rates.length > 0 && (
                      <span className="text-muted"> · then {formatPaise(zone.extra_per_kg_paise)} for each extra kg</span>
                    )}
                  </dd>
                  {zone.free_above_paise !== null && (
                    <>
                      <dt className="text-muted">Free</dt>
                      <dd className="tabular-nums">on goods of {formatPaise(zone.free_above_paise)} or more, after any discount</dd>
                    </>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <ZoneDialog
          key={editing === "new" ? "new" : editing.id}
          zone={editing === "new" ? null : editing}
          data={data}
          onClose={() => setEditing(null)}
        />
      )}
      {removing !== null && <DeleteDialog zone={removing} onClose={() => setRemoving(null)} />}
    </Card>
  );
}

/* --------------------------------------------------------- the dialogs */

type SlabRow = { grams: string; charge: string };

function ZoneDialog({ zone, data, onClose }: { zone: ShippingZone | null; data: ShippingScreenData; onClose: () => void }) {
  const toast = useToast();

  const [state, formAction, pending] = useActionState(
    async (prev: ShippingFormState, formData: FormData) => {
      const res = await saveShippingZoneAction(prev, formData);
      if (res.ok) {
        onClose();
        toast({ tone: "ok", title: zone ? "Zone saved" : "Zone added" });
      }
      return res;
    },
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const [isDefault, setIsDefault] = useState(zone?.is_default ?? false);
  const [delivers, setDelivers] = useState(zone?.delivers ?? true);
  const [active, setActive] = useState(zone?.is_active ?? true);
  const [picked, setPicked] = useState<string[]>(zone?.states ?? []);
  const [rows, setRows] = useState<SlabRow[]>(
    (zone?.rates ?? [{ up_to_grams: 500, charge_paise: 0 }]).map((r) => ({
      grams: String(r.up_to_grams),
      charge: zone ? paiseToRupeeInput(r.charge_paise) : "",
    })),
  );

  const otherDefault = data.zones.find((z) => z.is_default && z.id !== zone?.id);

  // A state another active zone already holds is shown, with whose it is, and cannot be ticked here.
  const claimed = useMemo(() => {
    const map: Record<string, string> = {};
    for (const z of data.zones) {
      if (z.id === zone?.id || !z.is_active || z.is_default) continue;
      for (const code of z.states) map[code] = z.name;
    }
    return map;
  }, [data.zones, zone?.id]);

  const rates = JSON.stringify(
    rows
      .filter((r) => r.grams.trim() !== "" || r.charge.trim() !== "")
      .map((r) => ({ up_to_grams: Number(r.grams) || 0, charge_paise: rupeesToPaise(r.charge) ?? -1 })),
  );

  const setRow = (i: number, patch: Partial<SlabRow>) => setRows((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const loose = state.error && !["name", "states", "rates", "is_default", "extra_per_kg_paise", "free_above_paise"].some((f) => err(f))
    ? state.error : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={zone ? `Edit ${zone.name}` : "Add a zone"}
      description="A zone is a group of states with its own rates by weight."
    >
      <Form action={formAction} state={state} noValidate>
        {zone && <input type="hidden" name="id" value={zone.id} />}
        {/* Refusals draw inside the dialog: a toast behind an open <dialog> is inert and unseen. */}
        {loose && <Alert tone="err" title="Could not save" dismissible={false}>{loose}</Alert>}

        <Field label="Name" htmlFor="zone-name" error={err("name")}>
          <Input id="zone-name" name="name" maxLength={120} defaultValue={zone?.name ?? ""} required
            placeholder={isDefault ? "Rest of India" : "South India"} aria-invalid={Boolean(err("name"))} />
        </Field>

        <div className="mb-4 grid gap-3">
          <SettingSwitch id="zone-default" name="is_default" checked={isDefault} onChange={setIsDefault} align="start"
            note={otherDefault && !isDefault
              ? `“${otherDefault.name}” is already the default zone — there can be only one.`
              : "Answers for every state no other active zone claims. Always delivers, always on."}>
            This is the default zone
          </SettingSwitch>
          {err("is_default") && <p className="text-12-5 text-err">{err("is_default")}</p>}

          {!isDefault && (
            <>
              <SettingSwitch id="zone-delivers" name="delivers" checked={delivers} onChange={setDelivers} align="start"
                note={delivers ? "Orders to these states are taken at the rates below." : "A basket bound for these states is refused with a sentence saying so."}>
                We deliver here
              </SettingSwitch>
              <SettingSwitch id="zone-active" name="is_active" checked={active} onChange={setActive} align="start"
                note="Switched off, the zone is ignored and its states fall to another zone.">
                Switched on
              </SettingSwitch>
            </>
          )}
        </div>

        {!isDefault && (
          <fieldset className="mb-4">
            <legend className="mb-1.5 text-13 font-semibold">States</legend>
            <ul className="grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto rounded border border-line-strong p-3 sm:grid-cols-2">
              {data.states.map((s) => {
                const holder = claimed[s.value];
                const on = picked.includes(s.value);

                return (
                  <li key={s.value}>
                    <label className={cn("flex min-h-6 items-start gap-2 text-13-5", holder && !on && "opacity-60")}>
                      <input
                        type="checkbox" name="states" value={s.value} checked={on} disabled={Boolean(holder) && !on}
                        onChange={(e) => setPicked((all) => (e.target.checked ? [...all, s.value] : all.filter((c) => c !== s.value)))}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                      />
                      <span>
                        {s.label}
                        {holder && !on && <span className="block text-12 text-muted">in {holder}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {err("states") && <p className="mt-1.5 text-12-5 text-err">{err("states")}</p>}
          </fieldset>
        )}

        {(isDefault || delivers) && (
          <>
            <fieldset className="mb-3">
              <legend className="mb-1 text-13 font-semibold">Weight slabs</legend>
              <p className="measure mb-2 text-12-5 text-muted">
                The first slab whose limit is at or above the basket&rsquo;s weight sets the charge. A basket of exactly
                1000 g belongs to the “up to 1000 g” slab.
              </p>
              <input type="hidden" name="rates" value={rates} />

              <ul className="grid gap-2">
                {rows.map((row, i) => (
                  <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input aria-label={`Slab ${i + 1}: up to (grams)`} type="number" min={1} inputMode="numeric" placeholder="Up to (grams)"
                      value={row.grams} onChange={(e) => setRow(i, { grams: e.target.value })} />
                    <Input aria-label={`Slab ${i + 1}: charge (₹)`} inputMode="decimal" placeholder="Charge (₹)"
                      value={row.charge} onChange={(e) => setRow(i, { charge: e.target.value })} />
                    <button type="button" onClick={() => setRows((all) => all.filter((_, n) => n !== i))}
                      className="px-2 text-12-5 font-semibold text-muted hover:text-ink">Remove</button>
                  </li>
                ))}
              </ul>
              {err("rates") && <p className="mt-1.5 text-12-5 text-err">{err("rates")}</p>}
              {Object.keys(state.fieldErrors ?? {}).filter((k) => k.startsWith("rates.")).slice(0, 1).map((k) => (
                <p key={k} className="mt-1.5 text-12-5 text-err">{state.fieldErrors?.[k]?.[0]}</p>
              ))}

              <Button type="button" variant="secondary" size="sm" className="mt-2.5"
                onClick={() => setRows((all) => [...all, { grams: "", charge: "" }])}>
                Add a slab
              </Button>
            </fieldset>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Above the top slab, per extra kg (₹)" htmlFor="zone-extra" error={err("extra_per_kg_paise")}
                hint="Charged for every started kilogram above the last slab. 0 for nothing extra.">
                <Input id="zone-extra" name="extra_per_kg" inputMode="decimal" defaultValue={paiseToRupeeInput(zone?.extra_per_kg_paise)}
                  aria-invalid={Boolean(err("extra_per_kg_paise"))} />
              </Field>
              <Field label="Free delivery from goods of (₹)" htmlFor="zone-free" error={err("free_above_paise")}
                hint="Judged after any discount. Blank for never free.">
                <Input id="zone-free" name="free_above" inputMode="decimal" defaultValue={paiseToRupeeInput(zone?.free_above_paise)}
                  aria-invalid={Boolean(err("free_above_paise"))} />
              </Field>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" pending={pending}>{pending ? "Saving…" : zone ? "Save the zone" : "Add the zone"}</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        </div>
      </Form>
    </Modal>
  );
}

function DeleteDialog({ zone, onClose }: { zone: ShippingZone; onClose: () => void }) {
  const toast = useToast();

  const [state, formAction, pending] = useActionState(
    async (prev: ShippingFormState, formData: FormData) => {
      const res = await deleteShippingZoneAction(prev, formData);
      if (res.ok) {
        onClose();
        toast({ tone: "ok", title: "Zone deleted" });
      }
      return res;
    },
    initial,
  );

  return (
    <Modal open onClose={onClose} title={`Delete ${zone.name}?`}
      description="Orders already placed keep the zone's name as it was. The zone's states go to whichever zone answers for them next.">
      <Form action={formAction} state={state}>
        <input type="hidden" name="id" value={zone.id} />
        {state.error && <Alert tone="err" title="Could not delete" dismissible={false}>{state.error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="destructive" pending={pending}>{pending ? "Deleting…" : "Delete the zone"}</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Keep it</Button>
        </div>
      </Form>
    </Modal>
  );
}
