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
  can_cancel: boolean;
  can_track: boolean;
  /** The booking form's starting values; present only while booking is possible. */
  defaults: { weight_grams: number; length: number; breadth: number; height: number } | null;
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
  locations: { name: string; address: string; city: string; state: string; pin: string; verified: boolean }[];
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
