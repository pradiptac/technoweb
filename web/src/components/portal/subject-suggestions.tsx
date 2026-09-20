"use client";

import { useEffect, useRef, useState } from "react";
import { IconBook } from "@/components/icons-ui";

type Hit = { slug: string; title: string; excerpt: string | null };

/**
 * "This might answer it" — up to three knowledge-base articles that match
 * the subject of a ticket as it is typed.
 *
 * The form already points at the knowledge base *before* itself; this is
 * the deflection the brief asked for, made live at the moment somebody has
 * just said what is wrong. Fetched 300ms after the last keystroke from
 * three characters, through `/api/knowledge-base/suggest`, and rendered
 * under the field as links that open in a new tab — the half-written ticket
 * stays where it is, and the reader comes back to finish it or not.
 *
 * Listens to the subject input by id rather than owning it, so the form's
 * own `<Input>` — uncontrolled, restored on a refusal by `Form` — is
 * untouched. A fetch that fails renders nothing.
 */
export function SubjectSuggestions({ inputId }: { inputId: string }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<{ q: string; rows: Hit[] }>({ q: "", rows: [] });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    const onInput = () => setTerm(input.value);
    input.addEventListener("input", onInput);
    return () => input.removeEventListener("input", onInput);
  }, [inputId]);

  const query = term.trim();

  useEffect(() => {
    if (query.length < 3) return;
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        const res = await fetch(`/api/knowledge-base/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { data: Hit[] };
        setHits({ q: query, rows: body.data ?? [] });
      } catch {
        // Nothing to say; the form is unchanged.
      }
    }, 300);
    return () => { clearTimeout(timer); inFlight.current?.abort(); };
  }, [query]);

  const rows = query.length >= 3 && hits.q === query ? hits.rows : [];
  if (rows.length === 0) return null;

  return (
    <aside aria-label="Articles that might answer this" className="-mt-2 mb-[18px] rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-12-5 font-semibold text-brand-ink">
        <IconBook className="size-4" aria-hidden /> This might answer it
      </p>
      <ul className="grid gap-1">
        {rows.map((h) => (
          <li key={h.slug}>
            <a
              href={`/knowledge-base/${h.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-13-5 font-medium text-ink underline-offset-2 hover:underline"
            >
              {h.title}
            </a>
            {h.excerpt && <span className="block text-12-5 text-muted">{h.excerpt}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
