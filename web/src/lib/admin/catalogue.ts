import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  AdminBrand, AdminIndustry, AdminProductCategory, AdminProduct, AdminService, AdminSolution, FaqItem, Paginated, PublishStatus, SeoOverride,
} from "@/types/api";

/**
 * Doubles as the picker source for case studies and solutions. One endpoint
 * per resource — a separate lightweight picker route was duplicate surface
 * for a list that is six rows long.
 */
export async function getIndustries(): Promise<AdminIndustry[]> {
  const res = await apiFetch<Paginated<AdminIndustry>>("/admin/industries?per_page=100", { token: await token() });
  return res.data;
}

export type SolutionQueryParams = {
  status?: PublishStatus;
  q?: string;
  page?: number;
  per_page?: number;
};

export type SolutionPayload = Partial<{
  title: string;
  slug: string | null;
  summary: string | null;
  problem_statement: string | null;
  overview: string | null;
  benefits: string[];
  technologies: string[];
  icon: string | null;
  hero_image_path: string | null;
  status: PublishStatus;
  sort_order: number | null;
  product_ids: number[];
  industry_ids: number[];
  faqs: FaqItem[];
  seo: Partial<SeoOverride>;
  show_in_menu: boolean;
}>;

export async function getSolutions(params: SolutionQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminSolution>>(`/admin/solutions${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getSolution(id: number): Promise<AdminSolution> {
  const res = await apiFetch<{ data: AdminSolution }>(`/admin/solutions/${id}`, { token: await token() });
  return res.data;
}

/** Solution options for the industry form's picker. */
export async function getSolutionOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminSolution>>("/admin/solutions?per_page=100", { token: await token() });
  return res.data.map((s) => ({ id: s.id, name: s.title }));
}

/**
 * Product options for the solution form.
 *
 * /admin/products is the CRUD index and the picker both, so this asks for a
 * page big enough to be a picker rather than taking the default 30 — the
 * catalogue is small, and a silently truncated list would just look like
 * missing products.
 */
export async function getProductOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminProduct>>("/admin/products?per_page=100", { token: await token() });
  return res.data.map((p) => ({ id: p.id, name: p.name }));
}

export async function createSolution(payload: SolutionPayload): Promise<AdminSolution> {
  const res = await apiFetch<{ data: AdminSolution }>("/admin/solutions", {
    method: "POST",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function updateSolution(id: number, payload: SolutionPayload): Promise<AdminSolution> {
  const res = await apiFetch<{ data: AdminSolution }>(`/admin/solutions/${id}`, {
    method: "PATCH",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function deleteSolution(id: number): Promise<void> {
  await apiFetch<void>(`/admin/solutions/${id}`, { method: "DELETE", token: await token() });
}

export type ServicePayload = Partial<{
  title: string; slug: string | null; summary: string | null; body: string | null;
  icon: string | null; status: PublishStatus; sort_order: number | null;
  faqs: FaqItem[]; seo: Partial<SeoOverride>;
  show_in_menu: boolean;
}>;

export async function getServices(params: { status?: PublishStatus; q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminService>>(`/admin/services${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getService(id: number): Promise<AdminService> {
  const res = await apiFetch<{ data: AdminService }>(`/admin/services/${id}`, { token: await token() });
  return res.data;
}

export async function createService(payload: ServicePayload): Promise<AdminService> {
  const res = await apiFetch<{ data: AdminService }>("/admin/services", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateService(id: number, payload: ServicePayload): Promise<AdminService> {
  const res = await apiFetch<{ data: AdminService }>(`/admin/services/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteService(id: number): Promise<void> {
  await apiFetch<void>(`/admin/services/${id}`, { method: "DELETE", token: await token() });
}

export type IndustryPayload = Partial<{
  name: string; slug: string | null; summary: string | null; body: string | null;
  icon: string | null; sort_order: number | null;
  solution_ids: number[]; seo: Partial<SeoOverride>;
  show_in_menu: boolean;
}>;

export async function getIndustryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminIndustry>>(`/admin/industries${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getIndustry(id: number): Promise<AdminIndustry> {
  const res = await apiFetch<{ data: AdminIndustry }>(`/admin/industries/${id}`, { token: await token() });
  return res.data;
}

export async function createIndustry(payload: IndustryPayload): Promise<AdminIndustry> {
  const res = await apiFetch<{ data: AdminIndustry }>("/admin/industries", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateIndustry(id: number, payload: IndustryPayload): Promise<AdminIndustry> {
  const res = await apiFetch<{ data: AdminIndustry }>(`/admin/industries/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteIndustry(id: number): Promise<void> {
  await apiFetch<void>(`/admin/industries/${id}`, { method: "DELETE", token: await token() });
}

export type ProductQueryParams = {
  status?: PublishStatus; q?: string; page?: number; per_page?: number;
  brand?: number; category?: number; sort?: string; dir?: string;
};

export type ProductPayload = Partial<{
  name: string; slug: string | null; sku: string | null;
  brand_id: number | null; product_category_id: number | null;
  short_description: string | null; description: string | null;
  datasheet_path: string | null; status: PublishStatus;
  is_featured: boolean; sort_order: number | null;
  specifications: Record<string, string>;
  features: string[]; images: string[];
  solution_ids: number[]; related_product_ids: number[];
  faqs: FaqItem[]; seo: Partial<SeoOverride>;
}>;

export async function getProductList(params: ProductQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  if (params.brand) query.set("brand", String(params.brand));
  if (params.category) query.set("category", String(params.category));
  if (params.sort) query.set("sort", params.sort);
  if (params.dir) query.set("dir", params.dir);
  const qs = query.toString();
  return apiFetch<Paginated<AdminProduct>>(`/admin/products${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getProduct(id: number): Promise<AdminProduct> {
  const res = await apiFetch<{ data: AdminProduct }>(`/admin/products/${id}`, { token: await token() });
  return res.data;
}

export async function createProduct(payload: ProductPayload): Promise<AdminProduct> {
  const res = await apiFetch<{ data: AdminProduct }>("/admin/products", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<AdminProduct> {
  const res = await apiFetch<{ data: AdminProduct }>(`/admin/products/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteProduct(id: number): Promise<void> {
  await apiFetch<void>(`/admin/products/${id}`, { method: "DELETE", token: await token() });
}

export type BrandPayload = Partial<{
  name: string; slug: string | null; description: string | null;
  logo_path: string | null; sort_order: number | null; is_featured: boolean;
  partner_tier: string | null;
}>;

export async function getBrandList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminBrand>>(`/admin/brands${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** Every brand, for the product form’s select. */
export async function getBrandOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminBrand>>("/admin/brands?per_page=100", { token: await token() });
  return res.data.map((b) => ({ id: b.id, name: b.name }));
}

export async function getBrand(id: number): Promise<AdminBrand> {
  const res = await apiFetch<{ data: AdminBrand }>(`/admin/brands/${id}`, { token: await token() });
  return res.data;
}

export async function createBrand(payload: BrandPayload): Promise<AdminBrand> {
  const res = await apiFetch<{ data: AdminBrand }>("/admin/brands", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateBrand(id: number, payload: BrandPayload): Promise<AdminBrand> {
  const res = await apiFetch<{ data: AdminBrand }>(`/admin/brands/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteBrand(id: number): Promise<void> {
  await apiFetch<void>(`/admin/brands/${id}`, { method: "DELETE", token: await token() });
}

export type ProductCategoryPayload = Partial<{
  name: string; slug: string | null; description: string | null; icon: string | null;
  image_path: string | null;
  parent_id: number | null; sort_order: number | null; seo: Partial<SeoOverride>;
  show_in_menu: boolean;
}>;

export async function getProductCategoryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminProductCategory>>(`/admin/product-categories${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * Every category, for the parent select and the product form.
 *
 * The index doubles as the picker — one endpoint per resource, as with
 * industries.
 */
export async function getProductCategoryOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminProductCategory>>("/admin/product-categories?per_page=100", { token: await token() });
  return res.data.map((c) => ({ id: c.id, name: c.parent_name ? `${c.parent_name} → ${c.name}` : c.name }));
}

export async function getProductCategory(id: number): Promise<AdminProductCategory> {
  const res = await apiFetch<{ data: AdminProductCategory }>(`/admin/product-categories/${id}`, { token: await token() });
  return res.data;
}

export async function createProductCategory(payload: ProductCategoryPayload): Promise<AdminProductCategory> {
  const res = await apiFetch<{ data: AdminProductCategory }>("/admin/product-categories", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateProductCategory(id: number, payload: ProductCategoryPayload): Promise<AdminProductCategory> {
  const res = await apiFetch<{ data: AdminProductCategory }>(`/admin/product-categories/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteProductCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/product-categories/${id}`, { method: "DELETE", token: await token() });
}
