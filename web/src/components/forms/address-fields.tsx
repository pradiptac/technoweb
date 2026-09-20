"use client";

import { PincodeAutofill } from "@/components/forms/pincode-autofill";
import { Field, Input } from "@/components/ui/input";
import type { StoredAddress } from "@/types/api";

/**
 * One address block, wherever one is asked for.
 *
 * Two screens collect an address — the checkout and the portal profile — and
 * each collects two of them, billing and a delivery address when they differ.
 * That is four copies of the same six fields if this is written inline, which
 * is four places for the PIN-code-first order to drift or a `required` to be
 * forgotten.
 *
 * The prefix is what lets one component serve all four: it names the inputs
 * *and* their ids, so two blocks in one form never collide on either.
 *
 * `PincodeAutofill` finds its fields by name through `closest("form")`, so the
 * second instance is handed the prefixed names and fills its own block. Two
 * instances in one form are independent for that reason and no other.
 */
export function AddressFields({
  prefix = "",
  errorPrefix = "address",
  autoCompletePrefix = "",
  defaults,
  err,
  required = true,
}: {
  prefix?: string;
  errorPrefix?: string;
  /** `shipping ` on the second block; a browser can then keep the two apart. */
  autoCompletePrefix?: string;
  defaults?: StoredAddress | null;
  err: (field: string) => string | undefined;
  /**
   * Compulsory at the checkout, optional on the profile.
   *
   * An address is a condition of *delivering* something, not of holding an
   * account — so the profile screen must be savable with the block left empty,
   * or changing a telephone number would demand a PIN code first. The server
   * makes the same distinction: the checkout requires it, `UpdateProfileRequest`
   * never does.
   */
  required?: boolean;
}) {
  const name = (field: string) => `${prefix}${field}`;
  const error = (field: string) => err(`${errorPrefix}.${field}`);
  const auto = (token: string) => `${autoCompletePrefix}${token}`;
  const pair = "grid gap-x-4 sm:grid-cols-2";

  return (
    <>
      {/*
        The PIN code is asked for first, and the three fields under it fill
        themselves from it.

        Not the conventional order — street, then town, then post code — and
        deliberately so. Six digits determine the state and very nearly
        determine the town, so asking for them first turns three fields
        somebody would otherwise get wrong, abbreviate, or spell six ways into
        three they only have to glance at. The street is the one part a PIN
        code cannot know, so it is asked for last.

        Every one of them stays editable, which is not a nicety: 1,229 PIN
        codes straddle a district boundary, and district is not the same word
        as city — 700091 is "North 24 Parganas" to India Post and "Kolkata" to
        everybody who lives there.

        PIN code shares its row with country so that the status line sits
        directly beneath both: the field that does the filling and the sentence
        saying what it filled stay next to each other.
      */}
      <div className={pair}>
        <Field label="PIN code" htmlFor={name("pin")} error={error("pin")}
          hint="Six digits. The rest fills in from it.">
          <Input id={name("pin")} name={name("pin")} inputMode="numeric" autoComplete={auto("postal-code")}
            maxLength={6} required={required} defaultValue={defaults?.pin ?? ""} aria-invalid={Boolean(error("pin"))} />
        </Field>

        <Field label="Country" htmlFor={name("country")}>
          <Input id={name("country")} name={name("country")} defaultValue={defaults?.country ?? "India"}
            autoComplete={auto("country-name")} />
        </Field>
      </div>

      <PincodeAutofill
        names={{ pin: name("pin"), country: name("country"), state: name("state"), city: name("city") }}
      />

      <div className={pair}>
        <Field label="State" htmlFor={name("state")} error={error("state")}>
          <Input id={name("state")} name={name("state")} autoComplete={auto("address-level1")} required={required}
            defaultValue={defaults?.state ?? ""} aria-invalid={Boolean(error("state"))} />
        </Field>

        <Field label="City" htmlFor={name("city")} error={error("city")}>
          <Input id={name("city")} name={name("city")} autoComplete={auto("address-level2")} required={required}
            defaultValue={defaults?.city ?? ""} aria-invalid={Boolean(error("city"))} />
        </Field>
      </div>

      <Field label="Address" htmlFor={name("line1")} error={error("line1")}>
        <Input id={name("line1")} name={name("line1")} autoComplete={auto("address-line1")} required={required}
          defaultValue={defaults?.line1 ?? ""} aria-invalid={Boolean(error("line1"))} />
      </Field>

      {/* "Optional" belongs in the label; as a hint it is a line for one word. */}
      <Field label="Address line 2 (optional)" htmlFor={name("line2")}>
        <Input id={name("line2")} name={name("line2")} autoComplete={auto("address-line2")}
          defaultValue={defaults?.line2 ?? ""} />
      </Field>
    </>
  );
}
