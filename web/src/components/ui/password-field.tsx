"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { Field, Input } from "@/components/ui/input";
import { IconEye, IconEyeOff } from "@/components/icons";

/**
 * A password field with a reveal toggle and a Caps Lock warning.
 *
 * Both exist for the same reason: a password field is the one input on the
 * site that gives no feedback about what you typed, and the two things people
 * actually get wrong are a typo they cannot see and a stuck Caps Lock. The
 * account then locks out after five failures — a real cost for a guess the
 * user was never shown.
 *
 * The toggle is a real `<button type="button">`, not a click handler on an
 * icon: it needs to be reachable by keyboard, and inside a form an untyped
 * button submits. Its accessible name changes with the state rather than
 * staying "Show password" while showing the password, and `aria-pressed` says
 * which way it is set for anyone who cannot see the icon.
 *
 * Caps Lock is read from the keyboard event rather than tracked, because
 * `getModifierState` reports the real state of the key at that moment — a
 * counter would drift the moment the user toggled it in another window. It is
 * cleared on blur: the warning belongs to the field being typed into.
 */
export function PasswordField({
  label, htmlFor, name, hint, error, autoComplete = "current-password",
  required, ...props
}: {
  label: string;
  htmlFor: string;
  name: string;
  hint?: string;
  error?: string;
} & Omit<ComponentProps<"input">, "id" | "name" | "type">) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);

  return (
    <Field
      label={label}
      htmlFor={htmlFor}
      hint={hint}
      error={error}
      // Defined-but-empty, so the live region is mounted before the warning
      // arrives — see FieldNote.
      note={caps ? "Caps Lock is on." : ""}
    >
      <Input
        id={htmlFor}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        // Room for the toggle, so a long password does not run underneath it.
        className="pr-12"
        onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
        onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
        onBlur={() => setCaps(false)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-controls={htmlFor}
        className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded text-faint transition-colors hover:text-ink [&_svg]:size-[18px]"
      >
        {shown ? <IconEyeOff aria-hidden /> : <IconEye aria-hidden />}
        <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
      </button>
    </Field>
  );
}
