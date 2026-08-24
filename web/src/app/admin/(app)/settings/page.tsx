import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getSettings, type SettingGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SettingsForm } from "./settings-form";

export const metadata = buildMetadata({ title: "Settings", path: "/admin/settings", seo: noIndex });

export default async function AdminSettingsPage() {
  let groups: SettingGroups;
  try {
    groups = await getSettings();
  } catch (error) {
    // Settings are administrator-only, so a content manager landing here gets
    // told why rather than a generic failure.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Administrators only">
          Site settings are restricted to administrator accounts. Ask one to make
          the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the settings">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        lede={<>
          Site-wide values used across the public site. Changes take effect
          immediately.
        </>}
      />

      <SettingsForm groups={groups} />
    </>
  );
}
