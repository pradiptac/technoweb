"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * "Check again" on the scheduler card: asks the server for this screen once
 * more. A link to the same route would be answered from the router's own
 * copy, which is the status somebody has just been told is out of date.
 */
export function CheckAgain() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="min-h-6 font-semibold text-brand-ink hover:underline disabled:opacity-60"
    >
      {pending ? "Checking…" : "Check again"}
    </button>
  );
}
