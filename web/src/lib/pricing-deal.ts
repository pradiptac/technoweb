/**
 * The yearly figures a pricing plan with both prices can show (the banded
 * layout, 0.180.0), worked out from them: the monthly price struck through,
 * the yearly price per month, what is billed, what is saved and the share
 * off. Null when there is no saving to claim — a yearly price at or above
 * twelve months is shown as it stands. Paise in, paise out.
 */
export function yearlyDeal(monthly: number | null | undefined, yearly: number | null | undefined) {
  if (monthly == null || yearly == null || monthly <= 0) return null;
  const save = monthly * 12 - yearly;
  if (save <= 0) return null;
  return { perMonth: Math.round(yearly / 12), was: monthly, billed: yearly, save, percent: Math.round((save / (monthly * 12)) * 100) };
}
