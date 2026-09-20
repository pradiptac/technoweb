import { themeChrome } from "@/themes/chrome";
import { SummitHeader } from "../header";

/** Summit's chrome: the info bar, the dark product-company bar, the page, the `statement` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: SummitHeader, footer: "statement" });
