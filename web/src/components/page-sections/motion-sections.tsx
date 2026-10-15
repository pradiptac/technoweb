import { Container } from "@/components/ui/container";
import { LottiePlayer } from "@/components/ui/lottie-player";
import { ModelStage } from "@/components/ui/model-stage";
import { cn } from "@/lib/utils";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import type { LottieSectionData, ModelSectionData } from "@/types/page-sections";
import { SectionFrame, SectionHead } from "./section-parts";

/**
 * The animation and 3D-model sections (0.172.0, docs/page-builder.md
 * "Animation and 3D model"). Server components that reserve the box and hand
 * the file to a client island: a Lottie's box takes the animation's own
 * width ÷ height (the API reads it from the media row), a model's a fixed
 * height, so nothing moves when either arrives.
 */
const LOTTIE_WIDTH = { s: "max-w-80", m: "max-w-140", l: "max-w-220" } as const;
const MODEL_HEIGHT = { s: "h-80", m: "h-110", l: "h-150" } as const;

export function LottieSection({ data, reveal }: { data: LottieSectionData; reveal?: SectionRevealAttr | null }) {
  const start = data.align === "start";
  return (
    <SectionFrame type="lottie" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} lede={data.lede} center={!start} />
        <div
          className={cn("w-full", LOTTIE_WIDTH[data.size ?? "m"] ?? LOTTIE_WIDTH.m, !start && "mx-auto")}
          style={{ aspectRatio: String(data.ratio > 0 ? data.ratio : 1) }}
        >
          <LottiePlayer file={data.file} format={data.format} loop={!!data.loop} alt={data.alt} />
        </div>
      </Container>
    </SectionFrame>
  );
}

export function ModelSection({ data, reveal }: { data: ModelSectionData; reveal?: SectionRevealAttr | null }) {
  return (
    <SectionFrame type="model" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} lede={data.lede} center />
        <div className={cn("mx-auto w-full max-w-5xl", MODEL_HEIGHT[data.height ?? "m"] ?? MODEL_HEIGHT.m)}>
          <ModelStage file={data.file} alt={data.alt} poster={data.poster} posterAlt={data.poster_alt} rotate={data.rotate !== false} />
        </div>
      </Container>
    </SectionFrame>
  );
}
