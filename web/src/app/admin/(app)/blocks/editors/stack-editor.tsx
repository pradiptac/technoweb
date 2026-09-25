"use client";

import { Choice, IconPick, ImagePath, NumberInput, Repeater, Row, Text, getIn, useBlock, type Path } from "./shared";

/**
 * A technology stack's fields: groups (a ring, a heading, a layer or a row,
 * depending on the layout) holding technologies. A technology's picture is
 * one of three things — an icon, a picture from the library, or a catalogue
 * brand, whose own logo and name are used so a logo changed on the brand
 * screen reaches the diagram.
 */
export function StackEditor({ layout }: { layout: string }) {
  const orbit = layout === "orbit";
  const rotating = orbit;

  return (
    <>
      <Text path={["kicker"]} label="Kicker (optional)" />
      <Text path={["heading"]} label="Heading (optional)" />
      <Text path={["lede"]} label="Line under the heading (optional)" multiline />
      {orbit && <ImagePath path={["center", "image_path"]} label="Centre logo (optional)" hint="Blank uses the site logo." />}

      <Repeater
        path={["groups"]}
        label={orbit ? "Rings" : layout === "layers" ? "Layers" : layout === "marquee" ? "Rows" : "Groups"}
        subject={orbit ? "Ring" : layout === "layers" ? "Layer" : layout === "marquee" ? "Row" : "Group"}
        min={1}
        max={orbit ? 3 : 4}
        hint={orbit ? "Up to three rings of up to eight each; the first ring is the innermost." : undefined}
        blank={() => ({ name: "", items: [{ label: "" }] })}
        row={(p) => (
          <>
            <Text path={[...p, "name"]} label="Name" required placeholder="Networking" />
            {rotating && (
              <Row>
                <NumberInput path={[...p, "speed_seconds"]} label="Seconds per turn" min={12} max={120} hint="12–120; 60 when blank." />
                <Choice path={[...p, "direction"]} label="Direction" fallback="cw" options={[{ value: "cw", label: "Clockwise" }, { value: "ccw", label: "Anticlockwise" }]} />
              </Row>
            )}
            <Repeater
              path={[...p, "items"]}
              label="Technologies"
              subject="Technology"
              min={1}
              max={orbit ? 8 : 12}
              blank={() => ({ label: "" })}
              row={(ip) => <ItemFields path={ip} layout={layout} />}
            />
          </>
        )}
      />
    </>
  );
}

type Picture = "icon" | "image" | "brand";

function ItemFields({ path, layout }: { path: Path; layout: string }) {
  const { content, set, brands } = useBlock();
  const brandId = getIn(content, [...path, "brand_id"]);
  const current: Picture = typeof brandId === "number" ? "brand" : getIn(content, [...path, "image_path"]) ? "image" : "icon";

  // Changing the kind of picture clears the other two, so the API never sees two.
  const choose = (kind: Picture) => {
    if (kind !== "icon") set([...path, "icon"], undefined);
    if (kind !== "image") set([...path, "image_path"], undefined);
    if (kind !== "brand") set([...path, "brand_id"], undefined);
    if (kind === "brand" && brands[0]) set([...path, "brand_id"], brands[0].id);
  };
  const id = `pic-${path.join("-")}`;

  return (
    <>
      <div className="mb-[18px]">
        <span className="mb-[7px] block text-13-5 font-semibold">Picture</span>
        <div role="radiogroup" aria-label="Picture" className="flex flex-wrap gap-4">
          {(["icon", "image", "brand"] as const).map((kind) => (
            <label key={kind} className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-13-5">
              <input type="radio" name={id} className="accent-brand-600" checked={current === kind} onChange={() => choose(kind)} />
              {kind === "icon" ? "An icon" : kind === "image" ? "A picture" : "A catalogue brand"}
            </label>
          ))}
        </div>
      </div>

      {current === "icon" && <IconPick path={[...path, "icon"]} />}
      {current === "image" && <ImagePath path={[...path, "image_path"]} label="Picture" hint="A logo on a transparent ground reads best." />}
      {current === "brand" && (
        <div className="mb-[18px]">
          <label htmlFor={`${id}-brand`} className="mb-[7px] block text-13-5 font-semibold">Brand</label>
          <select
            id={`${id}-brand`}
            className="field w-full rounded border border-line-strong bg-card px-3 py-2.5 text-13-5"
            value={typeof brandId === "number" ? String(brandId) : ""}
            onChange={(e) => set([...path, "brand_id"], e.target.value ? Number(e.target.value) : undefined)}
          >
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <p className="mt-1 text-12-5 text-faint">Its logo and name come from the brand; the label below can override the name.</p>
        </div>
      )}

      <Row>
        <Text path={[...path, "label"]} label={current === "brand" ? "Label (optional)" : "Label"} required={current !== "brand"} />
        <Text path={[...path, "type"]} label="Type (optional)" placeholder="Firewall" />
      </Row>
      {(layout === "orbit" || layout === "grouped" || layout === "globe") && (
        <Row>
          <Text path={[...path, "badge"]} label="Badge (optional)" placeholder="Advanced partner" />
          <Text path={[...path, "href"]} label="Link (optional)" placeholder="/brands/cisco" />
        </Row>
      )}
      {layout === "orbit" && <Text path={[...path, "description"]} label="Details (optional)" multiline />}
      {layout === "cloud" && <NumberInput path={[...path, "weight"]} label="Importance, 1–5" min={1} max={5} hint="Bigger names for bigger numbers; 3 when blank." />}
      {layout === "orbit" && (
        <Text path={[...path, "colour"]} label="Glow colour (optional)" placeholder="#1ba0d7" hint="A #rrggbb colour for the node's ring — never used for text." />
      )}
    </>
  );
}
