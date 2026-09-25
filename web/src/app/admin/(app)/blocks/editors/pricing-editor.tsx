"use client";

import { NumberInput, Repeater, Row, Text, Toggle, getIn, useBlock, type Path } from "./shared";

/**
 * A pricing table's fields. Prices are typed in rupees and stored in paise —
 * the store's rule, money as integers everywhere — with an optional label
 * ("Custom", "From ₹4,999") that wins when it is set. Each set is a tab on
 * the page when there is more than one.
 */
export function PricingEditor({ layout }: { layout: string }) {
  const { content } = useBlock();
  const billing = getIn(content, ["billing", "enabled"]) === true;

  return (
    <>
      <Text path={["kicker"]} label="Kicker (optional)" />
      <Text path={["heading"]} label="Heading (optional)" />
      <Text path={["lede"]} label="Line under the heading (optional)" multiline />

      <Toggle path={["billing", "enabled"]} label="Offer a monthly / yearly switch" hint="Shown when any plan has a yearly price." />
      {billing && (
        <Row cols={3}>
          <Text path={["billing", "monthly_label"]} label="Monthly label" placeholder="Monthly" />
          <Text path={["billing", "yearly_label"]} label="Yearly label" placeholder="Yearly" />
          <Text path={["billing", "yearly_note"]} label="Yearly note" placeholder="Two months free" />
        </Row>
      )}

      <Repeater
        path={["sets"]}
        label="Price sets"
        subject="Set"
        min={1}
        max={6}
        hint="More than one set shows as tabs — for example Network AMC and CCTV AMC."
        blank={() => ({ label: "", plans: [{ name: "" }], rows: [] })}
        row={(p) => <SetFields path={p} layout={layout} billing={billing} />}
      />
    </>
  );
}

function SetFields({ path, layout, billing }: { path: Path; layout: string; billing: boolean }) {
  const { content } = useBlock();
  const plans = getIn(content, [...path, "plans"]);
  const planCount = Array.isArray(plans) ? plans.length : 0;

  return (
    <>
      <Text path={[...path, "label"]} label="Tab label" required />
      <Repeater
        path={[...path, "plans"]}
        label="Plans"
        subject="Plan"
        min={1}
        max={4}
        hint={layout === "single_focus" ? "Only the first plan of each set is shown in this layout." : undefined}
        blank={() => ({ name: "", features: [] })}
        row={(pp) => (
          <>
            <Row>
              <Text path={[...pp, "name"]} label="Plan name" required />
              <Text path={[...pp, "badge"]} label="Badge (optional)" placeholder="Most chosen" />
            </Row>
            <Text path={[...pp, "description"]} label="Line (optional)" multiline />
            <Row cols={3}>
              <NumberInput path={[...pp, "price_monthly_paise"]} label={billing ? "Monthly price (₹)" : "Price (₹)"} min={0} step={0.01} scale={100} />
              {billing && <NumberInput path={[...pp, "price_yearly_paise"]} label="Yearly price (₹)" min={0} step={0.01} scale={100} />}
              <Text path={[...pp, "period"]} label="Per" placeholder="per site" />
            </Row>
            <Text path={[...pp, "price_label"]} label="Price text instead (optional)" placeholder="Custom" hint="Shown in place of a number when set." />
            <FeaturesField path={[...pp, "features"]} />
            <Row>
              <Text path={[...pp, "cta", "label"]} label="Button label" placeholder="Enquire" />
              <Text path={[...pp, "cta", "href"]} label="Button link" placeholder="/contact?subject=AMC" />
            </Row>
            {layout === "three_tier" && <Toggle path={[...pp, "highlighted"]} label="Highlight this plan" />}
          </>
        )}
      />
      {layout === "comparison" && (
        <Repeater
          path={[...path, "rows"]}
          label="Comparison rows"
          subject="Row"
          max={40}
          hint={`One cell per plan (${planCount}), in the plans' order. Type yes or no for a tick or a dash, or any short text.`}
          blank={() => ({ label: "", cells: Array.from({ length: planCount }, () => "") })}
          row={(rp) => (
            <>
              <Row>
                <Text path={[...rp, "label"]} label="Feature" required />
                <Text path={[...rp, "group"]} label="Group heading (optional)" />
              </Row>
              <div className="grid gap-x-3 sm:grid-cols-4">
                {Array.from({ length: planCount }, (_, c) => (
                  <Text key={c} path={[...rp, "cells", c]} label={`Plan ${c + 1}`} placeholder="yes" />
                ))}
              </div>
            </>
          )}
        />
      )}
    </>
  );
}

/** Features, one per line — easier to type than a repeater for a list of short phrases. */
function FeaturesField({ path }: { path: Path }) {
  const { content, set, err } = useBlock();
  const value = getIn(content, path);
  const text = Array.isArray(value) ? value.join("\n") : "";
  const id = `features-${path.join("-")}`;
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="mb-[7px] block text-13-5 font-semibold">Features — one per line</label>
      <textarea
        id={id}
        key={text}
        rows={4}
        defaultValue={text}
        className="field w-full rounded border border-line-strong bg-card px-3 py-2.5 text-13-5"
        onBlur={(e) => {
          const lines = e.target.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          set(path, lines);
        }}
      />
      {err(path) && <p className="mt-1 text-12-5 text-err">{err(path)}</p>}
    </div>
  );
}
