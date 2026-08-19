import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { Prose } from "@/components/ui/prose";
import { ArrowLink } from "@/components/ui/button";
import { Card, CardIcon } from "@/components/ui/card";
import { iconMap, type IconName } from "@/components/icons";
import { ApiError, publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import type { Industry } from "@/types/api";

async function load(slug: string): Promise<Industry | null> {
  try {
    return (await publicApi.industry(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = await load(slug);

  if (!industry) return buildMetadata({ title: "Not found", path: `/industries/${slug}` });

  return buildMetadata({
    title: `IT infrastructure for ${industry.name}`,
    description: industry.summary,
    path: `/industries/${industry.slug}`,
    seo: industry.seo,
  });
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = await load(slug);

  if (!industry) notFound();

  const solutions = industry.solutions ?? [];

  return (
    <>
      <PageHero
        kicker="Industry"
        title={`Infrastructure for ${industry.name.toLowerCase()}`}
        lede={industry.summary}
        crumbs={[
          { name: "Industries", path: "/industries" },
          { name: industry.name, path: `/industries/${industry.slug}` },
        ]}
      />

      <Container className="py-16 lg:py-20">
        {industry.body && <Prose html={industry.body} className="mb-14" />}

        {solutions.length > 0 && (
          <section>
            <h2 className="display-3 mb-6">Where we usually start</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {solutions.map((s) => {
                const Icon = iconMap[(s.icon ?? "network") as IconName] ?? iconMap.network;
                return (
                  <Card key={s.id}>
                    <CardIcon><Icon /></CardIcon>
                    <h3 className="mb-2 text-[17px]">{s.title}</h3>
                    <p className="text-[14.5px] leading-[1.58] text-muted">{s.summary}</p>
                    <ArrowLink href={`/solutions/${s.slug}`} className="mt-4">Read more</ArrowLink>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <p className="mt-12 text-[14.5px] text-muted">
          Not sure which applies to you?{" "}
          <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
            Describe your setup
          </Link>{" "}
          and we will tell you what we would look at first.
        </p>
      </Container>

      <CtaBand />
    </>
  );
}
