import { themeChrome } from "@/themes/chrome";
import { PillHeader } from "../header";

/** Launch's chrome: the info bar, the floating pill header, the page, the `card` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: PillHeader, footer: "card" });
