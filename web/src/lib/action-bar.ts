import { settingEnabled, telHref, type SiteSettings } from "@/lib/site-settings";

/**
 * The phone's action bar (0.122.0, docs/site-chrome.md): which buttons it
 * draws, from the public settings.
 *
 * Each button appears only when it has what it needs — a Call button with no
 * number to ring, or a WhatsApp button that opens a search for nobody, is a
 * dead control on the one screen with no room for one. So the list can be
 * empty with the bar switched on, and then nothing is drawn at all.
 */
export type ActionButton = {
  kind: "call" | "whatsapp" | "enquire";
  label: string;
  href: string;
  /** Leaves the site: opened in a new tab. */
  external: boolean;
};

/** The shape the API holds the enquiry link to (`App\Support\LinkPattern`). */
const LINK = /^(\/(?![/\\])\S*|https?:\/\/\S+|mailto:\S+|tel:\S+)$/i;

export function actionBarFor(settings: SiteSettings): ActionButton[] {
  if (!settingEnabled(settings, "action_bar_enabled", false)) return [];

  const buttons: ActionButton[] = [];

  const phone = settings.phone?.trim();
  if (phone && settingEnabled(settings, "action_bar_call", true)) {
    buttons.push({ kind: "call", label: "Call", href: telHref(phone), external: false });
  }

  // `wa.me` takes digits and nothing else; a `+` or a space opens WhatsApp on
  // a search for a contact nobody has (the assistant's rule).
  const whatsapp = (settings.action_bar_whatsapp_number || settings.chatbot_whatsapp_number || "").replace(/\D+/g, "");
  if (whatsapp.length >= 8) {
    buttons.push({ kind: "whatsapp", label: "WhatsApp", href: `https://wa.me/${whatsapp}`, external: true });
  }

  const href = settings.action_bar_enquire_href?.trim();
  if (href && LINK.test(href)) {
    buttons.push({
      kind: "enquire",
      label: settings.action_bar_enquire_label?.trim() || "Enquire",
      href,
      external: /^https?:/i.test(href),
    });
  }

  return buttons;
}
