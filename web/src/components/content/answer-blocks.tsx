import { IconCheck } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { QuestionAccordion, type QuestionItem } from "@/components/ui/faq";
import { Prose } from "@/components/ui/prose";
import { cn } from "@/lib/utils";
import type { AnswerBlockKind, Faq, PublicAnswerBlock } from "@/types/api";

/**
 * A record's answer blocks, drawn as ordinary content (`docs/aeo-geo-contract.md`
 * §8; the rules in `docs/seo.md`, "Answer blocks on the page").
 *
 * The API sends the published blocks in the editor's order, each with the
 * `heading` its kind is drawn under. This groups them by kind — in the
 * contract's order, which is the order a reader wants: what it is, who it is
 * for, why, the facts, where it is used, how it compares, how it works, and
 * the questions last — and renders each group under its API heading as an
 * `<h2>`, so every host page keeps one `h1` and the audit's outline rule
 * holds. Nothing here is hidden, `sr-only` or collapsed by default except
 * the questions, which are the same native `<details>` the FAQs use.
 *
 * **The FAQs are merged into the questions group**, not drawn beside it.
 * `faq_schema` — the API's `FAQPage`, which the host page renders through
 * `JsonLd` — is one list over the FAQs and the `question` blocks in that
 * order, so the page shows the same list under one heading rather than two
 * accordions a reader has to work out the difference between. The heading is
 * the `question` kind's when there are question blocks and `FaqList`'s
 * "Common questions" when there are FAQs alone.
 *
 * The heading text is never typed here: a kind the API sends a heading for
 * is drawn under it, and a kind this file has never heard of is drawn last
 * under its own heading rather than dropped — the `iconMap` rule, the other
 * way round.
 */

const ORDER: readonly AnswerBlockKind[] = [
  "definition", "who_for", "why", "key_fact", "feature", "use_case", "comparison", "step", "question",
];

type Group = { kind: AnswerBlockKind; heading: string; items: PublicAnswerBlock[] };

function group(blocks: PublicAnswerBlock[]): Group[] {
  const byKind = new Map<AnswerBlockKind, PublicAnswerBlock[]>();
  for (const b of blocks) {
    if (!b.answer?.trim()) continue;
    const list = byKind.get(b.kind) ?? [];
    list.push(b);
    byKind.set(b.kind, list);
  }
  const kinds = [...ORDER.filter((k) => byKind.has(k)), ...[...byKind.keys()].filter((k) => !ORDER.includes(k))];
  return kinds.map((kind) => {
    const items = byKind.get(kind)!;
    return { kind, heading: items[0].heading, items };
  });
}

/** The supporting explanation under a direct answer — rich text, through `Prose` and nothing else. */
function Detail({ html, className }: { html: string | null; className?: string }) {
  if (!html?.trim()) return null;
  return <Prose html={html} className={cn("mt-3 text-14-5 leading-[1.62] [&_p]:mb-3 [&_p:last-child]:mb-0", className)} />;
}

function Definition({ items }: { items: PublicAnswerBlock[] }) {
  return (
    <div className="grid gap-6">
      {items.map((b, i) => (
        <div key={i}>
          {b.question && <h3 className="mb-2 text-19">{b.question}</h3>}
          <p className="lede">{b.answer}</p>
          <Detail html={b.detail} className="mt-4 text-[16px] leading-[1.72] [&_p]:mb-4.5" />
        </div>
      ))}
    </div>
  );
}

/** `who_for` and `why`: a short section — a paragraph, and the explanation under it. */
function Short({ items }: { items: PublicAnswerBlock[] }) {
  return (
    <div className="grid gap-6">
      {items.map((b, i) => (
        <div key={i}>
          {b.question && <h3 className="mb-2 text-19">{b.question}</h3>}
          <p className="text-[16px] leading-[1.72] text-ink-2">{b.answer}</p>
          <Detail html={b.detail} className="text-[16px] leading-[1.72] [&_p]:mb-4.5" />
        </div>
      ))}
    </div>
  );
}

/** `key_fact` and `feature`: the checklist every benefits list on the site draws. */
function Checklist({ items }: { items: PublicAnswerBlock[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((b, i) => (
        <Card key={i} as="li" interactive={false} padding="sm" className="flex items-start gap-3">
          <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" />
          <div className="min-w-0 text-14-5 leading-[1.55]">
            {b.question && <span className="mb-0.5 block font-semibold text-ink">{b.question}</span>}
            <span>{b.answer}</span>
            <Detail html={b.detail} className="mt-2 text-13-5 text-muted [&_p]:mb-2" />
          </div>
        </Card>
      ))}
    </ul>
  );
}

/** `use_case`: cards, one per case. */
function UseCases({ items }: { items: PublicAnswerBlock[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b, i) => (
        <Card key={i} as="li" interactive={false} padding="md" className="flex flex-col">
          {b.question && <h3 className="mb-1.5 text-15-5 leading-snug">{b.question}</h3>}
          <p className="text-14-5 leading-[1.58] text-ink-2">{b.answer}</p>
          <Detail html={b.detail} className="text-13-5 text-muted [&_p]:mb-2" />
        </Card>
      ))}
    </ul>
  );
}

/** `comparison`: a two-column table — the question against the answer, the detail under the answer. */
function Comparison({ items }: { items: PublicAnswerBlock[] }) {
  return (
    <div className="rounded-lg border border-line-strong bg-card px-5">
      <table className="w-full text-14-5">
        <tbody>
          {items.map((b, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              <th scope="row" className="w-2/5 py-3.5 pr-4 text-left align-top font-semibold text-ink">{b.question ?? "Compared with"}</th>
              <td className="py-3.5 align-top leading-[1.58] text-ink-2">
                {b.answer}
                <Detail html={b.detail} className="mt-2 text-13-5 text-muted [&_p]:mb-2" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `step`: the numbered list the homepage process draws — the number is the position, never a stored one. */
function Steps({ items }: { items: PublicAnswerBlock[] }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line">
      {items.map((b, i) => (
        <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-4.5 bg-card p-6">
          <span className="grid size-7.5 place-items-center rounded-full border border-brand-200 bg-brand-50 font-mono text-xs font-medium text-brand-ink">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            {b.question && <h3 className="mb-1.5 text-16-5">{b.question}</h3>}
            <p className="text-14-5 leading-[1.58] text-ink-2">{b.answer}</p>
            <Detail html={b.detail} className="mt-2 text-13-5 text-muted [&_p]:mb-2" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Body({ group }: { group: Group }) {
  switch (group.kind) {
    case "definition": return <Definition items={group.items} />;
    case "who_for":
    case "why": return <Short items={group.items} />;
    case "key_fact":
    case "feature": return <Checklist items={group.items} />;
    case "use_case": return <UseCases items={group.items} />;
    case "comparison": return <Comparison items={group.items} />;
    case "step": return <Steps items={group.items} />;
    default: return <Short items={group.items} />;
  }
}

export function AnswerBlocks({
  blocks, faqs = [], className,
}: {
  blocks?: PublicAnswerBlock[] | null;
  /** The record's FAQs, merged into the questions group — see above. */
  faqs?: Faq[];
  className?: string;
}) {
  const groups = group(blocks ?? []);
  const questions = groups.find((g) => g.kind === "question");
  const sections = groups.filter((g) => g.kind !== "question");

  // The FAQs first and the question blocks after them: the order
  // `StructuredData::answerFaqs()` lists them in `faq_schema`.
  const asked: QuestionItem[] = [
    ...faqs.map((f) => ({ key: `faq-${f.id}`, question: f.question, answer: f.answer })),
    ...(questions?.items ?? []).map((b, i) => ({
      key: `block-${i}`,
      question: b.question ?? b.answer,
      answer: (
        <>
          {b.question && <p>{b.answer}</p>}
          <Detail html={b.detail} className="text-14-5 [&_p]:mb-3" />
        </>
      ),
    })),
  ];

  if (sections.length === 0 && asked.length === 0) return null;

  return (
    <div className={cn("grid gap-12", className)}>
      {sections.map((g) => (
        <section key={g.kind} data-aos="fade-up" data-answer-blocks={g.kind}>
          <h2 className="display-3 mb-5">{g.heading}</h2>
          <Body group={g} />
        </section>
      ))}
      {asked.length > 0 && (
        <section data-aos="fade-up" data-answer-blocks="question">
          <h2 className="display-3">{questions?.heading ?? "Common questions"}</h2>
          <QuestionAccordion className="mt-6" items={asked} />
        </section>
      )}
    </div>
  );
}
