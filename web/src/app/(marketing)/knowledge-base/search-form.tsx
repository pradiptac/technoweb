"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * The public site's search controls are 44px, which is `h-11` and the height
 * the two catalogue filter bars use. Measured before this, the same control
 * came to 51px here and 44px there — one instrument at two sizes, which is
 * drift rather than a decision: nothing documented the difference and nothing
 * depended on it. 44 is also the tap target the mobile audit wants, so the
 * floor and the size agree.
 */

/**
 * Search is a plain GET navigation rather than client-side fetching: the
 * results page stays server-rendered, shareable and indexable, and a query
 * with no JavaScript still works.
 */
export function KbSearchForm({ action = "/knowledge-base" }: { action?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [value, setValue] = useState(params.get("q") ?? "");

  return (
    <form
      role="search"
      action={action}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(value.trim() ? `${action}?q=${encodeURIComponent(value.trim())}` : action);
      }}
      className="flex flex-wrap gap-2.5"
    >
      <label htmlFor="kb-q" className="sr-only">Search the knowledge base</label>
      <Input
        id="kb-q"
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. configure business email on iPhone"
        className="h-11 min-w-0 flex-1 py-0 sm:max-w-[420px]"
      />
      <Button type="submit" className="h-11 py-0">Search</Button>
    </form>
  );
}
