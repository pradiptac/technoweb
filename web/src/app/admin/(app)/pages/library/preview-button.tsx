"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TemplatePreview } from "../builder/template-preview";

/** A library item drawn as the public site draws it (0.162.0), in a dialog. */
export function PreviewLibraryButton({ id, name }: { id: number; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Preview<span className="sr-only"> {name}</span>
      </Button>
      <TemplatePreview item={open ? { id, name } : null} onClose={() => setOpen(false)} />
    </>
  );
}
