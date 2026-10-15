/*
 * Tenders, as the public API sends them (0.174.0, `docs/tenders.md`).
 *
 * **Every label here is the API's and nothing on this side formats a date.**
 * `opens_label`, `closes_label`, `state_label`, `closes_in_label`,
 * `fee_label` and `emd_label` arrive written, in the site's own timezone.
 *
 * That rule earns its keep here more than anywhere else in the product:
 * a tender's closing date is a deadline. A date formatted in the browser is
 * in the browser's zone and a date formatted by the Next server is in the
 * server's, and "six in the evening on the 10th" has to mean the same thing
 * to a bidder in Kolkata, in Dubai and on a laptop somebody forgot to set.
 * The only numbers that cross the wire are the instants, which exist for
 * `<time dateTime=…>` and for sorting, never for printing.
 *
 * The admin shapes live in `lib/admin/tenders.ts`, as every module's do.
 */

import type { Seo } from "@/types/api";

/** Whether a bid can be submitted right now. The API decides this. */
export type TenderState = "upcoming" | "open" | "closing_soon" | "closed";

/** The window, as both the row and the state endpoint carry it. */
export type TenderWindow = {
  state: TenderState;
  /** "Open", "Closing soon", "Closed", "Opens soon". */
  state_label: string;
  /** "3 days left", "Closes tomorrow", "Closes today" — null unless it is open. */
  closes_in_label: string | null;
  closed: boolean;
};

export type TenderCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** Published tenders on it. Only categories with at least one are sent. */
  count: number;
};

export type TenderCategoryList = {
  data: TenderCategory[];
  meta: { total: number; open: number; updated_at: string | null };
};

/** One of a tender's documents, resolved from the media library. */
export type TenderDocument = {
  title: string;
  note?: string;
  /** The file's address. An item whose file has gone is not sent at all. */
  url: string;
  size: number;
  extension?: string;
};

/** A tender as the index lists it, and the top of its page. */
export type TenderSummary = TenderWindow & {
  id: number;
  /** The buyer's own tender number, as the company issues it. */
  reference: string;
  title: string;
  slug: string;
  summary: string | null;
  category: { name: string; slug: string } | null;

  /** Instants, with the site's offset — for `<time>` and for sorting. */
  opens_at: string;
  closes_at: string;
  opening_at: string | null;
  prebid_at: string | null;

  /** The words. Nothing here formats a date. */
  opens_label: string;
  closes_label: string;
  opening_label: string | null;
  prebid_label: string | null;

  fee_paise: number | null;
  fee_label: string | null;
  emd_paise: number | null;
  emd_label: string | null;

  documents_count: number;
  is_featured: boolean;
  updated_at: string | null;
  /** The resolved override — what `buildMetadata` and the sitemap read. */
  seo?: Seo | null;
};

export type TenderDetail = TenderSummary & {
  description: string | null;
  prebid_place: string | null;
  documents: TenderDocument[];
  submission: {
    email: string | null;
    url: string | null;
    address: string | null;
  };
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  schema?: Record<string, unknown> | null;
};
