"use client";

import { createContext, useContext, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { SeoRow } from "@/types/api";
import { recheckAction } from "./actions";
import { BAND, Ring } from "./score";

/**
 * One row's score, shared between the two cells that show it.
 *
 * The Recheck button sits beside Edit in the Record column and the figure it
 * changes sits three columns away under Score — different `<td>`s, so they
 * cannot be one component and must not be two copies of one piece of state. A
 * row-scoped context is the smallest thing that keeps them agreeing: press the
 * button and the ring, the check count and the open dialog all move together.
 *
 * The provider renders no DOM of its own, so the `<tr>` it wraps is still a
 * direct child of `<tbody>`. That matters more than it sounds: an element
 * between them is invalid table markup, and browsers silently reparent it
 * outside the table rather than telling anyone.
 */

type RowScore = {
  record: SeoRow;
  score: SeoRow["score"];
  recheck: () => Promise<void>;
};

const RowScoreContext = createContext<RowScore | null>(null);

function useRowScore(): RowScore {
  const value = useContext(RowScoreContext);

  if (!value) throw new Error("A SEO row cell was rendered outside RowScoreProvider.");

  return value;
}

export function RowScoreProvider({ record, children }: { record: SeoRow; children: ReactNode }) {
  const [score, setScore] = useState(record.score);
  const toast = useToast();

  /*
    The previous value is kept so the recheck can say what changed.

    "68 → 74" is the answer to the question the button was pressed to ask.
    "Rechecked" is not, and neither is a bare number that may well be the one
    already on screen — and that last case is the one worth naming most
    plainly, because an unchanged score means the edit in the other tab did not
    do what somebody thought it did.
  */
  const recheck = async () => {
    const before = score.value;
    const result = await recheckAction(record.type, record.id);

    if (!result.ok) {
      toast({
        tone: "err",
        title: result.gone ? "Record not found" : "Could not recheck",
        body: result.error,
      });

      return;
    }

    setScore(result.record.score);

    const after = result.record.score.value;

    toast(after === before
      ? {
        tone: "info",
        title: `Still ${after}/100`,
        body: `${record.name} has not changed since this list was loaded.`,
      }
      : {
        tone: after > before ? "ok" : "warn",
        title: `${before} → ${after}/100`,
        body: `${record.name} now passes ${result.record.score.passed} of ${result.record.score.checked} checks.`,
      });
  };

  return (
    <RowScoreContext.Provider value={{ record, score, recheck }}>
      {children}
    </RowScoreContext.Provider>
  );
}

/**
 * The compact Recheck, beside Edit in the Record column.
 *
 * Next to the pencil because that is the order the two are used in: the edit
 * opens in a new tab, the fix happens over there, and this is what gets pressed
 * on coming back — without which the list goes on showing the score from
 * before, with nothing to say so.
 */
export function RowRecheck() {
  const { recheck } = useRowScore();

  return <RecheckButton onRecheck={recheck} compact />;
}

/**
 * The figure, and the way into the fixes behind it.
 *
 * **The failures moved out of a `<details>` and into a dialog.** Five of them
 * expanding inline pushed every row below down the page, so reading one
 * record's problems moved the next record out from under the cursor. A dialog
 * is also somewhere the Recheck button can sit beside the list of things it is
 * about, which is what turns fix-and-recheck into a loop rather than a round
 * trip through the browser's back button.
 */
export function RecordScore() {
  const { record, score, recheck } = useRowScore();
  const [open, setOpen] = useState(false);

  const band = BAND[score.band];

  return (
    <div>
      <div className="flex items-center gap-2">
        <Ring value={score.value} band={score.band} size={34} />
        <div className="leading-tight">
          <span className={cn("font-display text-[15px] font-semibold", band.text)}>
            {score.value}
          </span>
          <span className="ml-1 text-[11.5px] text-faint">/100</span>
          <p className="text-[11.5px] text-faint">{score.passed}/{score.checked} checks</p>
        </div>
      </div>

      {score.failed.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="mt-1.5 inline-flex min-h-[24px] items-center gap-1 text-[12px] font-medium text-brand-ink hover:underline"
        >
          <span aria-hidden="true">›</span>
          {score.failed.length} to improve
        </button>
      )}

      {/*
        Mounted only while open. A closed `<dialog>` computes to `display:
        none` and costs nothing to look at — but this renders once per row, and
        fifty idle dialogs is fifty copies of everything inside them sitting in
        the document for nobody.
      */}
      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={record.name}
          description={
            <>
              {score.passed} of {score.checked} checks pass. The {score.failed.length} below
              are ordered by what each is worth, so the top one moves the score most.
            </>
          }
          footer={
            <>
              <RecheckButton onRecheck={recheck} />
              <ButtonLink href={`${record.admin_path}?tab=seo`} target="_blank" size="sm">
                Edit this record
              </ButtonLink>
            </>
          }
        >
          <div className="mb-4 flex items-center gap-3">
            <Ring value={score.value} band={score.band} size={52} />
            <div>
              <p className={cn("font-display text-[22px] font-semibold leading-none", band.text)}>
                {score.value}
                <span className="ml-1 text-[13px] font-normal text-faint">/100</span>
              </p>
              <p className="mt-1 text-[12.5px] text-muted">{band.label} · {record.type_label}</p>
            </div>
          </div>

          <ul className="space-y-3">
            {score.failed.map((f) => (
              <li key={f.key} className="border-l-2 border-line-strong pl-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{f.label}</span>
                  {/*
                    The weight, because the list is ordered by it and an order
                    with no visible reason reads as arbitrary. "10 pts" rather
                    than a bare 10: a lone number beside a heading is a rank, a
                    rating or an id depending on who is reading it.
                  */}
                  <span className="ml-auto shrink-0 rounded bg-surface-2 px-1.5 py-px text-[11px] font-semibold tabular-nums text-muted">
                    {f.weight} pts
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-[1.55] text-muted">{f.hint}</p>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

/**
 * The recheck control, in both the places it appears.
 *
 * One component rather than two, because the row and the dialog have to agree
 * about what the pending state looks like — and because what somebody does
 * after reading the list of fixes is go and fix one, come back, and press
 * exactly this again.
 *
 * `useTransition` rather than a `useState` flag: the work is a server call, and
 * the pending flag has to stay true until React has committed the state that
 * follows it. A hand-rolled flag flickers off a frame early, which on a fast
 * response is the whole of the feedback.
 */
function RecheckButton({
  onRecheck, compact = false,
}: {
  onRecheck: () => Promise<void>;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const press = () => startTransition(async () => { await onRecheck(); });

  if (compact) {
    return (
      <button
        type="button"
        onClick={press}
        disabled={pending}
        aria-label="Recheck this score"
        title="Recheck — re-scores this record against what is stored now"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line-strong bg-surface-2 text-muted transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-ink disabled:opacity-60"
      >
        <IconRecheck spinning={pending} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={press}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-brand-600 hover:text-brand-ink disabled:opacity-60"
    >
      <IconRecheck spinning={pending} />
      {pending ? "Rechecking…" : "Recheck"}
    </button>
  );
}

/**
 * A circular arrow, spun while the request is out.
 *
 * `currentColor` rather than a hue of its own: this is an icon that *does a
 * job* rather than one that stands for a thing, which is the line
 * `IdentityIcon` draws. The spin is an ordinary CSS animation, so the global
 * reduced-motion rule in globals.css switches it off without this having to
 * ask.
 */
function IconRecheck({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" width={13} height={13} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      className={cn("shrink-0", spinning && "animate-spin")}
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}
