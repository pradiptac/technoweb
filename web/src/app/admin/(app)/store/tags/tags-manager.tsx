"use client";

import { useActionState, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { FormActions } from "@/components/admin/form-actions";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { SettingSwitch } from "@/components/admin/setting-switch";
import { tagIndex } from "@/lib/tag-colour";
import {
  autoTagAction, createTagAction, deleteTagAction, mergeTagAction, renameTagAction, reorderTagsAction,
  saveTagSettingsAction, setTagShownAction, type TagActionResult, type TagsFormState,
} from "./actions";
import type { AdminStoreTag, StoreTagsMeta } from "@/types/store-tags";

const initial: TagsFormState = {};

type Dialog = { kind: "rename" | "merge" | "delete"; tag: AdminStoreTag } | null;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Tags screen: the row's three settings, the automatic rule's button, a
 * new-tag box and the list.
 *
 * Every tag is drawn in its own colour — `tagIndex(slug)`, the hash the shop
 * front uses — so what is arranged here looks as it will there. The list is
 * the order the row uses: tags the arrows have placed first, then the rest
 * by how many products carry them; pressing an arrow places all of them.
 *
 * Deleting says how many products lose the tag, and asks first; merging
 * moves a tag's products onto another and removes it, which is how two
 * spellings of one thing become one. Every change goes through a Server
 * Action that purges the shop's cached reads.
 */
export function TagsManager({ tags, meta }: { tags: AdminStoreTag[]; meta: StoreTagsMeta }) {
  const [settingsState, settingsAction, savingSettings] = useActionState(saveTagSettingsAction, initial);
  const [createState, createAction, creating] = useActionState(createTagAction, initial);
  const [enabled, setEnabled] = useState(meta.settings.store_tags_enabled);
  const [auto, setAuto] = useState(meta.settings.store_tags_auto);

  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<TagActionResult | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [into, setInto] = useState("");
  // The Shown switches answer at once; the list re-renders from the server after.
  const [shown, setShown] = useState<Record<number, boolean>>({});

  const run = (work: () => Promise<TagActionResult>, then?: () => void) => {
    setNotice(null);
    start(async () => {
      const result = await work();
      setNotice(result);
      if (result.ok) then?.();
    });
  };

  const close = () => setDialog(null);

  const move = (index: number, delta: -1 | 1) => {
    const ids = tags.map((t) => t.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => reorderTagsAction(ids));
  };

  const toggle = (tag: AdminStoreTag, next: boolean) => {
    setShown((s) => ({ ...s, [tag.id]: next }));
    setNotice(null);
    start(async () => {
      const result = await setTagShownAction(tag.id, next);
      if (!result.ok) {
        // Back to what the server says: the switch did not take.
        setShown((s) => ({ ...s, [tag.id]: !next }));
        setNotice(result);
      }
    });
  };

  const open = (kind: "rename" | "merge" | "delete", tag: AdminStoreTag) => {
    setName(tag.name);
    setInto("");
    setNotice(null);
    setDialog({ kind, tag });
  };

  const others = dialog ? tags.filter((t) => t.id !== dialog.tag.id) : [];

  return (
    <>
      {notice?.error && <Alert tone="err" title="Could not do that">{notice.error}</Alert>}
      {notice?.ok && notice.message && <Alert tone="ok" title={notice.message} />}

      <Form action={settingsAction} state={settingsState} noValidate className="mb-8">
        {settingsState.error && <Alert tone="err" title="Could not save">{settingsState.error}</Alert>}
        {settingsState.ok && !settingsState.error && (
          <Alert tone="ok" title="Tag settings saved">The shop front picks this up immediately.</Alert>
        )}

        <section aria-labelledby="tag-settings" className="rounded-lg border border-line-strong bg-card p-5">
          <h2 id="tag-settings" className="mb-3 text-15-5 font-semibold">The row</h2>

          <div className="grid gap-4">
            <SettingSwitch
              id="tags-enabled" name="setting__store_tags_enabled" checked={enabled} onChange={setEnabled}
              note="Off, the row is not drawn on the shop or the category pages. Tags still work on the products."
            >
              Show the tag row on the shop
            </SettingSwitch>

            <SettingSwitch
              id="tags-auto" name="setting__store_tags_auto" checked={auto} onChange={setAuto}
              note="A product with no tags gets some the first time it is saved — its brand, category and key specifications. Once only: tags you remove never come back."
            >
              Tag new products automatically
            </SettingSwitch>

            <Field label="Tags shown" htmlFor="tags-limit" hint="How many the row offers, 4 to 30.">
              <Input
                id="tags-limit" name="setting__store_tags_limit" type="number" inputMode="numeric" min={4} max={30}
                defaultValue={meta.settings.store_tags_limit} className="w-28"
              />
            </Field>
          </div>
        </section>

        <FormActions>
          <Button type="submit" pending={savingSettings}>{savingSettings ? "Saving…" : "Save"}</Button>
        </FormActions>
      </Form>

      <section aria-labelledby="tag-auto" className="mb-8 rounded-lg border border-line-strong bg-card p-5">
        <h2 id="tag-auto" className="mb-1 text-15-5 font-semibold">Tag untagged products</h2>
        <p className="measure mb-3 text-13 text-muted">
          {meta.untagged > 0
            ? `${plural(meta.untagged, "product has", "products have")} no tags and ${meta.untagged === 1 ? "has" : "have"} never been tagged. This applies the automatic rule to ${meta.untagged === 1 ? "it" : "them"} — once; a product you clear later is left alone.`
            : "Every product has been tagged or decided. Nothing to do."}
        </p>
        <Button
          type="button" variant="secondary" size="sm" pending={busy} disabled={meta.untagged === 0}
          onClick={() => run(autoTagAction)}
        >
          Tag untagged products{meta.untagged > 0 ? ` (${meta.untagged})` : ""}
        </Button>
      </section>

      <section aria-labelledby="tag-list" className="rounded-lg border border-line-strong bg-card p-5">
        <h2 id="tag-list" className="mb-3 text-15-5 font-semibold">Tags</h2>

        <Form action={createAction} state={createState} noValidate className="mb-5 flex flex-wrap items-end gap-2">
          <Field label="New tag" htmlFor="new-tag" error={createState.error} className="mb-0 min-w-0 flex-1 basis-56">
            <Input id="new-tag" name="name" maxLength={meta.name_max} placeholder="Wi-Fi 6" />
          </Field>
          <Button type="submit" variant="secondary" pending={creating}>Add tag</Button>
        </Form>

        {tags.length === 0 ? (
          <EmptyState compact title="No tags yet">
            Add one above, on a product&apos;s form, or tag the products automatically.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {tags.map((tag, index) => {
              const visible = shown[tag.id] ?? tag.is_visible;

              return (
                <li key={tag.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span
                    style={{ background: `var(--color-tag-fill-${tagIndex(tag.slug)})` }}
                    className={`inline-flex h-[26px] items-center rounded-full px-3 text-12 leading-none font-semibold text-white ${visible ? "" : "opacity-50"}`}
                  >
                    {tag.name}
                  </span>

                  <span className="min-w-0 flex-1 basis-24 text-13 text-muted">
                    {plural(tag.products_count ?? 0, "product", "products")}
                  </span>

                  <label className="flex cursor-pointer items-center gap-2 text-13 font-semibold">
                    <Switch
                      checked={visible}
                      onChange={(e) => toggle(tag, e.target.checked)}
                      aria-label={`Show ${tag.name} on the shop`}
                    />
                    Shown
                  </label>

                  <ReorderButtons
                    index={index} count={tags.length} subject={`the tag ${tag.name}`}
                    onMove={(delta) => move(index, delta)} disabled={busy}
                  />

                  <span className="flex flex-wrap gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => open("rename", tag)}>Rename</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => open("merge", tag)} disabled={tags.length < 2}>Merge into…</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => open("delete", tag)}>Delete</Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        open={dialog?.kind === "rename"} onClose={close} title="Rename tag"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button
              type="button" pending={busy}
              onClick={() => dialog && run(() => renameTagAction(dialog.tag.id, name), close)}
            >
              Rename
            </Button>
          </>
        )}
      >
        <Field label="Name" htmlFor="rename-tag" hint="Renaming also changes the tag's address, so an old link to it stops finding it.">
          <Input id="rename-tag" value={name} maxLength={meta.name_max} onChange={(e) => setName(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={dialog?.kind === "merge"} onClose={close} title={`Merge “${dialog?.tag.name ?? ""}” into…`}
        description="Its products move onto the tag you pick, and this tag is removed. A product that has both keeps one."
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button
              type="button" pending={busy} disabled={into === ""}
              onClick={() => dialog && run(() => mergeTagAction(dialog.tag.id, Number(into)), close)}
            >
              Merge
            </Button>
          </>
        )}
      >
        <Field label="Merge into" htmlFor="merge-tag" variant="float-static">
          <Select id="merge-tag" value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">Choose a tag</option>
            {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={dialog?.kind === "delete"} onClose={close} title="Delete tag?"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close}>Keep it</Button>
            <Button
              type="button" variant="destructive" pending={busy}
              onClick={() => dialog && run(() => deleteTagAction(dialog.tag.id), close)}
            >
              Delete tag
            </Button>
          </>
        )}
      >
        <p className="text-14 leading-relaxed">
          {dialog && (dialog.tag.products_count ?? 0) > 0
            ? <>“{dialog.tag.name}” is on <strong>{plural(dialog.tag.products_count ?? 0, "product", "products")}</strong>, which will lose it. The products themselves are not touched.</>
            : <>“{dialog?.tag.name}” is on no products.</>}
        </p>
      </Modal>
    </>
  );
}
