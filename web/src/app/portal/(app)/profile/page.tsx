import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProfileForm } from "./profile-form";

export const metadata = buildMetadata({ title: "My profile", path: "/portal/profile", seo: noIndex });

export default async function ProfilePage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/portal/login");

  return (
    <>
      <div className="mb-6">
        <h2 className="display-3">My profile</h2>
        <p className="mt-1.5 text-[14.5px] text-muted">
          Keep your contact details current — this is where we call when something needs
          confirming on site.
        </p>
      </div>

      <div className="max-w-[620px] rounded-xl border border-line-strong bg-card p-6 lg:p-7">
        <ProfileForm customer={customer} />
      </div>
    </>
  );
}
