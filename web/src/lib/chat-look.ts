import { announcementBand } from "./palette.ts";
import { settingEnabled, type SiteSettings } from "./site-settings.ts";
import type { ChatLook } from "../components/chat/chat-widget";

const ICONS = new Set(["chat", "bot", "headset", "spark", "question"]);
const SIZES = new Set(["small", "medium", "large"]);
const ANIMATIONS = new Set(["burst", "pulse", "bounce", "swing", "breathe", "float", "shake", "spin", "flip", "wave", "none"]);
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The assistant's appearance, from the public `chatbot_*` settings.
 *
 * Pure, so the layout can call it beside the other settings reads. The ink
 * on a chosen colour is derived here rather than in the browser —
 * `announcementBand()` pushes near-white or near-black until it clears
 * 4.5:1 on the colour, moving the colour itself only when neither can —
 * so the launcher and the visitor's own bubbles are graded on arithmetic
 * whatever an editor picks, the info bar's rule. Blank is the palette's
 * brand: no accent is passed, and the CSS defaults in `globals.css` stand.
 * `background` is the thread's ground behind the bubbles (2026-09-17),
 * with its own derived ink for the little that paints directly on it;
 * blank is `brand-50`, the ground the panel has had since the client
 * first asked for a tinted one.
 * An icon or a size the widget does not know falls back rather than
 * failing, the motion group's rule; the API refuses them on write anyway.
 */
export function chatLookFor(settings: SiteSettings): ChatLook {
  const colour = settings.chatbot_colour?.trim().toLowerCase();
  const band = colour && HEX.test(colour) ? announcementBand([colour]) : null;
  const ground = settings.chatbot_background?.trim().toLowerCase();
  const groundBand = ground && HEX.test(ground) ? announcementBand([ground]) : null;
  const icon = settings.chatbot_icon?.trim() ?? "";
  const size = settings.chatbot_font_size?.trim() ?? "";
  const animation = settings.chatbot_animation?.trim() ?? "";
  const company = settings.company_name?.trim();

  return {
    name: settings.chatbot_name?.trim() || (company ? `${company} assistant` : "Website assistant"),
    showName: settingEnabled(settings, "chatbot_show_name", true),
    icon: (ICONS.has(icon) ? icon : "chat") as ChatLook["icon"],
    fontSize: (SIZES.has(size) ? size : "medium") as ChatLook["fontSize"],
    animation: (ANIMATIONS.has(animation) ? animation : "burst") as ChatLook["animation"],
    accent: band ? { bg: band.stops[0]!, ink: band.ink } : null,
    background: groundBand ? { bg: groundBand.stops[0]!, ink: groundBand.ink } : null,
  };
}
