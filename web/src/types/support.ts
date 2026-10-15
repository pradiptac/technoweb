/** The support network (0.170.0, docs/support-network.md). */

export type SupportCentreKind = "service_centre" | "office" | "partner";

/** A centre as the website shows it: staff by name and title only. */
export type SupportCentre = {
  name: string;
  slug: string;
  kind: SupportCentreKind;
  kind_label: string;
  country_code: string;
  country: string;
  region: string | null;
  city: string;
  address: string | null;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  hours: string | null;
  latitude: number | null;
  longitude: number | null;
  staff: { name: string; title: string | null }[];
  updated_at: string | null;
};

export type SupportNetworkResponse = {
  data: SupportCentre[];
  meta: { schema: Record<string, unknown> | null };
};

/** The console's shape. */
export type AdminSupportCentre = Omit<SupportCentre, "staff"> & {
  id: number;
  location_id: number | null;
  sort_order: number;
  is_active: boolean;
  staff_count?: number;
  staff?: { user_id: number; name: string; email: string; is_active: boolean; title: string | null; is_public: boolean }[];
};

export type SupportCentreMeta = {
  kinds: { value: SupportCentreKind; label: string; blurb: string }[];
  countries: { value: string; label: string }[];
};
