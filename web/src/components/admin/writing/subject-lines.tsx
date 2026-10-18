"use client";

import { useState, useTransition } from "react";
import { subjectLinesAction } from "@/app/admin/(app)/writing-actions";
import { useWritingStatus } from "./ai-write-button";

/** Three subject lines for a saved campaign, each a button that sets the subject. Nothing while writing help is off. */
export function SubjectLines({ campaignId, onPick }: { campaignId: number; onPick: (subject: string) => void }) {
  const status = useWritingStatus();
  const [pending, start] = useTransition();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!status) return null;

  const suggest = () => {
    setError(null);
    start(async () => {
      const res = await subjectLinesAction(campaignId);
      if (res.ok) setSubjects(res.subjects);
      else setError(res.error);
    });
  };

  return (
    <span className="mt-1 block">
      <button
        type="button"
        onClick={suggest}
        disabled={pending}
        className="cursor-pointer rounded text-12-5 font-semibold text-brand-ink hover:underline disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Thinking…" : "Suggest subject lines"}
      </button>
      {error && <span role="alert" className="ml-2 text-err">{error}</span>}
      {subjects.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="mt-1 block w-full cursor-pointer rounded border border-line bg-card px-2 py-1 text-left text-13 text-ink [overflow-wrap:anywhere] hover:bg-surface-2"
        >
          {s}
        </button>
      ))}
    </span>
  );
}
