import "server-only";

import { PINCODE_TABLE } from "./pincode-data";

/**
 * What a PIN code says about where an address is.
 *
 * Indian post codes are administered top-down — the first digit is a region,
 * the first three a sorting district — so a valid one determines the state and
 * very nearly determines the town. That is why the delivery form asks for it
 * first: it is one field that fills three, and the three it fills are the ones
 * people get wrong or spell six ways.
 *
 * **`server-only`.** The table is 783KB. Sending it to a browser to save one
 * 200-byte request would be the wrong trade on the page where somebody is
 * about to pay, and it would be paid by every visitor rather than by the ones
 * buying something shipped.
 */
export type Place = {
  pin: string;
  country: "India";
  state: string;
  /** The best single answer for a field labelled "City". */
  city: string;
  /**
   * Everything this PIN code covers, best first — the district, then any
   * others it straddles, then taluks and towns inside it. Offered as
   * suggestions rather than imposed: 1,229 PIN codes cross a district
   * boundary, and a form that silently picks one is a form that is
   * confidently wrong 1,229 times.
   */
  suggestions: string[];
};

/** A well-formed Indian PIN code. No Indian PIN code begins with 0. */
export const PIN_PATTERN = /^[1-9][0-9]{5}$/;

let table: Map<string, Place> | null = null;

/**
 * Parsed once, on the first lookup, and held for the life of the process.
 *
 * Not at module load: this module is imported by a route handler that Next
 * may trace into a build that never serves a request, and 19,097 rows of
 * parsing belongs on the first person who needs it rather than on every cold
 * start.
 */
function load(): Map<string, Place> {
  if (table) return table;

  table = new Map();
  for (const line of PINCODE_TABLE.split("\n")) {
    const [pin, states, districts, places] = line.split("|");
    if (!pin) continue;

    const district = districts.split(";").filter(Boolean);
    const other = places.split(";").filter(Boolean);

    table.set(pin, {
      pin,
      country: "India",
      state: states.split(";")[0] ?? "",
      city: district[0] ?? "",
      // Deduplicated because a taluk sharing its district's name is one place
      // with one name, and offering it twice reads as a broken list.
      suggestions: [...new Set([...district, ...other])],
    });
  }
  return table;
}

/** The place a PIN code names, or null — for a malformed one and an unknown one alike. */
export function lookupPincode(code: string): Place | null {
  const pin = String(code ?? "").replace(/\D/g, "");
  if (!PIN_PATTERN.test(pin)) return null;
  return load().get(pin) ?? null;
}
