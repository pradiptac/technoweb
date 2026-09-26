import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProfileForm } from "./profile-form";
import { MessagingPreferences } from "./messaging-preferences";
import { getMessagingPreferences } from "@/lib/portal";

export const metadata = buildMetadata({ title: "My profile", path: "/portal/profile", seo: noIndex });

export default async function ProfilePage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/portal/login");

  // The messaging card is extra: a failed read leaves the profile working.
  const preferences = await getMessagingPreferences().catch(() => null);

  return (
    <>
      <div className="mb-6">
        <h2 className="display-3">My profile</h2>
        <p className="mt-1.5 text-14-5 text-muted">
          Keep your contact details current — this is where we call when something needs
          confirming on site.
        </p>
      </div>

      <div className="max-w-[620px] rounded-xl border border-line-strong bg-card p-6 lg:p-7">
        <ProfileForm customer={customer} />
      </div>

      {preferences && preferences.channels.some((c) => (c.channel === "push" ? (c.devices ?? 0) > 0 : c.live || c.opted_in)) && (
        <div className="mt-6 max-w-[620px] rounded-xl border border-line-strong bg-card p-6 lg:p-7">
          <MessagingPreferences preferences={preferences} />
        </div>
      )}
    </>
  );
}
