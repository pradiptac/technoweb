import { themeChrome } from "@/themes/chrome";
import { AuroraHeader } from "../header";

/** Aurora's chrome: the info bar, the soft one-row header, the page, the `wash` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: AuroraHeader, footer: "wash" });
