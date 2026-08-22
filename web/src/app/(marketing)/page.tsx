import { Hero } from "@/components/home/hero";
import {
  CaseStudies, FinalCta, Industries, Partners, ProductCategories,
  Resources, Solutions, SupportBand, WebServices, WhyUs,
} from "@/components/home/sections";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Technology infrastructure that keeps your business connected",
  description:
    "Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure across India — backed by a real engineering support desk.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <Hero />
      <Partners />
      <Solutions />
      <ProductCategories />
      <WhyUs />
      <Industries />
      <WebServices />
      <SupportBand />
      <CaseStudies />
      <Resources />
      <FinalCta />
    </>
  );
}
