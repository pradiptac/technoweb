"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";

import { setFieldValue } from "@/components/admin/writing/apply";
import { Field, Textarea } from "@/components/ui/input";
import { findMentionQuery, insertMention } from "@/lib/mentions";
import { cn } from "@/lib/utils";

type Person = { id: number; name: string };

/**
 * A plain-text note that can @-mention a colleague (C2, docs/notifications.md).
 *
 * Typing `@` at the start of a word asks `/api/admin/mentionable` for the
 * people who can open this screen; choosing one writes "@Their Name " into
 * the text and adds a hidden `mentions[]` input with their id. One input per
 * person, not a JSON value, because the ticket reply posts as multipart when
 * it carries a file and the API must still read a list. The server decides
 * who is told: an id counts only while "@Their Name" is still in the text.
 *
 * The textarea's value is set through the prototype setter and an `input`
 * event, so `<Form>`, `FormDraft` and the leave guard all see a choice as
 * typing. The chosen ids are dropped when the form resets (React's reset
 * after a successful submit).
 */
export function MentionField({
  scope, name, id, label, rows = 3, required, maxLength, defaultValue, error, hint, inputRef,
}: {
  scope: string;
  name: string;
  id: string;
  label: string;
  rows?: number;
  required?: boolean;
  maxLength?: number;
  defaultValue?: string;
  error?: string;
  hint?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();
  const [people, setPeople] = useState<Person[]>([]);
  const [chosen, setChosen] = useState<Person[]>([]);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);

  useImperativeHandle(inputRef, () => box.current as HTMLTextAreaElement, []);

  // Ask for people once the typing pauses; an empty query lists the first few.
  useEffect(() => {
    if (query === null) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/admin/mentionable?scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(query.query)}`, { signal: ctrl.signal }).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { data?: Person[] } | null) : null;
      setPeople(Array.isArray(body?.data) ? body.data.slice(0, 8) : []);
      setActive(0);
    }, 150);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [query, scope]);

  // React resets the form after a successful submit; the mentions go with the text.
  useEffect(() => {
    const form = box.current?.form;
    if (!form) return;
    const onReset = () => { setChosen([]); setQuery(null); setPeople([]); };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const look = () => {
    const el = box.current;
    // No scope, no picker: a ticket's public reply goes to the customer, so it mentions nobody.
    if (!el || !scope) return;
    const found = findMentionQuery(el.value, el.selectionStart ?? el.value.length);
    setQuery((prev) => (found && prev && prev.start === found.start && prev.query === found.query ? prev : found));
    if (!found) setPeople([]);
  };

  const choose = (person: Person) => {
    const el = box.current;
    if (!el || !query) return;
    const next = insertMention(el.value, query.start, el.selectionStart ?? el.value.length, person.name);
    setFieldValue(el, next.text);
    el.focus();
    el.setSelectionRange(next.caret, next.caret);
    setChosen((c) => (c.some((p) => p.id === person.id) ? c : [...c, person]));
    setQuery(null);
    setPeople([]);
  };

  const expanded = query !== null && people.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!expanded) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + people.length) % people.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && active >= 0 && people[active]) {
      e.preventDefault();
      choose(people[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
      setPeople([]);
    }
  };

  return (
    <div className="relative">
      <Field label={label} htmlFor={id} error={error} hint={hint}>
        <Textarea
          ref={box}
          id={id}
          name={name}
          rows={rows}
          required={required}
          maxLength={maxLength}
          defaultValue={defaultValue}
          aria-invalid={Boolean(error)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          onInput={look}
          onKeyUp={(e) => { if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== "Escape") look(); }}
          onClick={look}
          onKeyDown={onKeyDown}
          onBlur={() => { setQuery(null); setPeople([]); }}
        />
      </Field>
      {scope && chosen.map((p) => <input key={p.id} type="hidden" name="mentions[]" value={p.id} />)}
      {/* Always in the DOM so `aria-controls` points at something; the class, not the attribute (see store-search). */}
      <ul
        id={listId}
        role="listbox"
        aria-label="People to mention"
        className={cn(
          "popover-motion origin-top absolute inset-x-0 top-[calc(100%-14px)] z-40 max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-card p-1.5 shadow-2",
          !expanded && "hidden",
        )}
      >
        {people.map((p, i) => (
          <li
            key={p.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={active === i}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(p)}
            className={cn("cursor-pointer rounded-md px-2.5 py-1.5 text-14 text-ink transition-colors", active === i && "bg-surface-2")}
          >
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
