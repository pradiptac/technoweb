import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { token } from "./_shared";
import type {
  Paginated, AdminStoreProduct, AdminStoreCategory, AdminOrder, StoreDashboard, StoreReport, StockReport, StockMovement, AdminDigitalCode,
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
  out_of_stock?: boolean; page?: number; per_page?: number;
};

export async function getStoreProductList(params: StoreProductQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.out_of_stock) query.set("out_of_stock", "1");
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<StoreProductIndex>(`/admin/store/products${qs ? `?${qs}` : ""}`, { token: await token() });
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
  page?: number; per_page?: number;
};

export async function getStoreOrders(params: OrderQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.open) query.set("open", "1");
  if (params.unpaid) query.set("unpaid", "1");
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
