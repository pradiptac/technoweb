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
 * Two states made after the vendored directory was cut, filed back where they
 * used to be: Telangana (2014) under Andhra Pradesh, Ladakh (2019) under
 * Jammu & Kashmir. Since 0.142.0 the state decides what delivery costs and
 * whether it is delivered at all, so a Hyderabad address quoted as Andhra
 * Pradesh was a wrong zone, not a wrong label.
 *
 * Both are postal prefixes: Telangana is 500–509 (Andhra Pradesh's own run
 * from 510), and Ladakh is 194 (Leh and Kargil; Jammu & Kashmir's other PINs
 * are 180–193 and 195). Applied only where the table names the old state, so
 * a corrected table is left alone.
 */
function stateFor(pin: string, state: string): string {
  if (state === "Andhra Pradesh" && /^50[0-9]/.test(pin)) return "Telangana";
  if (state === "Jammu & Kashmir" && pin.startsWith("194")) return "Ladakh";
  return CURRENT_NAMES[state] ?? state;
}

/**
 * The directory's spellings of six states, as the shop's own state list (the
 * API's `IndianStates`) writes them. A shipping zone is found by state, and
 * the checkout's state field is a list of those names in zones mode, so a PIN
 * code that filled "Pondicherry" would find no option to select. All of them
 * resolved to the same code before; they now also spell the same.
 */
const CURRENT_NAMES: Record<string, string> = {
  "Andaman & Nicobar Islands": "Andaman and Nicobar Islands",
  Chattisgarh: "Chhattisgarh",
  "Dadra & Nagar Haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "Daman & Diu": "Dadra and Nagar Haveli and Daman and Diu",
  "Jammu & Kashmir": "Jammu and Kashmir",
  Pondicherry: "Puducherry",
};

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
      state: stateFor(pin, states.split(";")[0] ?? ""),
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
