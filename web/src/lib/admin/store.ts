import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { token } from "./_shared";
import type { SettingRow } from "./settings";
import type {
  Paginated, AdminStoreProduct, AdminStoreCategory, AdminOrder, StoreDashboard, StoreReport, StockReport, StockMovement, AdminDigitalCode,
  StoreImportAnalysis, StoreImportResult,
} from "@/types/api";

/**
 * The store's own catalogue, which is a different list from the site's.
 *
 * Every amount here is paise. The form converts by parsing the rupee text —
 * `lib/money.ts` — rather than multiplying, because a float multiply is where
 * a price becomes 1179.9999.
 */
export type StoreProductPayload = Record<string, unknown>;

export type StoreProductIndex = Paginated<AdminStoreProduct> & {
  meta: {
    types: { value: string; label: string; description: string }[];
    statuses: { value: string; label: string }[];
  };
};

export type StoreProductQueryParams = {
  status?: string; type?: string; q?: string; category?: string;
  out_of_stock?: boolean; notices?: boolean; no_weight?: boolean; page?: number; per_page?: number;
};

export async function getStoreProductList(params: StoreProductQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.out_of_stock) query.set("out_of_stock", "1");
  if (params.notices) query.set("notices", "1");
  if (params.no_weight) query.set("no_weight", "1");
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<StoreProductIndex>(`/admin/store/products${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * The catalogue import's dry run. Multipart, so `apiUpload` — a FormData
 * handed to `apiFetch` arrives as `{}` and the API answers "the file field
 * is required", which reads as the upload being refused rather than as
 * never having been sent.
 */
export async function analyseStoreImport(form: FormData): Promise<StoreImportAnalysis> {
  const res = await apiUpload<{ data: StoreImportAnalysis }>(
    "/admin/store/products/import/analyse", form, { token: await token() },
  );
  return res.data;
}

export async function runStoreImport(payload: Record<string, unknown>): Promise<StoreImportResult> {
  const res = await apiFetch<{ data: StoreImportResult }>("/admin/store/products/import", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function getStoreProduct(id: number): Promise<AdminStoreProduct> {
  const res = await apiFetch<{ data: AdminStoreProduct }>(`/admin/store/products/${id}`, { token: await token() });
  return res.data;
}

export async function createStoreProduct(payload: StoreProductPayload): Promise<AdminStoreProduct> {
  const res = await apiFetch<{ data: AdminStoreProduct }>("/admin/store/products", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateStoreProduct(id: number, payload: StoreProductPayload): Promise<AdminStoreProduct> {
  const res = await apiFetch<{ data: AdminStoreProduct }>(`/admin/store/products/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteStoreProduct(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/products/${id}`, { method: "DELETE", token: await token() });
}

/**
 * A discount code.
 *
 * `value` is paise for a fixed amount and a plain percentage otherwise — the
 * one place in the store where a number means two things. `label` comes from
 * the API so the screen never has to decide which.
 */
export type AdminCoupon = {
  id: number;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  label: string;
  minimum_order_paise?: number | null;
  maximum_discount_paise?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  usage_limit?: number | null;
  per_customer_limit?: number | null;
  is_active: boolean;
  description?: string | null;
  usages_count?: number;
  total_given?: string;
  created_at?: string;
};

export async function getCoupons(params: { q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();

  return apiFetch<Paginated<AdminCoupon>>(`/admin/store/coupons${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getCoupon(id: number): Promise<AdminCoupon> {
  const res = await apiFetch<{ data: AdminCoupon }>(`/admin/store/coupons/${id}`, { token: await token() });
  return res.data;
}

export async function createCoupon(payload: Record<string, unknown>): Promise<AdminCoupon> {
  const res = await apiFetch<{ data: AdminCoupon }>("/admin/store/coupons", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateCoupon(id: number, payload: Record<string, unknown>): Promise<AdminCoupon> {
  const res = await apiFetch<{ data: AdminCoupon }>(`/admin/store/coupons/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteCoupon(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/coupons/${id}`, { method: "DELETE", token: await token() });
}

export type OrderIndex = Paginated<AdminOrder> & {
  meta: {
    statuses: { value: string; label: string }[];
    /** Counted over the whole table, not the page. */
    pending_payment: number;
    /** Shiprocket is switched on and set up: the list offers ticks and a bulk manifest (0.159.0). */
    courier_active?: boolean;
  };
};

/**
 * Every figure on the store dashboard, in one request.
 *
 * One call rather than the six the screen would otherwise make: these are all
 * facts about the same moment, and six answers arriving over a second and a
 * half are six facts about six moments that the reader will add up anyway.
 */

/** The one call that can make an order paid, and only for an offline method. */
export async function recordStoreOrderPayment(
  orderNumber: string,
  body: { amount_paise: number; reference: string; note?: string; paid_at?: string },
): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/payments`,
    { method: "POST", body, token: await token() },
  );
  return res.data;
}

/**
 * Money that went back, as a row with a reference. Nothing here moves money —
 * the refund was made in the gateway's dashboard or at the bank — and the
 * order's status follows the sum (`ManualRefund` on the API).
 */
export async function recordStoreOrderRefund(
  orderNumber: string,
  body: { amount_paise: number; reference: string; note?: string },
): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/refunds`,
    { method: "POST", body, token: await token() },
  );
  return res.data;
}

/**
 * The shop front's promo band and the two tiles above it — the eight
 * `store_promo_*` and fourteen `store_tile_*` settings rows,
 * read and written through the Store section's own endpoint rather than
 * `/admin/settings`, so a store manager can edit a promotion without being
 * handed the SMTP password beside it. Same row shape as `getSettings()`, so
 * the screen draws the same controls.
 */
export async function getStorePromo(): Promise<SettingRow[]> {
  const res = await apiFetch<{ data: SettingRow[] }>("/admin/store/promo", { token: await token() });
  return res.data;
}

export async function saveStorePromo(settings: { key: string; value: string }[]): Promise<void> {
  await apiFetch<void>("/admin/store/promo", { method: "PATCH", body: { settings }, token: await token() });
}

/**
 * "Shop the videos" (0.140.0): the eleven `store_videos_*` rows, in the
 * settings screen's own row shape, through `/admin/store/videos` so a store
 * manager can set them without being handed the rest of the table. `meta`
 * is how many shop products carry a video — what the shelf will draw from.
 */
export async function getStoreVideos(): Promise<{ rows: SettingRow[]; productsWithVideo: number }> {
  const res = await apiFetch<{ data: SettingRow[]; meta: { products_with_video: number } }>(
    "/admin/store/videos", { token: await token() },
  );
  return { rows: res.data, productsWithVideo: res.meta.products_with_video };
}

export async function saveStoreVideos(settings: { key: string; value: string }[]): Promise<void> {
  await apiFetch<void>("/admin/store/videos", { method: "PATCH", body: { settings }, token: await token() });
}

/* -------------------------------------------- delivery charges (0.142.0) */

/** One weight slab: up to this many grams costs this much. */
export type ShippingRate = { up_to_grams: number; charge_paise: number };

export type ShippingZone = {
  id: number;
  name: string;
  /** Two-letter state codes. The API holds the list; this only carries them. */
  states: string[];
  delivers: boolean;
  free_above_paise: number | null;
  extra_per_kg_paise: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  rates: ShippingRate[];
};

export type ShippingScreenData = {
  /** What the shop is doing now — `flat` when zones is stored but nothing can be quoted from. */
  mode: "flat" | "zones";
  stored_mode: string;
  flat_paise: number;
  default_weight_grams: number;
  zones_ready: boolean;
  /** Why zones cannot be chosen yet, in a sentence; empty when it can. */
  zones_missing: string;
  zones: ShippingZone[];
  /** Every state and union territory the API knows, by code. */
  states: { value: string; label: string }[];
  products_without_weight: number;
};

/** The shipping screen: mode, flat charge, default weight, the zones and the states they are made of. */
export async function getShipping(): Promise<ShippingScreenData> {
  const res = await apiFetch<{ data: ShippingScreenData }>("/admin/store/shipping", { token: await token() });
  return res.data;
}

export async function saveShippingSettings(
  body: { mode?: string; flat_paise?: number; default_weight_grams?: number },
): Promise<ShippingScreenData> {
  const res = await apiFetch<{ data: ShippingScreenData }>("/admin/store/shipping/settings", {
    method: "PUT", body, token: await token(),
  });
  return res.data;
}

export async function createShippingZone(body: Record<string, unknown>): Promise<ShippingZone> {
  const res = await apiFetch<{ data: ShippingZone }>("/admin/store/shipping/zones", {
    method: "POST", body, token: await token(),
  });
  return res.data;
}

export async function updateShippingZone(id: number, body: Record<string, unknown>): Promise<ShippingZone> {
  const res = await apiFetch<{ data: ShippingZone }>(`/admin/store/shipping/zones/${id}`, {
    method: "PATCH", body, token: await token(),
  });
  return res.data;
}

export async function deleteShippingZone(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/shipping/zones/${id}`, { method: "DELETE", token: await token() });
}

export async function moveShippingZone(id: number, direction: "up" | "down"): Promise<void> {
  await apiFetch<void>(`/admin/store/shipping/zones/${id}/move`, {
    method: "POST", body: { direction }, token: await token(),
  });
}

export async function getStoreDashboard(days?: number): Promise<StoreDashboard> {
  const res = await apiFetch<{ data: StoreDashboard }>(
    `/admin/store/dashboard${days ? `?days=${days}` : ""}`, { token: await token() },
  );
  return res.data;
}

/** What sold between two dates. A 422 here is a range too wide, and says so. */
export async function getStoreReport(
  params: { from?: string; to?: string; group?: string } = {},
): Promise<StoreReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.group) query.set("group", params.group);
  const qs = query.toString();

  const res = await apiFetch<{ data: StoreReport }>(
    `/admin/store/reports${qs ? `?${qs}` : ""}`, { token: await token() },
  );
  return res.data;
}

export type StockQueryParams = {
  from?: string; to?: string; product?: number | string;
  reason?: string; direction?: string; page?: number; per_page?: number;
};

/** The filters, built once, so the report, the ledger and the export agree. */
function stockQuery(params: StockQueryParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

/** What came in and what went out. A 422 here is a range too wide, and says so. */
export async function getStockReport(
  params: StockQueryParams = {},
): Promise<{ data: StockReport; meta: { reasons: { value: string; label: string }[]; max_days: number } }> {
  return apiFetch(`/admin/store/stock${stockQuery(params)}`, { token: await token() });
}

/** The movements behind the totals, paged. */
export async function getStockMovements(
  params: StockQueryParams = {},
): Promise<Paginated<StockMovement>> {
  return apiFetch(`/admin/store/stock/movements${stockQuery(params)}`, { token: await token() });
}

export type OrderQueryParams = {
  status?: string; q?: string; open?: boolean; unpaid?: boolean;
  /** `failed`: orders whose Zoho Books invoice was refused. */
  zoho?: string;
  /** `problem`: parcels the courier is bringing back or cancelled. */
  shipment?: string;
  page?: number; per_page?: number; sort?: string; dir?: string;
};

export async function getStoreOrders(params: OrderQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.open) query.set("open", "1");
  if (params.unpaid) query.set("unpaid", "1");
  if (params.zoho === "failed") query.set("zoho", "failed");
  if (params.shipment === "problem") query.set("shipment", "problem");
  if (params.sort) query.set("sort", params.sort);
  if (params.dir) query.set("dir", params.dir);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<OrderIndex>(`/admin/store/orders${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** Bound by order number, which never changes — unlike a slug. */
export async function getStoreOrder(orderNumber: string): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}`, { token: await token() },
  );
  return res.data;
}

export async function moveStoreOrder(orderNumber: string, status: string, note?: string): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/status`,
    { method: "POST", body: { status, note }, token: await token() },
  );
  return res.data;
}

export async function saveStoreOrderShipping(
  orderNumber: string, payload: Record<string, unknown>,
): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/shipping`,
    { method: "PATCH", body: payload, token: await token() },
  );
  return res.data;
}

export async function addStoreOrderNote(orderNumber: string, body: string): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/notes`,
    { method: "POST", body: { body }, token: await token() },
  );
  return res.data;
}

export async function fulfilStoreOrder(orderNumber: string): Promise<{ assigned: number; short: string[] }> {
  const res = await apiFetch<{ meta: { assigned: number; short: string[] } }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/fulfil`,
    { method: "POST", token: await token() },
  );
  return res.meta;
}

/**
 * The invoice, as multipart.
 *
 * `apiUpload`, never `apiFetch`: the second JSON-encodes its body, so a
 * FormData arrives as `{}` and Laravel answers "the file field is required" —
 * which reads as the upload being rejected rather than as never having been
 * sent. Measured once already on this codebase.
 */
export async function saveStoreOrderInvoice(orderNumber: string, form: FormData): Promise<AdminOrder> {
  const res = await apiUpload<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/invoice`,
    form,
    { token: await token() },
  );
  return res.data;
}

export type CodeIndex = {
  data: AdminDigitalCode[];
  meta: {
    current_page: number; last_page: number; per_page: number; total: number;
    statuses: { value: string; label: string }[];
    available: number;
    delivered: number;
  };
};

export async function getDigitalCodes(productId: number, params: { status?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();

  return apiFetch<CodeIndex>(
    `/admin/store/products/${productId}/codes${qs ? `?${qs}` : ""}`, { token: await token() },
  );
}

export async function addDigitalCodes(productId: number, codes: string): Promise<{ added: number; duplicates: number }> {
  const res = await apiFetch<{ meta: { added: number; duplicates: number } }>(
    `/admin/store/products/${productId}/codes`,
    { method: "POST", body: { codes }, token: await token() },
  );
  return res.meta;
}

/** Reading one is a recorded act, which is why it is a POST. */
export async function revealDigitalCode(id: number): Promise<{ code: string; reveal_count: number }> {
  const res = await apiFetch<{ data: { code: string; reveal_count: number } }>(
    `/admin/store/codes/${id}/reveal`, { method: "POST", token: await token() },
  );
  return res.data;
}

export async function deleteDigitalCode(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/codes/${id}`, { method: "DELETE", token: await token() });
}

export async function getStoreCategories(): Promise<AdminStoreCategory[]> {
  const res = await apiFetch<{ data: AdminStoreCategory[] }>("/admin/store/categories", { token: await token() });
  return res.data;
}

export async function getStoreCategory(id: number): Promise<AdminStoreCategory> {
  const res = await apiFetch<{ data: AdminStoreCategory }>(`/admin/store/categories/${id}`, { token: await token() });
  return res.data;
}

export async function createStoreCategory(payload: Record<string, unknown>): Promise<AdminStoreCategory> {
  const res = await apiFetch<{ data: AdminStoreCategory }>("/admin/store/categories", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateStoreCategory(id: number, payload: Record<string, unknown>): Promise<AdminStoreCategory> {
  const res = await apiFetch<{ data: AdminStoreCategory }>(`/admin/store/categories/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteStoreCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/categories/${id}`, { method: "DELETE", token: await token() });
}
