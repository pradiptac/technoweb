/**
 * How many products the compare tray holds, in a module with no directive.
 *
 * `lib/compare.ts` is `"use client"` (it holds the store and its hook), and
 * a value imported from a client module into a server component arrives as
 * a client *reference*, not a number: `/products/compare` read `COMPARE_MAX`
 * that way, `.slice(0, ref)` was `.slice(0, NaN)`, and the page compared
 * nothing while reporting no error. A constant both sides read lives where
 * neither directive applies.
 *
 * Four, not three: a hardware buyer routinely has two candidates and two
 * alternatives, and a fifth column does not fit a laptop.
 */
export const COMPARE_MAX = 4;
