import type { BlogPost, CaseStudy, Industry, Product, Service, Solution, StoreProduct } from "@/types/api";
import type { PageSection } from "@/types/page-sections";
import { BlogTemplate } from "./blog-template";
import { CaseStudyTemplate } from "./case-study-template";
import { IndustryTemplate } from "./industry-template";
import { ProductTemplate } from "./product-template";
import { ServiceTemplate } from "./service-template";
import { SolutionTemplate } from "./solution-template";
import { StoreProductTemplate } from "./store-product-template";

/**
 * A detail template as typed in the console, drawn around one chosen record
 * (0.161.0) — the kind's own template view, handed the record's public read
 * with the unsaved stack in place of its active template. Pasted code is
 * drawn as a placeholder, never run (`preview`). The record is whatever the
 * API sent, so the cast is the one place this trusts its shape.
 */
export function TemplatePreviewView({ type, record, sections }: { type: string; record: Record<string, unknown>; sections: PageSection[] }) {
  const read = { ...record, detail_template: { id: 0, sections } };

  switch (type) {
    case "solution": return <SolutionTemplate solution={read as unknown as Solution} preview />;
    case "service": return <ServiceTemplate service={read as unknown as Service} preview />;
    case "industry": return <IndustryTemplate industry={read as unknown as Industry} preview />;
    case "case_study": return <CaseStudyTemplate study={read as unknown as CaseStudy} preview />;
    case "product": return <ProductTemplate p={read as unknown as Product} preview />;
    case "store_product": return <StoreProductTemplate product={read as unknown as StoreProduct} preview />;
    case "blog_post": return <BlogTemplate post={read as unknown as BlogPost} preview />;
    default: return null;
  }
}
