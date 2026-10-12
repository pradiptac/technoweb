"use client";

import { useActionState, useState } from "react";
import type { MouseEvent } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FormActions } from "@/components/admin/form-actions";
import { RecordSwitch } from "@/components/admin/record-switch";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs } from "@/components/admin/form-tabs";
import { COUNTRIES, MAP_HEIGHT, MAP_WIDTH, project, unproject } from "@/content/world-map";
import { zoomFor } from "@/components/support/map-zoom";
import { createSupportCentreAction, updateSupportCentreAction, type SupportCentreState } from "./actions";
import type { AdminSupportCentre, SupportCentreMeta } from "@/types/support";

const initial: SupportCentreState = {};

type StaffRow = { key: string; user_id: number; title: string; is_public: boolean };
type StaffOption = { id: number; name: string; email: string };

const GROUPS = [
  { id: "details", label: "Details", fields: ["name", "slug", "kind", "phone", "phone_alt", "email", "hours", "sort_order", "is_active"] },
  { id: "location", label: "Location", fields: ["country_code", "region", "city", "address", "latitude", "longitude", "location_id"] },
  { id: "staff", label: "Staff", fields: ["staff"] },
];

/**
 * Coordinates from a Google Maps link, read here — no request is made:
 * `@22.57,88.36,15z`, `?q=22.57,88.36`, `!3d22.57!4d88.36`, `ll=`.
 */
export function coordsFromLink(text: string): { lat: number; lng: number } | null {
  const t = decodeURIComponent(text.trim());
  const patterns = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/**
 * A support centre (docs/support-network.md): its details, where it is — the
 * pin placed by pressing the map, typing the coordinates or pasting a Google
 * Maps link — and the staff who work there, each with a title and whether
 * their name is shown on the website.
 */
export function CentreForm({ centre, meta, staffOptions }: {
  centre?: AdminSupportCentre;
  meta: SupportCentreMeta;
  staffOptions: StaffOption[];
}) {
  const action = centre ? updateSupportCentreAction.bind(null, centre.id) : createSupportCentreAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];
  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  const [country, setCountry] = useState(centre?.country_code ?? "IN");
  const [lat, setLat] = useState(centre?.latitude != null ? String(centre.latitude) : "");
  const [lng, setLng] = useState(centre?.longitude != null ? String(centre.longitude) : "");
  const [link, setLink] = useState("");
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>(
    (centre?.staff ?? []).map((s, i) => ({ key: `s${i}-${s.user_id}`, user_id: s.user_id, title: s.title ?? "", is_public: s.is_public })),
  );
  const [adding, setAdding] = useState("");

  const box = COUNTRIES.find((c) => c.code === country)?.box ?? null;
  const zoom = zoomFor(box, MAP_WIDTH, MAP_HEIGHT);
  const pin = lat !== "" && lng !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    ? project(Number(lat), Number(lng)) : null;

  const place = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const g = svg.querySelector<SVGGElement>("[data-map-zoom]");
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const m = g?.getScreenCTM();
    if (!m) return;
    const p = point.matrixTransform(m.inverse());
    const ll = unproject(p.x, p.y);
    setLat(ll.lat.toFixed(5));
    setLng(ll.lng.toFixed(5));
  };

  const used = new Set(staff.map((s) => s.user_id));
  const nameOf = (id: number) => staffOptions.find((o) => o.id === id)?.name ?? `Staff #${id}`;

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      <input type="hidden" name="staff" value={JSON.stringify(staff.map(({ user_id, title, is_public }) => ({ user_id, title: title.trim() || null, is_public })))} />

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div>
            <Field label="Name" htmlFor="name" error={err("name")} hint="As a visitor should know it — “Kolkata Service Centre”.">
              <Input id="name" name="name" defaultValue={centre?.name} required maxLength={160} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telephone" htmlFor="phone" error={err("phone")}>
                <Input id="phone" name="phone" type="tel" defaultValue={centre?.phone ?? ""} maxLength={40} />
              </Field>
              <Field label="Other telephone" htmlFor="phone_alt" error={err("phone_alt")}>
                <Input id="phone_alt" name="phone_alt" type="tel" defaultValue={centre?.phone_alt ?? ""} maxLength={40} />
              </Field>
            </div>
            <Field label="Email" htmlFor="email" error={err("email")}>
              <Input id="email" name="email" type="email" defaultValue={centre?.email ?? ""} maxLength={191} />
            </Field>
            <Field label="Opening hours" htmlFor="hours" error={err("hours")} hint="One line — “Mon–Sat, 9:30 am – 6:30 pm”.">
              <Input id="hours" name="hours" defaultValue={centre?.hours ?? ""} maxLength={255} />
            </Field>
          </div>
          <aside>
            <Field label="Kind" htmlFor="kind" variant="float-static" error={err("kind")}>
              <Select id="kind" name="kind" defaultValue={centre?.kind ?? "service_centre"}>
                {meta.kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </Field>
            <Field label="Address on the page" htmlFor="slug" error={err("slug")} hint="The card's anchor, /support-network#this. Blank makes it from the name.">
              <Input id="slug" name="slug" defaultValue={centre?.slug ?? ""} maxLength={180} className="font-mono" />
            </Field>
            <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Within its city; lower first.">
              <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={centre?.sort_order ?? 0} />
            </Field>
            <RecordSwitch name="is_active" defaultChecked={centre?.is_active !== false} label="Shown on the website" className="mb-[18px]" />
          </aside>
        </div>

        <div className="grid gap-x-8 lg:grid-cols-[320px_1fr]">
          <div>
            <Field label="Country" htmlFor="country_code" variant="float-static" error={err("country_code")}>
              <Select id="country_code" name="country_code" value={country} onChange={(e) => setCountry(e.target.value)}>
                {meta.countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="State or region" htmlFor="region" error={err("region")}>
              <Input id="region" name="region" defaultValue={centre?.region ?? ""} maxLength={120} />
            </Field>
            <Field label="City" htmlFor="city" error={err("city")} hint="The list groups the centres by city.">
              <Input id="city" name="city" defaultValue={centre?.city ?? ""} required maxLength={120} />
            </Field>
            <Field label="Address" htmlFor="address" error={err("address")} hint="As it should be written; line breaks are kept.">
              <Textarea id="address" name="address" rows={4} defaultValue={centre?.address ?? ""} maxLength={1000} />
            </Field>
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-13-5 font-semibold">Pin on the map</p>
            <p className="mb-2 text-12-5 text-muted">Press the map where the centre is, type its coordinates, or paste a Google Maps link. Without a pin the centre is listed but not drawn on the map.</p>
            <div className="overflow-hidden rounded-lg border border-line-strong bg-card">
              <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="block h-auto w-full cursor-crosshair" onClick={place} role="img" aria-label="Map: press to place the pin" data-centre-map style={{ ["--s" as string]: zoom.s }}>
                <g data-map-zoom style={{ transform: zoom.transform }}>
                  {COUNTRIES.map((c) => (
                    <path key={`${c.code}-${c.name}`} d={c.d} className="support-land" data-has-centre={c.code === country ? "" : undefined} />
                  ))}
                  {pin && (
                    <g transform={`translate(${pin.x.toFixed(2)} ${pin.y.toFixed(2)})`} className="support-pin" data-active="">
                      <circle className="support-pin-halo" r={10} />
                      <circle className="support-pin-dot" r={4.5} />
                    </g>
                  )}
                </g>
              </svg>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" htmlFor="latitude" error={err("latitude")}>
                <Input id="latitude" name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
              </Field>
              <Field label="Longitude" htmlFor="longitude" error={err("longitude")}>
                <Input id="longitude" name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Paste a Google Maps link" htmlFor="maps_link" className="mb-0 min-w-0 flex-1" hint={linkNote ?? "Its coordinates are read here; nothing is sent anywhere."}>
                <Input id="maps_link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.google.com/maps/…" />
              </Field>
              <Button type="button" variant="secondary" size="sm" className="mb-6" onClick={() => {
                const c = coordsFromLink(link);
                if (!c) { setLinkNote("No coordinates found in that link. Open the place in Google Maps and copy the address bar."); return; }
                setLat(String(c.lat)); setLng(String(c.lng)); setLink(""); setLinkNote("Pin placed from the link.");
              }}>Use link</Button>
              {pin && <Button type="button" variant="ghost" size="sm" className="mb-6" onClick={() => { setLat(""); setLng(""); }}>Remove pin</Button>}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 max-w-[70ch] text-13 text-muted">
            The staff who work at this centre. A name marked “On the website” is listed on the centre’s card with its title;
            a staff member’s email and mobile are never shown. Tagging also lets the Staff screen be filtered by centre.
          </p>
          {err("staff") && <p className="mb-3 text-12-5 text-err">{err("staff")}</p>}
          {staff.length === 0 ? (
            <p className="mb-4 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-13 text-muted">Nobody is tagged to this centre yet.</p>
          ) : (
            <ul className="mb-4 grid gap-2" data-centre-staff>
              {staff.map((row, i) => (
                <li key={row.key} className="grid items-center gap-3 rounded-lg border border-line-strong bg-card p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <span className="min-w-0 truncate text-13-5 font-semibold">{nameOf(row.user_id)}</span>
                  <Input aria-label={`Title for ${nameOf(row.user_id)}`} placeholder="Title, e.g. Field engineer" value={row.title} maxLength={80}
                    onChange={(e) => setStaff((s) => s.map((r) => (r.key === row.key ? { ...r, title: e.target.value } : r)))} />
                  <label className="flex items-center gap-2 text-12-5 text-muted">
                    <Switch checked={row.is_public} onChange={(e) => setStaff((s) => s.map((r) => (r.key === row.key ? { ...r, is_public: e.target.checked } : r)))} />
                    On the website
                  </label>
                  <ReorderButtons dense index={i} count={staff.length} subject={nameOf(row.user_id)}
                    onMove={(d) => setStaff((s) => { const n = [...s]; const j = i + d; [n[i], n[j]] = [n[j]!, n[i]!]; return n; })}
                    onRemove={() => setStaff((s) => s.filter((r) => r.key !== row.key))} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Add a staff member" htmlFor="add_staff" variant="float-static" className="mb-0 min-w-[16rem]">
              <Select id="add_staff" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose…</option>
                {staffOptions.filter((o) => !used.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name} — {o.email}</option>)}
              </Select>
            </Field>
            <Button type="button" variant="secondary" size="sm" disabled={!adding} onClick={() => {
              const id = Number(adding);
              setStaff((s) => [...s, { key: `n${Date.now()}-${id}`, user_id: id, title: "", is_public: true }]);
              setAdding("");
            }}>Add</Button>
          </div>
        </div>
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : centre ? "Save centre" : "Create centre"}
        </Button>
      </FormActions>
    </Form>
  );
}
