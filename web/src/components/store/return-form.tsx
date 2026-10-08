"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { Form } from "@/components/ui/form";
import { Alert, Field, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { useUploadForm } from "@/lib/hooks/use-upload-form";
import type { Order } from "@/types/api";
import type { ReturnPolicy } from "@/types/returns";

export type ReturnFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: string };

const initial: ReturnFormState = {};

/** The first message under any key beginning `prefix` — the API keys a line's refusal `items.0.quantity`. */
function firstUnder(errors: Record<string, string[]> | undefined, prefix: string): string | undefined {
  const key = Object.keys(errors ?? {}).find((k) => k === prefix || k.startsWith(`${prefix}.`));
  return key ? errors?.[key]?.[0] : undefined;
}

/**
 * "Return items", on a delivered order (docs/store.md "Returns").
 *
 * One form for the two doors a customer has — the order link and the portal
 * — which differ only in the Server Action and the upload address they are
 * handed. It posts through the action until a photograph is attached; then
 * `useUploadForm` sends the multipart body itself, so a phone photograph
 * going up shows a percentage.
 *
 * The lines offered and how many of each are the API's (`return_policy`):
 * nothing here works out what may come back. A line's quantity is a select
 * from 0, because "none of this one" is an answer; with a single line of one
 * unit there is nothing to choose and it starts on 1.
 */
export function ReturnForm({
  order, policy, action, uploadUrl, loginPath,
}: {
  order: Order;
  policy: ReturnPolicy;
  action: (prev: ReturnFormState, formData: FormData) => Promise<ReturnFormState>;
  /** The route handler a request with photographs is posted to. */
  uploadUrl: string;
  loginPath?: string;
}) {
  const router = useRouter();

  const { state, formAction, pending, progress, onSubmitCapture } = useUploadForm<ReturnFormState>({
    action,
    initial,
    url: uploadUrl,
    prepare: useCallback((data: FormData) => {
      // Laravel reads lists from bracketed names; the controls are named
      // `qty_<line>` so the Server Action can read them without parsing any.
      let n = 0;
      for (const [key, value] of [...data.entries()]) {
        if (!key.startsWith("qty_")) continue;
        data.delete(key);
        if (Number(value) > 0) {
          data.append(`items[${n}][order_item_id]`, key.slice(4));
          data.append(`items[${n}][quantity]`, String(value));
          n += 1;
        }
      }
      const photos = data.getAll("photos");
      data.delete("photos");
      photos.forEach((file) => { if (file instanceof File && file.size > 0) data.append("photos[]", file); });
    }, []),
    loginPath,
    onSuccess: useCallback((body: unknown) => {
      router.refresh();
      return { ok: (body as { message?: string } | null)?.message ?? "We have your return request." } as ReturnFormState;
    }, [router]),
  });

  const lines = (order.items ?? [])
    .map((line) => ({ line, max: policy.items.find((i) => i.order_item_id === line.id)?.returnable ?? 0 }))
    .filter(({ max }) => max > 0);

  if (state.ok && !state.error) {
    return <Alert tone="ok" title="Return requested" dismissible={false}>{state.ok}</Alert>;
  }

  const only = lines.length === 1 && lines[0].max === 1;
  const itemsError = firstUnder(state.fieldErrors, "items");
  const photosError = firstUnder(state.fieldErrors, "photos");
  const refused = state.fieldErrors?.return?.[0];

  return (
    <Form action={formAction} state={state} onSubmitCapture={onSubmitCapture}>
      {(refused || state.error) && (
        <Alert tone="err" title="We could not take that return" dismissible={false}>{refused ?? state.error}</Alert>
      )}

      <fieldset className="mb-[18px]">
        <legend className="mb-2 text-13-5 font-semibold">What are you returning?</legend>
        <ul className="grid gap-2">
          {lines.map(({ line, max }) => (
            <li key={line.id} className="flex items-center gap-3 rounded-md border border-line-strong px-3 py-2">
              <label htmlFor={`qty_${line.id}`} className="min-w-0 flex-1 text-14">
                <span className="block font-medium text-ink [overflow-wrap:anywhere]">{line.name}</span>
                {line.variation_name && <span className="block text-13 text-muted">{line.variation_name}</span>}
              </label>
              <Select
                id={`qty_${line.id}`}
                name={`qty_${line.id}`}
                defaultValue={only ? "1" : "0"}
                aria-label={`How many of ${line.name} to return`}
                className="w-[92px] shrink-0"
              >
                {Array.from({ length: max + 1 }, (_, n) => (
                  <option key={n} value={n}>{n === 0 ? "None" : n}</option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
        {itemsError && <p className="mt-1.5 text-13 text-err">{itemsError}</p>}
      </fieldset>

      <Field label="Why are you returning it?" htmlFor="return-reason" variant="float-static" error={state.fieldErrors?.reason?.[0]}>
        <Select id="return-reason" name="reason" defaultValue="" required>
          <option value="" disabled>Choose a reason…</option>
          {policy.reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </Select>
      </Field>

      <Field
        label="Tell us more"
        htmlFor="return-details"
        error={state.fieldErrors?.details?.[0]}
        hint="What is wrong, and anything that will help us decide quickly. Optional."
      >
        <Textarea id="return-details" name="details" rows={3} maxLength={2000} />
      </Field>

      <Field
        label="Photographs"
        htmlFor="return-photos"
        variant="above"
        error={photosError}
        hint={`Optional — the damage, the label, the box. Up to ${policy.max_photos} pictures, ${Math.floor(policy.max_photo_kb / 1024)} MB each.`}
      >
        <FileDrop
          id="return-photos"
          name="photos"
          multiple
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          label="Add photographs…"
          max={policy.max_photos}
          maxBytes={policy.max_photo_kb * 1024}
          progress={progress}
        />
      </Field>

      <p className="mb-4 text-13 text-muted">
        We will email you once we have looked at it. Please do not send anything back until then.
      </p>

      <Button type="submit" pending={pending}>
        {pending ? (progress ? "Sending…" : "Sending…") : "Send return request"}
      </Button>
    </Form>
  );
}
