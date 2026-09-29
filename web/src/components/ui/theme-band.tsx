import type { ComponentProps } from "react";
import { contact } from "@/content/site";
import { getSiteSettings } from "@/lib/settings";
import { activeTheme } from "@/themes";
import type { CtaBandProps } from "@/themes/contract";

/**
 * The active theme's closing band, with the site's telephone number — what
 * `CtaBand` drew on its own until the default CTA banner existed
 * (2026-09-24). Split out so `CtaBlock` can draw a `band` layout through the
 * theme without importing the dispatcher that imports it.
 */
export async function ThemeBand(props: Omit<CtaBandProps, "phone" | "options">) {
  const [theme, settings] = await Promise.all([activeTheme(), getSiteSettings()]);
  const Band = theme.templates.CtaBand;

  const phone = settings.phone ?? contact.phone;
  // No number on file: no "Call" button, rather than one that dials nothing.
  const secondary = props.secondary === undefined && !phone ? null : props.secondary;

  return <Band {...props} secondary={secondary} phone={phone} options={theme.options} />;
}

export type ThemeBandProps = ComponentProps<typeof ThemeBand>;
