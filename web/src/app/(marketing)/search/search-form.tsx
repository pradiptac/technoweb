"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * A plain GET, like the knowledge base's own search.
 *
 * The results page stays server-rendered, shareable and readable without
 * JavaScript, and the browser's back button behaves. The router push is only
 * there to avoid a full document load when JS is available.
 */
export function SearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  return (
    <form
      role="search"
      action="/search"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const term = value.trim();
        router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
      }}
      className="flex flex-wrap gap-2.5"
    >
      <label htmlFor="site-q" className="sr-only">Search the site</label>
      <Input
        id="site-q"
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Product name, SKU, or a question…"
        className="min-w-0 flex-1 sm:max-w-[460px]"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
