"use server";

import { redirect } from "next/navigation";
import { logout } from "@/lib/admin-auth";

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}
