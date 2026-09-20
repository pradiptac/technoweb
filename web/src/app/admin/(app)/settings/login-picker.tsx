"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AuthBackdrop } from "@/components/layout/auth-backdrop";
import {
  BACKDROPS, INTENSITIES, SPEEDS,
  type LoginBackdropId, type LoginChoice, type LoginIntensityId, type LoginSpeedId,
} from "@/lib/login-backdrop-choices";
import type { SettingRow } from "@/lib/admin";

/**
 * The Sign-in screen tab: what sits behind the form, how much of it, and
 * how fast — plus a live preview of the three together.
 *
 * The motion picker's shape: every tile is a label around an `sr-only`
 * radio posting under its own setting name, so the generic form action
 * needs to know nothing about this screen, and the `useEffect` re-asserts
 * the checked radios after a save for the reason the theme picker gives.
 *
 * The tiles show the real thing. Each animation tile renders `AuthBackdrop`
 * as a still frame — the reference this was built from drew text-only
 * tiles, and this project's rule is that a picker tile shows what will be
 * chosen — and the preview under them runs the same component live at the
 * chosen intensity and speed, over the same `bg-dark` the sign-in panel
 * uses. The picture tile shows the uploaded sign-in image, or the brand
 * gradient the screen falls back to.
 */
export function LoginPicker({ rows }: { rows: SettingRow[] }) {
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  const imageUrl = rows.find((r) => r.key === "login_image_path")?.url ?? null;

  const [backdrop, setBackdrop] = useState<LoginBackdropId>((stored.login_backdrop as LoginBackdropId) || BACKDROPS[0].id);
  const [intensity, setIntensity] = useState<LoginIntensityId>((stored.login_intensity as LoginIntensityId) || INTENSITIES[0].id);
  const [speed, setSpeed] = useState<LoginSpeedId>((stored.login_speed as LoginSpeedId) || SPEEDS[0].id);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chosen: Record<string, string> = {
      setting__login_backdrop: backdrop, setting__login_intensity: intensity, setting__login_speed: speed,
    };
    for (const input of el.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      const should = input.value === chosen[input.name];
      if (input.checked !== should) input.checked = should;
    }
  });

  const animated = backdrop !== "image";

  return (
    <div ref={ref} className="space-y-8">
      <Choices
        name="setting__login_backdrop" legend="Behind the form" value={backdrop} onChange={(id) => setBackdrop(id as LoginBackdropId)}
        choices={BACKDROPS} columns="sm:grid-cols-3"
        intro="The left half of the sign-in, registration and password screens. Hidden on phones, where the form has the whole screen."
        preview={(c) => (
          <span className="relative block h-16 overflow-hidden rounded bg-dark" aria-hidden>
            {c.id === "image" ? (
              imageUrl ? (
                // A plain <img>: it is the console's own preview, the one
                // place `unoptimized` pictures are allowed.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="absolute inset-0 opacity-95 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(135deg,var(--color-brand-900),var(--color-secondary-800))] [background-size:14px_14px,14px_14px,100%_100%]" />
              )
            ) : (
              <AuthBackdrop style={c.id as Exclude<LoginBackdropId, "image">} still />
            )}
          </span>
        )}
      />

      <div className={cn("grid gap-8 lg:grid-cols-2", !animated && "opacity-50")}>
        <Choices
          name="setting__login_intensity" legend="Intensity" value={intensity} onChange={(id) => setIntensity(id as LoginIntensityId)}
          choices={INTENSITIES} columns="sm:grid-cols-3" disabled={!animated}
          intro="How much is on screen."
        />
        <Choices
          name="setting__login_speed" legend="Speed" value={speed} onChange={(id) => setSpeed(id as LoginSpeedId)}
          choices={SPEEDS} columns="sm:grid-cols-3" disabled={!animated}
          intro="How fast it moves. Visitors who have asked their device for less motion see a still frame whatever is chosen."
        />
      </div>

      {animated && (
        <section>
          <h3 className="mb-1 text-13-5 font-semibold">Live preview</h3>
          <p className="measure mb-3 text-13 text-muted">
            {BACKDROPS.find((b) => b.id === backdrop)?.label} · {INTENSITIES.find((i) => i.id === intensity)?.label} intensity · {SPEEDS.find((s) => s.id === speed)?.label} speed.
            The sign-in screen draws exactly this at half its width.
          </p>
          <div className="relative h-56 overflow-hidden rounded-lg border border-line-strong bg-dark">
            {/* Keyed so a change remounts the canvas with a fresh scene rather than resizing one mid-flight. */}
            <AuthBackdrop key={`${backdrop}-${intensity}-${speed}`} style={backdrop as Exclude<LoginBackdropId, "image">} intensity={intensity} speed={speed} />
          </div>
        </section>
      )}
    </div>
  );
}

function Choices({
  name, legend, intro, value, onChange, choices, preview, columns, disabled,
}: {
  name: string;
  legend: string;
  intro: string;
  value: string;
  onChange: (id: string) => void;
  choices: LoginChoice[];
  preview?: (c: LoginChoice) => React.ReactNode;
  columns: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-13-5 font-semibold">{legend}</legend>
      <p className="measure mb-3 text-13 text-muted">{intro}</p>
      <div className={cn("grid grid-cols-2 gap-3", columns)}>
        {choices.map((c) => (
          <label
            key={c.id}
            className={cn(
              "block rounded-lg border p-3 transition-colors",
              disabled ? "cursor-default" : "cursor-pointer",
              value === c.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
            )}
          >
            {/*
              A disabled radio still posts nothing, and the generic action
              treats an absent key as "leave it alone" — so switching to the
              picture keeps the last intensity and speed for the next time
              an animation is chosen, rather than resetting them.
            */}
            <input type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} className="sr-only" />
            {preview?.(c)}
            <span className={cn("block text-13 font-semibold text-ink", preview && "mt-2")}>{c.label}</span>
            <span className="mt-0.5 block text-12 leading-snug text-muted">{c.note}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
