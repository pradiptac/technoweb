import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getInboundMailStatus, getMailStatus, getSettings, type SettingsPayload } from "@/lib/admin";
import type { InboundMailStatus, MailStatus } from "@/types/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { screenAt } from "./settings-copy";
import { SettingsForm } from "./settings-form";

/**
 * One settings screen, whichever section it sits in.
 *
 * Ten pages render this — System → Settings and the "Settings" row at the
 * end of every module's sidebar section — and each is two lines: the
 * metadata for its path and this component with the same path. What differs
 * between them is entirely in `SCREENS`: the title, the lede, which groups
 * are drawn, and which status reads a panel needs. The 403 copy, the fetch
 * and the form are here once, because ten copies of a page that catches a
 * 403 would be ten places to get the sentence wrong.
 *
 * The reads are administrator-only and one screen draws them, so they go
 * together rather than in a chain that spends three round trips on one page.
 */
export function settingsMetadata(path: string) {
  const screen = screenAt(path);
  return buildMetadata({ title: screen.title, path, seo: noIndex });
}

export async function SettingsScreen({ path }: { path: string }) {
  const screen = screenAt(path);

  let settings: SettingsPayload;
  let mail: MailStatus | undefined;
  let inbound: InboundMailStatus | undefined;
  try {
    [settings, mail, inbound] = await Promise.all([
      getSettings(),
      screen.needs?.includes("mail") ? getMailStatus() : undefined,
      screen.needs?.includes("inbound") ? getInboundMailStatus() : undefined,
    ]);
  } catch (error) {
    // Settings are administrator-only, so a content manager landing here gets
    // told why rather than a generic failure.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Administrators only">
          {screen.title} is restricted to administrator accounts. Ask one to make
          the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title={`We could not load ${screen.title.toLowerCase()}`}>
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader title={screen.title} lede={screen.lede} />

      <SettingsForm
        screen={screen}
        groups={settings.groups}
        uploads={settings.uploads}
        payments={settings.payments}
        mail={mail}
        inbound={inbound}
      />
    </>
  );
}
