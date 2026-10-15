import type { ReactNode } from "react";

import { Switch } from "@/components/ui/switch";

/**
 * A boolean on a record form as the sliding switch (0.152.0; a tick box or a
 * Yes/No select until then).
 *
 * It posts `1` or `0` under `name`, always: the checkbox carries `value="1"`
 * and a hidden `0` follows it, and `FormData.get()` returns the first entry —
 * so every action that reads `=== "1"` keeps working, and "off" is a real
 * answer for the ones that read `!== "0"` rather than a missing key.
 *
 * The checkbox is **named and uncontrolled**, deliberately. That is what lets
 * `<Form>` put it back after a refused save and `FormDraft` restore it (both
 * match a checkbox by name and value), where `SettingSwitch`'s unnamed box over
 * a controlled hidden input would not survive a draft restore. The hidden `0`
 * carries `data-switch-off` so `FormDraft` leaves it out of the snapshot; it
 * is a hidden input, which `<Form>` already skips.
 */
export function RecordSwitch({
  name, defaultChecked, checked, onChange, label, hint, disabled, className,
}: {
  name: string;
  defaultChecked?: boolean;
  /** For a switch that drives something else on the form: controlled instead of `defaultChecked`. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** The sentence the switch answers — "Show in the menu". */
  label: ReactNode;
  /** A line under it, in the muted ink. */
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={["flex cursor-pointer items-start gap-3 text-13-5", className ?? ""].join(" ")}>
      <Switch
        name={name} value="1" disabled={disabled} className="mt-px"
        {...(checked === undefined ? { defaultChecked: defaultChecked ?? false } : { checked, onChange: (e) => onChange?.(e.target.checked) })}
      />
      <input type="hidden" name={name} value="0" data-switch-off="" disabled={disabled} />
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        {hint ? <span className="block text-12-5 text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
