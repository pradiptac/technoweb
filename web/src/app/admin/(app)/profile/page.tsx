import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { getCurrentStaff } from "@/lib/admin-auth";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PasswordForm } from "./password-form";

export const metadata = buildMetadata({ title: "Your account", path: "/admin/profile", seo: noIndex });

/**
 * Available to every signed-in role, not just administrators.
 *
 * Without it a support engineer had no way to change their own password:
 * /admin/users is role:admin, so they would have had to ask an administrator
 * to do it — who would then know their password.
 */
export default async function AdminProfilePage() {
  const staff = await getCurrentStaff();

  return (
    <>
      <PageHeader
        title="Your account"
        lede={<>
          Signed in as <strong className="text-ink">{staff?.name}</strong> ({staff?.email}).
        </>}
      />

      {staff?.roles?.length ? (
        <p className="mb-8 flex flex-wrap gap-1.5">
          {staff.roles.map((r) => (
            <Badge key={r.slug} tone={r.slug === "admin" ? "brand" : "closed"}>{r.label}</Badge>
          ))}
        </p>
      ) : null}

      <section className="rounded-lg border border-line-strong bg-card p-5">
        <h2 className="mb-1 text-[15px] font-semibold">Change your password</h2>
        <p className="mb-5 max-w-[60ch] text-[13px] text-muted">
          Your name, email and roles are managed by an administrator on the
          Staff screen. Your password is yours alone.
        </p>
        <PasswordForm />
      </section>
    </>
  );
}
