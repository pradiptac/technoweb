/**
 * Courier booking on the wire (docs/store.md "Shiprocket", API.md).
 */

/** What the order screen is told about the parcel; null while the provider is manual and nothing was ever booked. */
export type OrderShipment = {
  provider: string;
  /** The provider is chosen and the sign-in and a pickup location are saved. */
  active: boolean;
  /** creating | created | failed | cancelled, or null before any attempt. */
  booking: "creating" | "created" | "failed" | "cancelled" | null;
  attempts: number;
  shiprocket_order_id: string | null;
  shipment_id: string | null;
  /** A courier and its AWB have been assigned. */
  has_courier: boolean;
  pickup_requested_at: string | null;
  label_url: string | null;
  /** The manifest PDF (0.159.0), once one was made for this parcel. */
  manifest_url: string | null;
  manifest_at: string | null;
  status_id: number | null;
  /** The courier's own word for where the parcel is. */
  status: string | null;
  status_at: string | null;
  /** returning | returned | cancelled: a parcel that is not going to arrive. */
  problem: "returning" | "returned" | "cancelled" | null;
  /** The last refusal, in Shiprocket's words. */
  error: string | null;
  checked_at: string | null;
  delivered_at: string | null;
  can_book: boolean;
  /** Why not, in words, when nothing is booked and booking is refused. */
  book_refusal: string | null;
  can_assign: boolean;
  can_pickup: boolean;
  can_label: boolean;
  /** An AWB and a requested pickup exist, so a manifest may be made. */
  can_manifest: boolean;
  /** The couriers can be quoted: before booking, or after a booking that lacks a courier. */
  can_rates: boolean;
  can_cancel: boolean;
  can_track: boolean;
  /** The booking form's starting values; present only while booking is possible. */
  defaults: { weight_grams: number; length: number; breadth: number; height: number } | null;
};

/** One courier's quote for a parcel (0.159.0). Money in paise. */
export type CourierQuote = {
  courier_id: number;
  name: string;
  rate_paise: number;
  cod_charges_paise: number;
  etd: string | null;
  days: number | null;
  rating: number | null;
  recommended: boolean;
};

export type CourierQuotes = {
  data: CourierQuote[];
  meta: { weight_grams: number; pickup_pin: string; delivery_pin: string; cod: boolean };
};

/** The courier collecting an approved return from the customer; null while Shiprocket is off and nothing was booked. */
export type ReturnPickup = {
  active: boolean;
  booking: "creating" | "created" | "failed" | "cancelled" | null;
  attempts: number;
  shiprocket_order_id: string | null;
  shipment_id: string | null;
  awb: string | null;
  courier: string | null;
  requested_at: string | null;
  status_id: number | null;
  status: string | null;
  status_at: string | null;
  error: string | null;
  can_book: boolean;
  /** The order is made and only the courier or the pickup request is outstanding. */
  resume: boolean;
  can_rates: boolean;
  can_cancel: boolean;
  book_refusal: string | null;
};

/** What Store → Settings → Shiprocket is told when it opens. */
export type ShiprocketStatus = {
  provider: "manual" | "shiprocket";
  active: boolean;
  missing: string[];
  credentials_saved: boolean;
  email: string | null;
  pickup_location: string | null;
  /** Read from Shiprocket only while the provider is on; empty otherwise. */
  locations: { name: string; address: string; city: string; state: string; pin: string; verified: boolean; contact?: string; phone?: string; email?: string }[];
  parcel: { length: number; breadth: number; height: number };
  /** Where Shiprocket is told to send tracking: paste it in its panel. */
  webhook_url: string;
  /** False when the address contains a word Shiprocket refuses. */
  webhook_url_ok: boolean;
  webhook_token_set: boolean;
  /** Shiprocket's own words for the last refusal, or null. */
  error: string | null;
  booked: number;
  in_trouble: number;
};
