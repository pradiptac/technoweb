"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiSeoPanel, type AiSeoPanelHandle, type SeoAiPatch } from "@/components/admin/ai-seo-panel";
import { ANSWER_BLOCKS_SUGGESTED } from "@/components/admin/answer-blocks-field";
import { FAQS_SUGGESTED } from "@/components/admin/faq-field";
import { loadReadinessAction } from "@/components/admin/aeo-geo-actions";
import { BAND, Ring } from "@/app/admin/(app)/seo/score";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { RecordReadiness } from "@/lib/admin/aeo";
import type { AnswerBlock, ReadinessScore, SeoAiActionKey, SeoBand, SeoSuggestion } from "@/types/api";

const BADGE: Record<SeoBand, "resolved" | "progress" | "urgent"> = {
  good: "resolved", fair: "progress", poor: "urgent",
};

/** The assistant's reading of one score: `aeo_analyze` / `geo_analyze`'s result, `docs/aeo-geo-contract.md` §6. */
type Analysis = { summary: string; strengths: string[]; gaps: string[]; suggestions: string[]; at: string | null };

const ANALYSIS_ACTION: Record<"aeo" | "geo", SeoAiActionKey> = { aeo: "aeo_analyze", geo: "geo_analyze" };

/** The analysis out of a stored suggestion, or null for any other action or a malformed result. */
function analysisOf(s: SeoSuggestion): Analysis | null {
  if (s.action !== "aeo_analyze" && s.action !== "geo_analyze") return null;
  const r = s.result;
  const list = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  return {
    summary: typeof r.summary === "string" ? r.summary : "",
    strengths: list("strengths"), gaps: list("gaps"), suggestions: list("suggestions"),
    at: s.created_at,
  };
}

/**
 * The AEO tab's head: the two readiness scores with the checks each is
 * failing, and the assistant's AEO/GEO actions under them.
 *
 * The scores come from the same single-record read the SEO overview's
 * Recheck uses (`GET /admin/seo/{type}/{id}`, `docs/aeo-geo-contract.md`
 * §5), loaded on mount through a Server Action and re-loaded by the Recheck
 * here — after a save, the tab still shows the score from before, and a
 * reload would cost the form. Either score the API has not sent is drawn as
 * "Not scored yet", never as zero: absent and zero are different claims.
 *
 * Embedded the way `SeoPanel` embeds `AiSeoPanel`: the assistant's Apply
 * lands in the repeaters *below* through two form events rather than a
 * callback threaded through eleven forms — `AnswerBlocksField` takes
 * `tw:answer-blocks-suggested`, `FaqField` takes `tw:faqs-suggested`, and
 * nothing is saved until Save is pressed.
 *
 * `record` is null on a create form, where there is nothing to score and
 * nothing for the assistant to read; the panel says so rather than showing
 * two empty rings.
 */
export function AeoGeoPanel({
  record,
  blocks = [],
}: {
  record: { type: string; id: number } | null;
  /** The record's answer blocks as loaded — the saved ones are offered to "Improve an answer". */
  blocks?: AnswerBlock[];
}) {
  // A saved block, named by what it says: its question where it has one,
  // the first words of its answer otherwise. A row without an id was added
  // this session and is not stored, so the API could not improve it yet.
  const saved = blocks
    .filter((b): b is AnswerBlock & { id: number } => typeof b.id === "number")
    .map((b) => ({ id: b.id, label: `${b.kind.replace("_", " ")}: ${(b.question ?? b.answer).slice(0, 60)}${(b.question ?? b.answer).length > 60 ? "…" : ""}` }));
  const [state, setState] = useState<RecordReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLElement>(null);

  /*
    "Suggest improvements" on each score card (2026-09-21): the assistant's
    `aeo_analyze` / `geo_analyze`, drawn inline under the score it is about
    rather than in the AI panel's dialog — the failed checks above it are
    the rubric's own suggestions, and the model's sit beside them. The run
    goes through the AI panel's handle so there is one run, one cap counter
    and one history; the panel tells this component what it loaded and
    what arrives, whichever button asked. Drawn only when the assistant is
    on and has a key — `aiReady` is the panel's word on that.
  */
  const ai = useRef<AiSeoPanelHandle>(null);
  const [aiReady, setAiReady] = useState(false);
  const [analysing, setAnalysing] = useState<"aeo" | "geo" | null>(null);
  const [analyses, setAnalyses] = useState<{ aeo: Analysis | null; geo: Analysis | null }>({ aeo: null, geo: null });

  const takeSuggestion = useCallback((s: SeoSuggestion) => {
    const a = analysisOf(s);
    if (!a) return;
    setAnalyses((prev) => ({ ...prev, [s.action === "aeo_analyze" ? "aeo" : "geo"]: a }));
    setAnalysing(null);
  }, []);

  // The newest stored analysis of each kind, so a form reopened shows what
  // was asked last time rather than a blank the editor has to pay for again.
  const takeHistory = useCallback((list: SeoSuggestion[]) => {
    const latest = (action: SeoAiActionKey) => { const s = list.find((x) => x.action === action); return s ? analysisOf(s) : null; };
    setAnalyses({ aeo: latest("aeo_analyze"), geo: latest("geo_analyze") });
  }, []);

  const suggest = useCallback((score: "aeo" | "geo") => {
    setAnalysing(score);
    ai.current?.run(ANALYSIS_ACTION[score], {}, { quiet: true });
    // A refusal never reaches this component — the panel shows its sentence
    // — so the spinner is bounded rather than trusted to be cleared.
    setTimeout(() => setAnalysing((cur) => (cur === score ? null : cur)), 60_000);
  }, []);

  // The two primitives, not the object: `record` is built fresh on every
  // render of the form, and an effect keyed on it would refetch on each
  // keystroke in a field three tabs away.
  const type = record?.type;
  const id = record?.id;

  /*
    One round trip on mount, as the AI panel makes — a score cannot be
    computed during render. The state is set from the response's callback,
    which is the shape `react-hooks/set-state-in-effect` allows.
  */
  useEffect(() => {
    if (!type || id === undefined) return;
    let live = true;

    loadReadinessAction(type, id).then((res) => {
      if (!live) return;
      if (res.ok) setState(res.data);
      else setError(res.error);
    });

    return () => { live = false; };
  }, [type, id]);

  const recheck = useCallback(() => {
    if (!type || id === undefined) return;

    startTransition(async () => {
      const res = await loadReadinessAction(type, id);
      if (res.ok) { setState(res.data); setError(null); }
      else setError(res.error);
    });
  }, [type, id]);

  /*
    Apply from the assistant: hand the rows to the repeaters on this form.
    The SEO fields in the patch are never set by an AEO action, so only the
    two row lists are read.
  */
  const applyAi = useCallback((patch: SeoAiPatch) => {
    const form = root.current?.closest("form");
    if (!form) return;

    if (patch.blocks?.length) {
      form.dispatchEvent(new CustomEvent(ANSWER_BLOCKS_SUGGESTED, { detail: { blocks: patch.blocks } }));
    }
    if (patch.faqs?.length) {
      form.dispatchEvent(new CustomEvent(FAQS_SUGGESTED, { detail: { faqs: patch.faqs } }));
    }
  }, []);

  return (
    <section ref={root} className="mb-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-14-5 font-semibold">Answer-engine and generative-engine readiness</h3>
          <p className="measure mt-0.5 text-13 text-muted">
            How much of what an answer engine quotes, and a generative engine
            trusts, this record already carries. Each failed check names the
            block, relationship or signal that would earn it.
          </p>
        </div>

        {record && (
          <Button type="button" variant="secondary" size="sm" onClick={recheck} pending={pending}>
            {pending ? "Rechecking…" : "Recheck"}
          </Button>
        )}
      </div>

      {!record ? (
        <p className="rounded border border-line-strong bg-surface p-3 text-13 text-muted">
          Save the record first. The scores are computed from what is stored,
          so a page that does not exist yet has nothing to score.
        </p>
      ) : error ? (
        <p className="rounded border border-err/25 bg-err-soft p-3 text-13 text-err">{error}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard
            title="AEO"
            blurb="Answer engines: direct answers, questions, facts, steps."
            score={state?.aeo ?? null}
            loading={state === null}
            unscored={state?.unscored ?? false}
            improve={aiReady ? { analysis: analyses.aeo, busy: analysing === "aeo", onPress: () => suggest("aeo") } : undefined}
          />
          <ScoreCard
            title="GEO"
            blurb="Generative engines: the entity, its relationships, its authority."
            score={state?.geo ?? null}
            loading={state === null}
            unscored={state?.unscored ?? false}
            improve={aiReady ? { analysis: analyses.geo, busy: analysing === "geo", onPress: () => suggest("geo") } : undefined}
          />
        </div>
      )}

      {record && (
        <AiSeoPanel
          ref={ai}
          type={record.type}
          id={record.id}
          onApply={applyAi}
          scope="aeo"
          blocks={saved}
          onReady={setAiReady}
          onHistory={takeHistory}
          onSuggestion={takeSuggestion}
        />
      )}
    </section>
  );
}

/** One score with its failed checks, or the reason there is none. */
function ScoreCard({
  title, blurb, score, loading, unscored, improve,
}: {
  title: string;
  blurb: string;
  score: ReadinessScore | null;
  loading: boolean;
  unscored: boolean;
  /** The assistant's improvement suggestions for this score, and the press that asks for them; absent while the assistant is off. */
  improve?: { analysis: Analysis | null; busy: boolean; onPress: () => void };
}) {
  const failed = score?.failed ?? [];
  const analysis = improve?.analysis ?? null;

  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <div className="flex items-start gap-3">
        {score ? (
          <Ring value={score.value} size={52} />
        ) : (
          <span aria-hidden="true" className="grid size-[52px] shrink-0 place-items-center rounded-full border-[5px] border-line-strong text-13 text-faint">—</span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-14 font-semibold">{title}</span>
            {score && <Badge tone={BADGE[score.band]}>{BAND[score.band].label}</Badge>}
          </div>
          {score ? (
            <p className="mt-0.5 leading-tight">
              <span className={cn("font-display text-22 font-semibold", BAND[score.band].text)}>{score.value}</span>
              <span className="ml-1 text-12 text-faint">/100</span>
              {score.passed !== undefined && score.checked !== undefined && (
                <span className="ml-2 text-12 text-faint">{score.passed}/{score.checked} checks</span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-13 text-muted">
              {loading ? "Scoring…" : unscored ? "Not scored — this kind of record is not on the SEO overview." : "Not scored yet."}
            </p>
          )}
          <p className="mt-1 text-12 text-faint">{blurb}</p>
        </div>
      </div>

      {score && failed.length === 0 && (
        <p className="mt-3 text-12-5 text-muted">Every check that applies here passes.</p>
      )}

      {failed.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {failed.map((f) => (
            <li key={f.key} className="border-l-2 border-line-strong pl-3">
              <div className="flex items-baseline gap-2">
                <span className="text-13 font-semibold text-ink">{f.label}</span>
                <span className="ml-auto shrink-0 rounded bg-surface-2 px-1.5 py-px text-11 font-semibold tabular-nums text-muted">
                  {f.weight} pts
                </span>
              </div>
              <p className="mt-0.5 text-12-5 leading-[1.55] text-muted">{f.hint}</p>
            </li>
          ))}
        </ul>
      )}

      {improve && score && (
        <div className="mt-3.5 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-12-5 font-semibold text-ink">Improvement suggestions</span>
            <Button type="button" variant="secondary" size="sm" pending={improve.busy} onClick={improve.onPress}>
              {improve.busy ? "Reading the page…" : analysis ? "Suggest again" : "Suggest improvements"}
            </Button>
          </div>

          {analysis ? (
            <div className="mt-2.5 space-y-2.5 text-12-5 leading-[1.55]">
              {analysis.summary && <p className="text-ink">{analysis.summary}</p>}
              {analysis.gaps.length > 0 && (
                <div>
                  <p className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Gaps</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
                    {analysis.gaps.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
              )}
              {analysis.suggestions.length > 0 && (
                <div>
                  <p className="text-11 font-semibold uppercase tracking-[.06em] text-faint">What to do</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-4 text-ink">
                    {analysis.suggestions.map((s) => <li key={s}>{s}</li>)}
                  </ol>
                </div>
              )}
              {analysis.strengths.length > 0 && (
                <p className="text-muted">
                  <span className="font-semibold text-ink">Already strong:</span> {analysis.strengths.join(" · ")}
                </p>
              )}
              <p className="text-11-5 text-faint">
                The assistant&apos;s reading of what is stored{analysis.at ? `, ${formatDate(analysis.at, "dateTime")}` : ""}. Suggestions only — nothing changes until you act on one and press Save.
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-12-5 text-muted">
              Ask the assistant what would raise this score most: it reads the stored page and names the gaps and the moves, in order.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
