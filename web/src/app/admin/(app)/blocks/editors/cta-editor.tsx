"use client";

import { Choice, FilePath, IconPick, ImagePath, NumberInput, Repeater, Row, Text, getIn, useBlock } from "./shared";

/**
 * A CTA banner's fields. Every layout has the words; each adds what it draws
 * — the API's `BlockRules` asks for exactly these, so nothing here is a field
 * the chosen layout would ignore.
 */
export function CtaEditor({ layout }: { layout: string }) {
  const { content } = useBlock();
  const formLayout = layout === "newsletter" || layout === "gated_download" || layout === "webinar";
  const buttons = !formLayout && layout !== "two_path" && layout !== "app_qr";
  const secondaryMode = getIn(content, ["secondary_mode"]) ?? "call";

  return (
    <>
      <Text path={["kicker"]} label="Kicker (optional)" hint="A short line above the heading." />
      <Text path={["heading"]} label="Heading" required />
      <Text path={["body"]} label="Text (optional)" multiline />

      {buttons && (
        <>
          <Row>
            <Text path={["primary", "label"]} label="Button label" placeholder="Book a site audit" />
            <Text path={["primary", "href"]} label="Button link" placeholder="/contact" hint="A path on this site, a full URL, mailto: or tel:." />
          </Row>
          {layout !== "hiring" && (
            <Choice
              path={["secondary_mode"]}
              label="Second button"
              fallback="call"
              options={[
                { value: "call", label: "Call the phone number from Settings" },
                { value: "link", label: "A link of my own" },
                { value: "none", label: "No second button" },
              ]}
            />
          )}
          {layout !== "hiring" && secondaryMode === "link" && (
            <Row>
              <Text path={["secondary", "label"]} label="Second button label" />
              <Text path={["secondary", "href"]} label="Second button link" />
            </Row>
          )}
        </>
      )}

      {layout === "split" && (
        <>
          <ImagePath path={["image_path"]} label="Picture" hint="Shown beside the words; about 1200 × 900 px." />
          <Choice path={["image_side"]} label="Picture side" fallback="right" options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} />
        </>
      )}

      {layout === "two_path" && (
        <Repeater
          path={["paths"]}
          label="The two paths"
          subject="Path"
          min={2}
          max={2}
          blank={() => ({ title: "", cta: { label: "", href: "" } })}
          row={(p) => (
            <>
              <IconPick path={[...p, "icon"]} />
              <Text path={[...p, "title"]} label="Title" required />
              <Text path={[...p, "body"]} label="Line (optional)" multiline />
              <Row>
                <Text path={[...p, "cta", "label"]} label="Button label" />
                <Text path={[...p, "cta", "href"]} label="Button link" />
              </Row>
            </>
          )}
        />
      )}

      {layout === "reassurance" && (
        <Repeater
          path={["promises"]}
          label="Promises"
          subject="Promise"
          min={1}
          max={4}
          hint="Up to four short lines, each shown with a tick under the button."
          blank={() => ""}
          row={(p) => <Text path={p} label="Promise" />}
        />
      )}

      {formLayout && (
        <Row>
          <Text path={["button_label"]} label="Button label (optional)" />
          {layout === "newsletter" && <Text path={["placeholder"]} label="Email placeholder (optional)" placeholder="you@company.in" />}
        </Row>
      )}

      {layout === "gated_download" && (
        <FilePath path={["media_path"]} label="The PDF" hint="Its link is shown only after somebody gives an email address, and never appears in the page." />
      )}

      {layout === "countdown" && (
        <>
          <Text path={["ends_at"]} type="datetime-local" label="Ends at" hint="In your own time zone." />
          <Choice path={["expired"]} label="When it runs out" fallback="hide" options={[{ value: "hide", label: "Hide the banner" }, { value: "message", label: "Show a message instead" }]} />
          {getIn(content, ["expired"]) === "message" && <Text path={["expired_message"]} label="Message" />}
        </>
      )}

      {layout === "webinar" && (
        <Row cols={3}>
          <Text path={["starts_at"]} type="datetime-local" label="Starts at" />
          <NumberInput path={["duration_minutes"]} label="Minutes" min={5} max={600} />
          <Text path={["where"]} label="Where" placeholder="Online" />
        </Row>
      )}

      {layout === "hiring" && (
        <NumberInput path={["limit"]} label="Roles to list" min={1} max={6} hint="The newest open vacancies, from Careers. 3 when blank." />
      )}

      {layout === "app_qr" && (
        <>
          <Text path={["url"]} label="App link" placeholder="https://…" hint="Where the QR code and a single button point." />
          <Row>
            <Text path={["ios_url"]} label="App Store link (optional)" />
            <Text path={["android_url"]} label="Google Play link (optional)" />
          </Row>
          <ImagePath path={["qr_path"]} label="QR code image" hint="Upload the QR code for the app link — a square PNG or SVG." />
        </>
      )}
    </>
  );
}
