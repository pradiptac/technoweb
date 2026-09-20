/**
 * One line of an import tally — shared by the file wizard and the mailbox
 * wizard so the two "done" screens read the same.
 */
export function Count({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-display text-[18px] font-semibold" : ""}`}>
        {value.toLocaleString("en-IN")}
      </dd>
    </div>
  );
}
