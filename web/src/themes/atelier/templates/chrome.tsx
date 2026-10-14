import { themeChrome } from "@/themes/chrome";
import { AtelierHeader } from "../header";

/** Atelier's chrome: the info bar, the ruled masthead, the page, the `rule` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: AtelierHeader, footer: "rule" });
