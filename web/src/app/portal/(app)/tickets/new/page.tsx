import Link from "next/link";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { IconBook } from "@/components/icons";
import { TicketForm } from "./ticket-form";
import type { TicketCategory } from "@/types/api";

export const metadata = buildMetadata({
  title: "Submit a ticket",
  path: "/portal/tickets/new",
  seo: noIndex,
});

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;

  // Categories are reference data, not customer data — safe to cache and share.
  let categories: TicketCategory[] = [];
  try {
    categories = (await publicApi.ticketCategories()).data;
  } catch {
    // A missing category list should never block someone reporting an outage —
    // the field is optional, so fall through with an empty list.
    categories = [];
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="display-3">Submit a ticket</h2>
        <p className="mt-1.5 text-[14.5px] text-muted">
          The more specific you are, the faster this gets resolved without a round of
          clarifying questions.
        </p>
      </div>

      {/* Deflection: a large share of tickets are already answered in writing.
          Offering the search here saves the customer hours and the desk a ticket. */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
        <IconBook className="size-5 shrink-0 text-brand-600" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug">
          Configuration questions are usually answered already — worth thirty seconds in the
          knowledge base before you raise this.
        </p>
        <Link
          href={subject ? `/knowledge-base?q=${encodeURIComponent(subject)}` : "/knowledge-base"}
          className="shrink-0 rounded border border-brand-300 bg-white px-3.5 py-2.5 text-[13.5px] font-semibold text-brand-700 hover:border-brand-600"
        >
          Search first
        </Link>
      </div>

      <div className="rounded-xl border border-line-strong bg-white p-6 lg:p-7">
        <TicketForm categories={categories} defaultSubject={subject ?? ""} />
      </div>
    </>
  );
}
