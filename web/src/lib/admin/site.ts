import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  Paginated, Gallery, Slider, AdminPopup, SiteForm, FormSubmission, Menu, MenuLocationOption, MenuSectionOption, MenuTypeOption, MenuTarget,
} from "@/types/api";

export type SlidePayload = {
  kind: "image" | "video" | "youtube";
  media_path?: string | null;
  poster_path?: string | null;
  youtube_url?: string | null;
  alt_text?: string | null;
  heading?: string | null;
  caption?: string | null;
  link_url?: string | null;
  link_label?: string | null;
  caption_position?: string | null;
};

/**
 * One transition, as the API describes it.
 *
 * The list is `App\Enums\SliderTransition`'s and travels on `meta`, never
 * written out here — the rule `GalleryTransitionOption` and `meta.locations`
 * follow. The blurb comes with it so the console never writes a sentence of
 * its own about a value it does not own.
 */
export type SliderTransitionOption = { value: string; label: string; blurb: string };

/** No blurb — nine anchors explained one by one would be noise on the row. */
export type SlideCaptionPositionOption = { value: string; label: string };

export type SliderMeta = {
  transitions?: SliderTransitionOption[];
  caption_animations?: SliderTransitionOption[];
  layouts?: SliderTransitionOption[];
  caption_positions?: SlideCaptionPositionOption[];
};

export type SliderPayload = {
  name: string;
  slug?: string;
  status?: string;
  layout?: string;
  transition?: string;
  caption_animation?: string;
  autoplay?: boolean;
  interval_ms?: number;
  /** Replaced wholesale — send the complete set, like faqs. */
  slides?: SlidePayload[];
};

export async function getSliderList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<Slider> & { meta: SliderMeta }>(
    `/admin/sliders${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getSlider(id: number): Promise<{ data: Slider; meta: SliderMeta }> {
  return apiFetch<{ data: Slider; meta: SliderMeta }>(`/admin/sliders/${id}`, { token: await token() });
}

export async function createSlider(payload: SliderPayload): Promise<Slider> {
  const res = await apiFetch<{ data: Slider }>("/admin/sliders", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateSlider(id: number, payload: SliderPayload): Promise<Slider> {
  const res = await apiFetch<{ data: Slider }>(`/admin/sliders/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteSlider(id: number): Promise<void> {
  await apiFetch<void>(`/admin/sliders/${id}`, { method: "DELETE", token: await token() });
}

/**
 * What the console posts. `sections` and `paths` are replaced wholesale, the
 * rule every repeating field here follows — omitting a key leaves it alone and
 * sending `[]` clears it, which has to be possible or the last target could
 * never be removed.
 */
export type PopupPayload = {
  name?: string;
  status?: string;
  image_path?: string;
  body?: string;
  link_url?: string | null;
  link_new_tab?: boolean;
  sections?: string[];
  paths?: string[];
  size?: string;
  frequency?: string;
  delay_ms?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  sort_order?: number;
};

/**
 * The three lists the form draws its controls from, sent by the API.
 *
 * Never retyped here: `SiteSection`, `PopupSize` and `PopupFrequency` own them,
 * and a second hand-written copy on this side of the wire is the drift
 * `admin_path` and `schema_type_options` were both caught by.
 */
export type PopupMeta = {
  sections: { value: string; label: string; path: string }[];
  sizes: { value: string; label: string; blurb: string; width: number }[];
  frequencies: { value: string; label: string; blurb: string }[];
};

export async function getPopupList(params: { q?: string; status?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<Paginated<AdminPopup> & { meta: PopupMeta }>(
    `/admin/popups${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

export async function getPopup(id: number): Promise<{ data: AdminPopup; meta: PopupMeta }> {
  return apiFetch<{ data: AdminPopup; meta: PopupMeta }>(`/admin/popups/${id}`, { token: await token() });
}

export async function createPopup(payload: PopupPayload): Promise<AdminPopup> {
  const res = await apiFetch<{ data: AdminPopup }>("/admin/popups", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updatePopup(id: number, payload: PopupPayload): Promise<AdminPopup> {
  const res = await apiFetch<{ data: AdminPopup }>(`/admin/popups/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deletePopup(id: number): Promise<void> {
  await apiFetch<void>(`/admin/popups/${id}`, { method: "DELETE", token: await token() });
}

/** One tab. `slug` is what an item names it by — see `GalleryItemPayload`. */
export type GalleryGroupPayload = {
  name: string;
  /** Derived from the name server-side when it is left out. */
  slug?: string;
};

export type GalleryItemPayload = {
  media_path: string;
  alt_text?: string | null;
  title?: string | null;
  subtitle?: string | null;
  link_url?: string | null;
  /**
   * The tab, by **slug** rather than id.
   *
   * The console creates a tab and the pictures filed under it in one submit,
   * so at the moment an item has to reference its group there is no id to
   * reference. The API refuses a slug naming a tab that is not in the same
   * payload, rather than quietly ungrouping the picture.
   */
  group?: string | null;
};

/**
 * One transition, as the API describes it.
 *
 * The list is `App\Enums\GalleryTransition`'s and travels on `meta`, never
 * written out here — the rule `schema_type_options` and `meta.locations`
 * follow. The blurb comes with it so the console never writes a sentence of
 * its own about a value it does not own.
 */
export type GalleryTransitionOption = { value: string; label: string; blurb: string };

export type GalleryMeta = { transitions?: GalleryTransitionOption[] };

export type GalleryPayload = {
  name: string;
  slug?: string;
  subtitle?: string | null;
  status?: string;
  transition?: string;
  autoplay?: boolean;
  interval_ms?: number;
  /** Both replaced wholesale — send the complete set, like faqs and slides. */
  groups?: GalleryGroupPayload[];
  items?: GalleryItemPayload[];
};

export async function getGalleryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<Gallery> & { meta: GalleryMeta }>(
    `/admin/galleries${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getGallery(id: number): Promise<{ data: Gallery; meta: GalleryMeta }> {
  return apiFetch<{ data: Gallery; meta: GalleryMeta }>(
    `/admin/galleries/${id}`, { token: await token() });
}

export async function createGallery(payload: GalleryPayload): Promise<Gallery> {
  const res = await apiFetch<{ data: Gallery }>("/admin/galleries", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateGallery(id: number, payload: GalleryPayload): Promise<Gallery> {
  const res = await apiFetch<{ data: Gallery }>(`/admin/galleries/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteGallery(id: number): Promise<void> {
  await apiFetch<void>(`/admin/galleries/${id}`, { method: "DELETE", token: await token() });
}

export type FormFieldPayload = {
  kind: "text" | "email" | "tel" | "number" | "textarea" | "select" | "checkbox";
  name: string;
  label: string;
  placeholder?: string | null;
  help?: string | null;
  required?: boolean;
  width?: "half" | "full";
  options?: { value: string; label: string }[] | null;
};

export type FormPayload = {
  name: string;
  slug?: string;
  status?: string;
  submit_label?: string;
  success_message?: string | null;
  notify_email?: string | null;
  embed_enabled?: boolean;
  /** Replaced wholesale, like every other repeater here. */
  fields?: FormFieldPayload[];
};

export async function getFormList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<SiteForm>>(`/admin/forms${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getForm(id: number): Promise<SiteForm> {
  const res = await apiFetch<{ data: SiteForm }>(`/admin/forms/${id}`, { token: await token() });
  return res.data;
}

export async function createForm(payload: FormPayload): Promise<SiteForm> {
  const res = await apiFetch<{ data: SiteForm }>("/admin/forms", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateForm(id: number, payload: FormPayload): Promise<SiteForm> {
  const res = await apiFetch<{ data: SiteForm }>(`/admin/forms/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteForm(id: number): Promise<void> {
  await apiFetch<void>(`/admin/forms/${id}`, { method: "DELETE", token: await token() });
}

export async function getFormSubmissions(id: number, params: { page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<FormSubmission>>(`/admin/forms/${id}/submissions${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * The whole tree, in one request each way.
 *
 * The console edits a tree and saves a tree — `items` is nested, and the API
 * reads `parent_id` and `sort_order` off the shape rather than trusting them
 * in the payload. That is also what makes a cycle unrepresentable: a nested
 * array cannot contain one.
 */
export type MenuItemPayload = {
  label: string;
  type: string;
  target_id?: number | null;
  url?: string | null;
  icon?: string | null;
  description?: string | null;
  open_in_new_tab?: boolean;
  is_active?: boolean;
  children?: MenuItemPayload[];
};

export type MenuPayload = {
  name?: string;
  location?: string | null;
  items?: MenuItemPayload[];
};

export type { MenuTarget };

export type MenuIndex = {
  data: Menu[];
  meta: {
    locations: MenuLocationOption[];
    types: MenuTypeOption[];
    sections: MenuSectionOption[];
    max_depth: number;
  };
};

export async function getMenus(): Promise<MenuIndex> {
  return apiFetch<MenuIndex>("/admin/menus", { token: await token() });
}

export async function getMenu(id: number): Promise<Menu> {
  const res = await apiFetch<{ data: Menu }>(`/admin/menus/${id}`, { token: await token() });
  return res.data;
}

export async function createMenu(payload: MenuPayload): Promise<Menu> {
  const res = await apiFetch<{ data: Menu }>("/admin/menus", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateMenu(id: number, payload: MenuPayload): Promise<Menu> {
  const res = await apiFetch<{ data: Menu }>(`/admin/menus/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteMenu(id: number): Promise<void> {
  await apiFetch<void>(`/admin/menus/${id}`, { method: "DELETE", token: await token() });
}

/** Records an item can point at. Searched and capped by the API — a select
 *  holding every product is one nobody can find anything in. */
export async function getMenuTargets(type: string, q?: string): Promise<MenuTarget[]> {
  const params = new URLSearchParams({ type });
  if (q) params.set("q", q);
  const res = await apiFetch<{ data: MenuTarget[] }>(`/admin/menu-targets?${params}`, { token: await token() });
  return res.data;
}

/**
 * Rebuild a location's menu from the catalogue.
 *
 * Destructive: it discards whatever is arranged for that location. The menu row
 * itself is kept, so the location stays assigned and `/admin/menus/{id}` still
 * resolves — see the controller for why that matters.
 */
export async function rebuildMenu(location: string): Promise<{ id: number; items: number; warnings: string[] }> {
  const res = await apiFetch<{ data: { id: number; items: number; warnings: string[] } }>(
    `/admin/menus/rebuild/${location}`,
    { method: "POST", token: await token() },
  );

  return res.data;
}
