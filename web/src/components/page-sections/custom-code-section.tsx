import { Container } from "@/components/ui/container";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import type { CustomCodeSectionData } from "@/types/page-sections";
import { CodeFrame, PageCode } from "./custom-code-frame";
import { SectionFrame } from "./section-parts";

/**
 * A custom code section (0.158.0, `docs/page-builder.md` "Custom code").
 *
 * **It runs only where `run` says so.** `PageSections` passes `run` from its
 * own `runCode`, which is false unless the public page or record route opts in —
 * so every console surface (the saved preview, the draft preview, the builder's
 * live frame, the theme preview) draws the labelled placeholder, and a new
 * caller has to ask to execute stored code rather than remember not to.
 */
export function CustomCodeSection({ data, run, reveal }: { data: CustomCodeSectionData; run: boolean } & { reveal?: SectionRevealAttr | null }) {
  if (!data.html) return null;

  return (
    <SectionFrame type="custom_code" reveal={reveal}>
      <Container>
        {!run ? (
          <p data-custom-code-placeholder className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-14 text-muted">
            Custom code &mdash; {data.label} &mdash; shown on the published page
          </p>
        ) : data.mode === "page" ? (
          <PageCode html={data.html} />
        ) : (
          <CodeFrame html={data.html} label={data.label} height={data.height} />
        )}
      </Container>
    </SectionFrame>
  );
}
