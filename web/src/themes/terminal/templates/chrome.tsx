import { themeChrome } from "@/themes/chrome";
import { PromptHeader } from "../header";
import { Ticker } from "../ticker";

/** Terminal's chrome: the info bar, the prompt header, the status ticker under it, the page, the `prompt` footer. See `themes/chrome.tsx`. */
export const Chrome = themeChrome({ Header: PromptHeader, footer: "prompt", between: (settings) => <Ticker settings={settings} /> });
