"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/admin-auth";
import { cleanView, dashboardCookie, isDefaultView } from "@/lib/dashboard-view";

/**
 * Remember how this account's dashboard is arranged, in this browser.
 *
 * `null` — or a view that is the default — forgets the cookie rather than
 * storing the default, so a panel added in a later release lands where the
 * dashboard puts it and not where an old cookie happened to leave room.
 *
 * Nothing here reaches the API: it is a preference about one screen. The
 * cookie is httpOnly because only the server reads it, and scoped to `/admin`
 * because nothing else has a use for it.
 */
export async function saveDashboardView(input: { order: string[]; hidden: string[] } | null): Promise<void> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/login");

  const jar = await cookies();
  const name = dashboardCookie(staff.id);
  const view = cleanView(input);

  if (!input || isDefaultView(view)) {
    jar.delete({ name, path: "/admin" });
  } else {
    jar.set(name, JSON.stringify(view), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath("/admin");
}
