"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { setSitemapInclude } from "@/lib/admin";

export type SitemapState = { error?: string };

/**
 * The only write on the SEO screen.
 *
 * Editing metadata stays on each record's own form — a second editor for the
 * same override row would be two implementations of the same rules. Sitemap
 * inclusion is different: it is a decision taken while looking at the whole
 * list, which is exactly what this screen is.
 */
export async function toggleSitemapAction(_prev: SitemapState, formData: FormData): Promise<SitemapState> {
  const type = String(formData.get("type") ?? "");
  const id = Number(formData.get("id"));
  const include = formData.get("include") === "1";

  if (!type || !id) return { error: "Missing record." };

  try {
    await setSitemapInclude(type, id, include);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Your account cannot change the sitemap." };
    }
    return { error: "That did not save." };
  }

  revalidatePath("/admin/seo");
  return {};
}
