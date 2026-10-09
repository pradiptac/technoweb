"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tagIndex } from "@/lib/tag-colour";
import { suggestTagsAction } from "@/app/admin/(app)/store/tags/actions";

const MAX = 12;
const NAME_MAX = 32;

/** The key two spellings share: "Wi-Fi 6", "wi-fi  6" and "WIFI 6" are one tag to the API's slug. */
const same = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const tidy = (raw: string) => raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

/**
 * A shop product's tags: chips with a text box, a Suggest button and the
 * shop's existing tags offered as you type (0.141.0, `docs/store.md` "Tags").
 *
 * **Enter or a comma adds** (Enter never submits the form — it is inside the
 * product's `<Form>`), leaving the box adds what was typed, × removes. It
 * posts **one hidden JSON list**, the convention the body editor and the
 * repeaters keep, so the Server Action reads one field. A change dispatches
 * an `input` event on it so `FormDraft` and the leave guard notice — a React
 * state change alone is invisible to both — and `tw:draft-restored` re-reads
 * it, the page builder's pattern.
 *
 * **Suggest tags** sends what the form holds right now (name, summary,
 * description, specifications, brand, category, type) to the API, which asks
 * the AI assistant when it is switched on and has a key and otherwise
 * applies the automatic rule. The answers come back as dashed chips to press;
 * nothing is added until one is, and nothing is saved by asking.
 *
 * `auto` is the API's "these are still the automatic ones": the line under
 * the chips says so while the list is exactly what was loaded.
 *
 * Colour is `tagIndex(slug-ish)` — the same hash the shop front uses, over
 * the lower-cased words, so the chip here is the colour the shopper sees
 * (the API's slug and this key agree for everything but punctuation).
 */
export function TagField({
  name = "tags", defaultValue, suggestions = [], auto = false, error,
}: {
  name?: string;
  defaultValue: string[];
  /** Every tag the shop already has, offered as you type. */
  suggestions?: string[];
  /** True while the loaded tags are the automatic ones, untouched. */
  auto?: boolean;
  error?: string;
}) {
  const id = useId();
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const [offered, setOffered] = useState<{ tags: string[]; source: "ai" | "rules" } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const posted = JSON.stringify(tags);
  const [loaded] = useState(() => JSON.stringify(defaultValue));
  const untouched = posted === loaded;

  /*
    Keyed on what would be posted rather than on a "first run" flag: an effect
    runs twice on mount in development, and a flag would mark an untouched
    form dirty on its second pass.
  */
  const announced = useRef(posted);
  useEffect(() => {
    if (announced.current === posted) return;
    announced.current = posted;
    input.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [posted]);

  useEffect(() => {
    const el = input.current;
    const form = el?.closest("form");
    if (!el || !form) return;

    const restored = () => {
      if (el.value === announced.current) return;
      try {
        const parsed: unknown = JSON.parse(el.value);
        if (Array.isArray(parsed)) setTags(parsed.filter((t): t is string => typeof t === "string").slice(0, MAX));
      } catch { /* not ours to fix */ }
    };

    form.addEventListener("tw:draft-restored", restored);
    return () => form.removeEventListener("tw:draft-restored", restored);
  }, []);

  const has = (candidate: string, list: string[]) => list.some((t) => same(t) === same(candidate));

  const add = (raw: string) => {
    const name = tidy(raw);
    if (name === "" || same(name) === "") return;
    setTags((current) => (current.length >= MAX || has(name, current) ? current : [...current, name]));
  };

  const commit = () => {
    if (draft.trim() === "") return;
    add(draft);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      // Enter inside a form submits it; a comma is a separator, not a letter of the tag.
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  };

  const remove = (name: string) => setTags((current) => current.filter((t) => t !== name));

  const suggest = () => {
    const form = input.current?.closest("form");
    if (!form) return;

    const read = (field: string) => {
      const el = form.elements.namedItem(field);
      return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement ? el.value : "";
    };

    let specifications: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(read("specifications") || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) specifications = parsed as Record<string, string>;
    } catch { /* the API validates what it gets */ }

    setProblem(null);
    start(async () => {
      const result = await suggestTagsAction({
        name: read("name"),
        short_description: read("short_description"),
        description: read("description").slice(0, 4000),
        specifications,
        brand_id: Number(read("brand_id")) || null,
        store_category_id: Number(read("store_category_id")) || null,
        type: read("type") || "physical",
        current: tags,
      });

      if (result.error || !result.tags) {
        setProblem(result.error ?? "We could not suggest tags. Try again shortly.");
        setOffered(null);
        return;
      }

      const fresh = result.tags.filter((t) => !has(t, tags));
      setOffered({ tags: fresh, source: result.source ?? "rules" });
      if (fresh.length === 0) setProblem("Nothing new to suggest — the tags above already cover it.");
    });
  };

  const chip = (label: string) => ({ background: `var(--color-tag-fill-${tagIndex(label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, ""))})` });

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold" id={`${id}-label`}>Tags</span>
      <p className="mb-3 text-12-5 text-faint">
        Short labels a shopper filters by — a feature, a standard, a kind of product. They appear as coloured pills
        under the shop&apos;s search bar and on this product&apos;s page. Up to {MAX}.
      </p>

      <input ref={input} type="hidden" name={name} value={posted} />
      {/* Whether a person changed the list: untouched, the API's automatic rule still applies on save. */}
      <input type="hidden" name={`${name}_changed`} value={untouched ? "0" : "1"} />

      {tags.length > 0 && (
        <ul aria-labelledby={`${id}-label`} className="mb-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <span
                style={chip(tag)}
                className="inline-flex h-[26px] items-center gap-1 rounded-full pr-1 pl-3 text-12 leading-none font-semibold text-white"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  aria-label={`Remove the tag ${tag}`}
                  className="grid size-6 place-items-center rounded-full hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span aria-hidden>×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-box`}
          aria-label="Add a tag"
          list={`${id}-list`}
          value={draft}
          maxLength={NAME_MAX}
          disabled={tags.length >= MAX}
          placeholder={tags.length >= MAX ? `That is ${MAX} tags` : "Type a tag, then press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          className="min-w-0 flex-1 basis-56"
        />
        <datalist id={`${id}-list`}>
          {suggestions.filter((s) => !has(s, tags)).map((s) => <option key={s} value={s} />)}
        </datalist>
        <Button type="button" variant="secondary" size="sm" onClick={suggest} pending={pending} disabled={tags.length >= MAX}>
          {pending ? "Suggesting…" : "Suggest tags"}
        </Button>
      </div>

      {auto && untouched && tags.length > 0 && (
        <p className="mt-2 text-12-5 text-muted">Added automatically — change them as you like.</p>
      )}

      {offered && offered.tags.length > 0 && (
        <div className="mt-3" role="group" aria-label="Suggested tags">
          <p className="mb-2 text-12-5 text-muted">
            {offered.source === "ai"
              ? "Suggested by the AI assistant. Press one to add it."
              : "Suggested from the brand, category and specifications. Press one to add it."}
          </p>
          <ul className="flex flex-wrap gap-2">
            {offered.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => {
                    add(tag);
                    setOffered((o) => (o ? { ...o, tags: o.tags.filter((t) => t !== tag) } : o));
                  }}
                  disabled={tags.length >= MAX}
                  className="inline-flex h-[26px] items-center rounded-full border border-dashed border-line-strong bg-card px-3 text-12 leading-none font-semibold text-ink hover:border-faint disabled:opacity-50"
                >
                  + {tag}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {problem && <p role="status" className="mt-2 text-12-5 text-muted">{problem}</p>}
      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}
    </div>
  );
}
