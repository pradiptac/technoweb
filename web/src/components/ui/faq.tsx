import { JsonLd, jsonLd } from "@/lib/seo";
import type { Faq } from "@/types/api";

/**
 * Native <details> rather than a JS accordion: it is keyboard accessible and
 * findable by in-page search without any client bundle. The matching FAQPage
 * structured data is emitted alongside.
 */
export function FaqList({ faqs, heading = "Common questions" }: { faqs: Faq[]; heading?: string }) {
  if (!faqs.length) return null;

  return (
    <>
      <h2 className="display-3">{heading}</h2>
      <div className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-line-strong bg-card">
        {faqs.map((f) => (
          <details key={f.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4.5 text-[15.5px] font-semibold transition-colors hover:bg-brand-50 [&::-webkit-details-marker]:hidden">
              {f.question}
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
                className="ml-auto size-4 shrink-0 text-brand-ink transition-transform duration-200 group-open:rotate-45"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </summary>
            <div className="px-5 pb-5 text-[14.5px] leading-[1.62] text-muted">{f.answer}</div>
          </details>
        ))}
      </div>
      <JsonLd data={jsonLd.faqPage(faqs.map((f) => ({ question: f.question, answer: f.answer })))} />
    </>
  );
}
