import "server-only";
import { getToken } from "@/lib/admin-auth";

/**
 * What every domain module under `lib/admin/` shares. Every function in them
 * pulls the token from the httpOnly cookie itself through `token()`,
 * mirroring lib/portal.ts; nothing here is imported outside `lib/admin/`.
 */
export async function token(): Promise<string> {
  const t = await getToken();
  if (!t) throw new Error("No admin session.");
  return t;
}

/**
 * A query string from a params object, dropping anything empty.
 *
 * Undefined and empty string both mean "not filtered", and sending `?q=` is
 * not the same request as sending nothing — some of these endpoints treat a
 * present-but-blank filter as a filter.
 */
export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
