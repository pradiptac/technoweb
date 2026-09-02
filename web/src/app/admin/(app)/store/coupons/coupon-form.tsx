"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState, useState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { paiseToRupeeInput } from "@/lib/money";
import {
  createCouponAction, deleteCouponAction, updateCouponAction, type CouponFormState,
} from "./actions";
import type { AdminCoupon } from "@/lib/admin";

const initial: CouponFormState = {};

/**
 * One discount code.
 *
 * The **value field changes meaning with the type**, which is the one place in
 * the store where a number does — a percentage or an amount off. So the label
 * and the hint follow the selector rather than saying "Value" and leaving
 * somebody to guess whether 500 means five hundred rupees or five hundred per
 * cent.
 *
 * The maximum-discount field only appears for a percentage. It is meaningless
 * for a fixed amount, and a field that does nothing is a field somebody fills
 * in and then wonders about.
 */
export function CouponForm({ coupon }: { coupon?: AdminCoupon }) {
  const editing = Boolean(coupon);
  const [state, formAction, pending] = useActionState(
    editing ? updateCouponAction : createCouponAction, initial,
  );

  const [type, setType] = useState(coupon?.type ?? "percentage");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={coupon!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Code" htmlFor="code" error={err("code")}
            hint="Stored and matched upper-case, so nobody has to type it the way it was printed.">
            <Input id="code" name="code" defaultValue={coupon?.code} required
              className="font-mono text-[14px]" maxLength={64} aria-invalid={Boolean(err("code"))} />
          </Field>

          <Field label="Discount" htmlFor="type" error={err("type")} variant="float-static">
            <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="percentage">A percentage off</option>
              <option value="fixed">An amount off</option>
            </Select>
          </Field>

          <Field
            label={type === "percentage" ? "Percentage" : "Amount off"}
            htmlFor="value"
            error={err("value")}
            hint={type === "percentage"
              ? "A whole number. 10 means 10% off."
              : "In rupees. Taken off the basket total, and never more than the basket."}
          >
            <Input id="value" name="value" inputMode="decimal" required
              defaultValue={coupon
                ? (coupon.type === "percentage" ? String(coupon.value) : paiseToRupeeInput(coupon.value))
                : ""}
              aria-invalid={Boolean(err("value"))} />
          </Field>

          <Field label="Minimum order" htmlFor="minimum_order" error={err("minimum_order_paise")}
            hint="In rupees. Leave blank for no minimum. The figure is quoted back to the customer when a code is refused.">
            <Input id="minimum_order" name="minimum_order" inputMode="decimal"
              defaultValue={paiseToRupeeInput(coupon?.minimum_order_paise)} />
          </Field>

          {/*
            Only for a percentage. It is what stops "20% off" against a rack of
            switches being a discount nobody authorised, and it means nothing
            for a fixed amount.
          */}
          {type === "percentage" && (
            <Field label="Most it can take off" htmlFor="maximum_discount" error={err("maximum_discount_paise")}
              hint="In rupees. Leave blank for no ceiling — but a percentage with no ceiling is a percentage of a very large order.">
              <Input id="maximum_discount" name="maximum_discount" inputMode="decimal"
                defaultValue={paiseToRupeeInput(coupon?.maximum_discount_paise)} />
            </Field>
          )}

          <Field label="Description" htmlFor="description" hint="For your own reference. Not shown to customers.">
            <Input id="description" name="description" defaultValue={coupon?.description ?? ""} maxLength={255} />
          </Field>
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Active" htmlFor="is_active" variant="float-static"
            hint="Switch a code off rather than deleting it once it has been used.">
            <Select id="is_active" name="is_active" defaultValue={coupon?.is_active === false ? "0" : "1"}>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </Select>
          </Field>

          <Field label="Starts" htmlFor="starts_at" error={err("starts_at")} hint="Optional.">
            <Input id="starts_at" name="starts_at" type="date"
              defaultValue={coupon?.starts_at?.slice(0, 10) ?? ""} />
          </Field>

          <Field label="Ends" htmlFor="ends_at" error={err("ends_at")} hint="Optional. The last day it works.">
            <Input id="ends_at" name="ends_at" type="date"
              defaultValue={coupon?.ends_at?.slice(0, 10) ?? ""} />
          </Field>

          <Field label="Total uses" htmlFor="usage_limit" error={err("usage_limit")}
            hint="Across everybody. Blank means no limit.">
            <Input id="usage_limit" name="usage_limit" type="number" min={1}
              defaultValue={coupon?.usage_limit ?? ""} />
          </Field>

          <Field label="Uses per customer" htmlFor="per_customer_limit" error={err("per_customer_limit")}
            hint="Counted by email address, because most buyers here never sign in.">
            <Input id="per_customer_limit" name="per_customer_limit" type="number" min={1}
              defaultValue={coupon?.per_customer_limit ?? ""} />
          </Field>

          {editing && (
            <p className="mt-2 text-[12.5px] text-muted">
              Used {coupon!.usages_count ?? 0} time{coupon!.usages_count === 1 ? "" : "s"}
              {coupon!.total_given && `, giving away ${coupon!.total_given} in total`}.
            </p>
          )}
        </aside>
      </div>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create code"}
        </Button>
        <Link href="/admin/store/coupons"
          className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteCouponAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(
                  `Delete "${coupon!.code}"? A code that has been used cannot be deleted — switch it off instead.`,
                )) e.preventDefault();
              }}
            >
              Delete code
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
