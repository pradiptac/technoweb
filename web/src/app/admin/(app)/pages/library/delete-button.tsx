"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteLibraryAction } from "../library-actions";

/**
 * Delete a library item, after asking. The API refuses a section still placed
 * linked on a page, with a sentence naming how many; that sentence is shown
 * here as it came, because the way out ("Make a copy here" on those pages) is
 * the editor's to take.
 */
export function DeleteLibraryButton({ id, name, onDeleted }: { id: number; name: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const remove = () => start(async () => {
    const result = await deleteLibraryAction(id);
    if (!result.ok) { setError(result.error ?? "It could not be deleted."); return; }
    setOpen(false);
    toast({ tone: "ok", title: `“${name}” deleted` });
    if (onDeleted) onDeleted(); else router.refresh();
  });

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setError(null); setOpen(true); }}>
        Delete<span className="sr-only"> {name}</span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete “${name}”?`}
        description="Pages that placed a copy of it keep their copy."
        footer={
          <>
            <Button type="button" variant="destructive" pending={pending} disabled={pending} onClick={remove}>Delete</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        {error
          ? <p role="alert" className="text-13-5 text-err">{error}</p>
          : <p className="text-13-5 text-muted">This cannot be undone.</p>}
      </Modal>
    </>
  );
}
