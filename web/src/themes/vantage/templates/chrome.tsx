import { themeChrome } from "@/themes/chrome";
import { VantageHeader } from "../header";

/** Vantage's chrome: the info bar, the see-through pill over the page, the page, the `contact` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: VantageHeader, footer: "contact" });
