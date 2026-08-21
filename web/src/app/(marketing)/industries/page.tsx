import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ErrorState } from "@/components/ui/empty";
import { iconMap, type IconName } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Industry } from "@/types/api";

export const metadata = buildMetadata({
  title: "Industries",
  description:
    "IT infrastructure for healthcare, education, manufacturing, corporate, government and small business — built for how each one actually fails.",
  path: "/industries",
});

export default async function IndustriesPage() {
  let industries: Industry[] = [];
  let failed = false;

  try {
    industries = (await publicApi.industries()).data;
  } catch (error) {
    // Never ship a prerendered error page — break the build instead.
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        kicker="Industries"
        title="Different floors, different failure modes."
        lede="A hospital network and a factory network fail in completely different ways. We build for the one you actually run."
        crumbs={[{ name: "Industries", path: "/industries" }]}
      />

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        {failed ? (
          <ErrorState title="We could not load the industries list">Refresh in a moment.</ErrorState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((i) => {
              const Icon = iconMap[(i.icon ?? "building") as IconName] ?? iconMap.building;
              return (
                <Link
                  key={i.id}
                  href={`/industries/${i.slug}`}
                  className="relative flex min-h-33 flex-col justify-end overflow-hidden rounded-lg border border-line-strong bg-white px-5 py-5.5 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
                >
                  <Icon className="absolute top-4.5 left-5 size-5 text-brand-400" />
                  <h2 className="font-display text-[15.5px] tracking-[-.02em]">{i.name}</h2>
                  <span className="mt-0.75 text-[13px] text-muted">{i.summary}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
