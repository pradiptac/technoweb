import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { Paginated } from "@/types/api";

/**
 * Editor-built forms, as the console reads and writes them.
 *
 * The types here are the **admin** shape and deliberately do not lean on the
 * public `FormField`/`SiteForm` in `types/api.ts`: the console sees
 * `notify_email`, every draft, a field's stored `settings` and `show_if` as
 * written, and the option lists the builder draws its pickers from. Two
 * shapes that happen to overlap today are still two shapes.
 */

/**
 * One field kind, as `App\Enums` describes it on `meta.kinds`.
 *
 * The list is the API's and is never written out in TypeScript — the rule
 * `schema_type_options` and `meta.transitions` follow. The three flags are
 * what the builder branches on: whether the kind takes a list of options,
 * whether it is layout rather than a question (a heading, a step break), and
 * whether it is an upload.
 */
export type FormKindOption = {
  value: string;
  label: string;
  blurb?: string | null;
  takes_options?: boolean;
  is_layout?: boolean;
  is_file?: boolean;
  /** Whether another field's condition may read this kind. */
  is_condition_source?: boolean;
};

/**
 * A condition's operator. `takes_value` is false for "is answered" / "is not
 * answered", which compare against nothing; `needs_value` is the same fact
 * under the name an earlier draft of the contract gave it, read as a fallback.
 */
export type FormOpOption = { value: string; label: string; takes_value?: boolean; needs_value?: boolean };

/** A family of files an upload field may accept — images, PDFs, documents — and what each admits. */
export type FormFileAcceptOption = { value: string; label: string; extensions?: string[] };

/**
 * What the builder's pickers are drawn from. Every key is optional: an API
 * that predates the form builder upgrade sends none of them, and the console
 * falls back to the seven kinds it always offered rather than to empty selects.
 */
export type FormMeta = {
  kinds?: FormKindOption[];
  ops?: FormOpOption[];
  file_accepts?: FormFileAcceptOption[];
  /** The most one upload may weigh on this server, whatever a field asks for. */
  max_upload_kb?: number;
  /** How many upload fields one form may hold. */
  max_file_fields?: number;
};

export type FormFieldSettings = {
  /** `number`: a number. `date`: blank, `today`, or a `Y-m-d` date. */
  min?: string | number | null;
  max?: string | number | null;
  /** `hidden`: the value stored with every submission. */
  value?: string | null;
  /** `file`: which families are accepted, from `meta.file_accepts`. */
  accept?: string[] | null;
  /** `file`: the largest upload, in KB. */
  max_kb?: number | null;
};

/** "Show this field only when…". `field` is the **name** of an earlier field. */
export type FormShowIf = { field: string; op: string; value?: string | null };

export type FormFieldOption = { value: string; label: string };

export type AdminFormField = {
  id: number;
  kind: string;
  name: string;
  label: string;
  placeholder: string | null;
  help: string | null;
  required: boolean;
  options: FormFieldOption[] | null;
  width: "half" | "full";
  settings?: FormFieldSettings | null;
  show_if?: FormShowIf | null;
};

export type AdminForm = {
  id: number;
  name: string;
  slug: string;
  status?: string;
  submit_label: string;
  success_message: string | null;
  /** Where the visitor is sent after sending, instead of seeing the message. */
  redirect_url?: string | null;
  notify_email?: string | null;
  embed_enabled?: boolean;
  fields?: AdminFormField[];
  fields_count?: number;
  submissions_count?: number;
};

export type FormFieldPayload = {
  kind: string;
  /** Absent for a heading and a step break: the API names those itself. */
  name?: string;
  label: string;
  placeholder?: string | null;
  help?: string | null;
  required?: boolean;
  width?: "half" | "full";
  options?: FormFieldOption[] | null;
  settings?: FormFieldSettings | null;
  show_if?: FormShowIf | null;
};

export type FormPayload = {
  name: string;
  slug?: string;
  status?: string;
  submit_label?: string;
  success_message?: string | null;
  redirect_url?: string | null;
  notify_email?: string | null;
  embed_enabled?: boolean;
  /** Replaced wholesale, like every other repeater here. */
  fields?: FormFieldPayload[];
};

/** One answer: text, a tick, a rating, or the ticked options of a checkbox group. */
export type FormSubmissionValue = string | number | boolean | string[] | null;

export type AdminFormSubmission = {
  id: number;
  form_slug: string;
  data: Record<string, FormSubmissionValue>;
  /**
   * Uploads, by field name. Never a URL the browser can use — a file is on
   * the private disk, and the console links to its own route handler,
   * `/api/admin/forms/{id}/submissions/{sid}/files/{field}`, which streams it.
   * The API sends a map even when it is empty; the list shape is tolerated
   * because that is how PHP spells an empty map when nobody casts it.
   */
  files?: Record<string, { name: string; size: number; mime?: string | null }> | unknown[] | null;
  ip_address: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getFormList(params: { q?: string; page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<AdminForm> & { meta: Paginated<AdminForm>["meta"] & FormMeta }>(
    `/admin/forms${query(params)}`, { token: await token() });
}

/**
 * The builder's option lists without a form to read them off.
 *
 * `/admin/forms/new` has no record, so it asks the index — the reason
 * `/admin/menus/new` fetches its index for `meta.locations`. One row is asked
 * for because only `meta` is wanted.
 */
export async function getFormMeta(): Promise<FormMeta> {
  const res = await getFormList({ per_page: 1 });
  return pickMeta(res.meta);
}

export async function getFormWithMeta(id: number): Promise<{ form: AdminForm; meta: FormMeta }> {
  const res = await apiFetch<{ data: AdminForm; meta?: FormMeta }>(`/admin/forms/${id}`, { token: await token() });
  return { form: res.data, meta: pickMeta(res.meta) };
}

export async function getForm(id: number): Promise<AdminForm> {
  return (await getFormWithMeta(id)).form;
}

export async function createForm(payload: FormPayload): Promise<AdminForm> {
  const res = await apiFetch<{ data: AdminForm }>("/admin/forms", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateForm(id: number, payload: FormPayload): Promise<AdminForm> {
  const res = await apiFetch<{ data: AdminForm }>(`/admin/forms/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteForm(id: number): Promise<void> {
  await apiFetch<void>(`/admin/forms/${id}`, { method: "DELETE", token: await token() });
}

export async function getFormSubmissions(id: number, params: { page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<AdminFormSubmission>>(
    `/admin/forms/${id}/submissions${query(params)}`, { token: await token() });
}

/** One submission, with the files it carried. There is no way back. */
export async function deleteFormSubmission(formId: number, submissionId: number): Promise<void> {
  await apiFetch<void>(`/admin/forms/${formId}/submissions/${submissionId}`, { method: "DELETE", token: await token() });
}

/** Only the keys this module names, so pagination figures never ride along as "meta". */
function pickMeta(meta: FormMeta | undefined | null): FormMeta {
  return {
    kinds: Array.isArray(meta?.kinds) ? meta.kinds : undefined,
    ops: Array.isArray(meta?.ops) ? meta.ops : undefined,
    file_accepts: Array.isArray(meta?.file_accepts) ? meta.file_accepts : undefined,
    max_upload_kb: typeof meta?.max_upload_kb === "number" ? meta.max_upload_kb : undefined,
    max_file_fields: typeof meta?.max_file_fields === "number" ? meta.max_file_fields : undefined,
  };
}
