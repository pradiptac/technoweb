"use client";

import { IconPick, NumberInput, Repeater, Row, Text, Toggle, getIn, useBlock, type Path } from "./shared";

/** A stat bar's fields: the header, the figures, and — for chips — the recognitions. */
export function StatsEditor({ layout }: { layout: string }) {
  const emphasis = layout === "feature_cards" || layout === "chips";
  const rings = layout === "rings";

  return (
    <>
      <Text path={["kicker"]} label="Kicker (optional)" />
      <Row>
        <Text path={["heading"]} label={emphasis ? "Heading, first part" : "Heading (optional)"} placeholder={layout === "feature_cards" ? "Built for teams that" : undefined} />
        {emphasis && <Text path={["heading_emphasis"]} label="Heading, highlighted part" placeholder={layout === "feature_cards" ? "ship relentlessly" : "scales with you"} />}
      </Row>
      <Text path={["lede"]} label="Line under the heading (optional)" multiline />

      <Repeater
        path={["items"]}
        label="Figures"
        subject="Figure"
        min={1}
        max={rings ? 3 : 8}
        hint={rings ? "Exactly three, each with a percentage for its ring." : undefined}
        blank={() => ({ value: "", label: "" })}
        row={(p) => <ItemFields path={p} layout={layout} />}
      />

      {layout === "chips" && (
        <Repeater
          path={["recognitions"]}
          label="Recognitions (optional)"
          subject="Recognition"
          max={6}
          hint="A row under the chips — a partner tier, a review score."
          blank={() => ({ score: "", name: "" })}
          row={(p) => (
            <>
              <IconPick path={[...p, "icon"]} />
              <Row>
                <Text path={[...p, "score"]} label="Score or tier" placeholder="4.8" />
                <Text path={[...p, "name"]} label="Name" placeholder="Google reviews" />
              </Row>
            </>
          )}
        />
      )}
    </>
  );
}

function ItemFields({ path, layout }: { path: Path; layout: string }) {
  const { content, set } = useBlock();
  const series = getIn(content, [...path, "series"]);
  const seriesText = Array.isArray(series) ? series.join(", ") : "";

  return (
    <>
      <Row>
        <Text path={[...path, "value"]} label="Figure" placeholder="340+" required />
        <Text path={[...path, "label"]} label="Label" placeholder="Sites under AMC" required />
      </Row>
      {layout !== "rings" && layout !== "count_up" && <IconPick path={[...path, "icon"]} label="Icon (optional)" />}
      {layout === "feature_cards" && (
        <>
          <Text path={[...path, "badge"]} label="Badge" placeholder="Coverage" />
          <Text path={[...path, "description"]} label="Sentence" multiline />
        </>
      )}
      {layout === "rings" && <NumberInput path={[...path, "percent"]} label="Ring filled to (%)" min={0} max={100} step={0.1} />}
      {(layout === "sparkline_cards" || layout === "pulse_strip") && (
        <Text path={[...path, "delta"]} label="Change (optional)" placeholder="+14%" />
      )}
      {layout === "sparkline_cards" && (
        <div className="mb-[18px]">
          <label htmlFor={`series-${path.join("-")}`} className="mb-[7px] block text-13-5 font-semibold">Trend — numbers, oldest first</label>
          <input
            id={`series-${path.join("-")}`}
            // Re-mounted when the stored series changes — a row moved by the
            // reorder buttons brings its own numbers with it.
            key={seriesText}
            className="field w-full rounded border border-line-strong bg-card px-3 py-2.5 text-13-5"
            defaultValue={seriesText}
            placeholder="210, 240, 260, 290, 310"
            onBlur={(e) => {
              const values = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
              set([...path, "series"], values.length ? values : undefined);
            }}
          />
          <p className="mt-1 text-12-5 text-faint">Between 2 and 12 numbers, separated by commas.</p>
        </div>
      )}
      {layout === "pulse_strip" && <Toggle path={[...path, "anomaly"]} label="Unusual — make this one pulse" />}
    </>
  );
}
