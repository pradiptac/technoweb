import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getSettings, type SettingsPayload } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { InfoBarForm } from "./info-bar-form";

export const metadata = buildMetadata({ title: "Info bar", path: "/admin/info-bar", seo: noIndex });

/**
 * The info bar is a screen of its own, under Site beside Popups, and not a
 * tab of Settings. It was both for a day — a sidebar row deep-linking into
 * `/admin/settings?tab=announcement` and the same panel in the settings
 * strip — and two doors to one form is one door too many. The rows are still
 * the `announcement` settings group and the save is still
 * `saveSettingsAction`, which PATCHes only the `setting__*` names it finds,
 * so a form carrying nine of them saves nine and touches nothing else.
 */
export default async function AdminInfoBarPage() {
  let settings: SettingsPayload;
  try {
    settings = await getSettings();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Administrators only">
          The info bar is restricted to administrator accounts. Ask one to make
          the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the info bar">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Info bar"
        lede={<>
          A strip above the header on every public page — a promotion, a
          notice, a date window. Changes reach the site immediately.
        </>}
      />

      <InfoBarForm rows={settings.groups.announcement ?? []} />
    </>
  );
}
