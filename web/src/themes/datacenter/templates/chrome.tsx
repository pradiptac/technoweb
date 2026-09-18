import { themeChrome } from "@/themes/chrome";
import { ConsoleHeader } from "../header";

/** Datacenter's chrome: the info bar, the status strip and the console bar, the page, the `console` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: ConsoleHeader, footer: "console" });
