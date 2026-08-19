import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { IconBook, IconMail, IconPhone, IconTicket } from "@/components/icons";
import { buildMetadata } from "@/lib/seo";
import { contact } from "@/content/site";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "Contact",
  description:
    "Talk to a Technoware engineer about networking, servers, security or an AMC contract. Existing customers can raise a support ticket directly.",
  path: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;

  return (
    <>
      <PageHero
        kicker="Contact"
        title="Tell us what you're working with."
        lede="A short description of your site and what is prompting the change is enough — an engineer reads every enquiry and replies with something specific."
        crumbs={[{ name: "Contact", path: "/contact" }]}
      />

      <Container className="py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_340px] lg:gap-16">
          <div className="min-w-0">
            {subject && (
              <p className="mb-6 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[14px]">
                Enquiring about <strong className="font-semibold">{subject}</strong>.
              </p>
            )}
            <div className="max-w-[620px] rounded-xl border border-line-strong bg-white p-6 lg:p-7">
              <EnquiryForm source="contact" subject={subject} />
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-xl border border-line-strong bg-surface p-5.5">
              <h2 className="text-[15.5px]">Straight through</h2>
              <ul className="mt-4 grid gap-3.5">
                <li className="flex items-start gap-3">
                  <IconPhone className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span>
                    <a href={contact.phoneHref} className="block py-0.5 text-[14.5px] font-semibold hover:underline">
                      {contact.phone}
                    </a>
                    <span className="text-[13px] text-muted">Mon–Sat, 9:30–18:30 IST</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <IconMail className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span>
                    <a href={`mailto:${contact.email}`} className="block py-0.5 text-[14.5px] font-semibold hover:underline">
                      {contact.email}
                    </a>
                    <span className="text-[13px] text-muted">Support and general enquiries</span>
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-line-strong bg-dark p-5.5 text-dark-ink">
              <h2 className="text-[15.5px] text-dark-ink">Already a customer?</h2>
              <p className="mt-2 text-[13.5px] leading-normal text-dark-muted">
                Don&rsquo;t use this form for faults — raise a ticket instead and it lands on
                the support desk with an SLA clock attached.
              </p>
              <div className="mt-4 grid gap-2">
                <Link href="/portal/tickets/new" className="inline-flex items-center gap-2 rounded bg-white px-4 py-[11px] text-[13.5px] font-semibold text-dark transition-colors hover:bg-brand-50">
                  <IconTicket className="size-4" /> Submit a ticket
                </Link>
                <Link href="/knowledge-base" className="inline-flex items-center gap-2 rounded border border-dark-line px-4 py-[11px] text-[13.5px] font-semibold transition-colors hover:border-dark-muted">
                  <IconBook className="size-4" /> Knowledge base
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
