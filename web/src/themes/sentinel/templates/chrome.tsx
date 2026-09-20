import { themeChrome } from "@/themes/chrome";
import { SentinelHeader } from "../header";

/** Sentinel's chrome: the info bar, the dark glass header with its seam, the page, the `glow` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: SentinelHeader, footer: "glow" });
