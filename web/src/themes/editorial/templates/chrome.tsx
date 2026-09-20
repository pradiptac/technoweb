import { themeChrome } from "@/themes/chrome";
import { Masthead } from "../masthead";

/** Editorial's chrome: the info bar, the dateline strip and the nameplate, the page, the `masthead` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: Masthead, footer: "masthead" });
