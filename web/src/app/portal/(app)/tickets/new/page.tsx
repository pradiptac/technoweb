import { apiFetch } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TicketForm } from "./ticket-form";
import type { TicketCategory } from "@/types/api";

export const metadata = buildMetadata({
  title: "Submit a ticket",
  path: "/portal/tickets/new",
  seo: noIndex,
});

export default async function NewTicketPage() {
  // Categories are reference data, not customer data — safe to cache and share.
  let categories: TicketCategory[] = [];
  try {
    const res = await apiFetch<{ data: TicketCategory[] }>("/ticket-categories", {
      revalidate: 3600,
      tags: ["ticket-categories"],
    });
    categories = res.data;
  } catch {
    // A missing category list should not block someone reporting an outage —
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

      <div className="rounded-xl border border-line-strong bg-white p-6 lg:p-7">
        <TicketForm categories={categories} />
      </div>
    </>
  );
}
