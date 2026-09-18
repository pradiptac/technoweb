import { themeChrome } from "@/themes/chrome";
import { KeystoneHeader } from "../header";

/** Keystone's chrome: the info bar, the pill-group header, the page, the `plate` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: KeystoneHeader, footer: "plate" });
