"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { discardNewsletterImport, getNewsletterImport, startNewsletterCrawl } from "@/lib/admin";
import type { NewsletterMailboxImport } from "@/types/api";

const PAGE = "/admin/newsletter/subscribers/import/crawl";

/** The API's own sentence when it gave one — the first field error, else the message. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only a campaign manager can import subscribers.";
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : null;
    return first ?? error.message ?? fallback;
  }

  return fallback;
}

export async function startCrawlAction(payload: Record<string, unknown>): Promise<{ crawl?: NewsletterMailboxImport; error?: string; field?: string }> {
  try {
    const crawl = await startNewsletterCrawl(payload);

    revalidatePath(PAGE);

    return { crawl };
  } catch (error) {
    const field = error instanceof ApiError && error.errors ? Object.keys(error.errors)[0] : undefined;
    return { error: reason(error, "The crawl could not be started."), field };
  }
}

/** What the screen polls. Null when the request failed — nothing is a better answer than a guess. */
export async function pollCrawlAction(id: number): Promise<NewsletterMailboxImport | null> {
  try {
    return await getNewsletterImport(id);
  } catch {
    return null;
  }
}

export async function discardCrawlAction(id: number): Promise<{ error?: string }> {
  try {
    await discardNewsletterImport(id);
  } catch (error) {
    return { error: reason(error, "That crawl could not be discarded.") };
  }

  revalidatePath(PAGE);

  return {};
}
