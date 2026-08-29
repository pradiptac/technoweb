import type { MediaLibraryMeta } from "@/lib/admin";

/**
 * What the library holds and what it will accept.
 *
 * Every number here comes from the API, including the list of extensions.
 * A panel that told an editor which formats are allowed from its own copy of
 * the list would be wrong the first time somebody widened the real one — and
 * wrong in the direction that wastes their afternoon, since they would believe
 * the screen over the refusal.
 *
 * Read-only by design. The limits are editable in Settings and php.ini is not
 * editable at all, so rendering any of it as a disabled input would invite
 * people to try.
 */
export function LibraryInfo({ meta }: { meta: MediaLibraryMeta }) {
  const mb = (kb: number) =>
    kb >= Number.MAX_SAFE_INTEGER / 1024 ? "no limit" : `${Math.round(kb / 1024)} MB`;

  const size = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <details className="mb-3 rounded-lg border border-line bg-surface">
      {/*
        Collapsed by default, and a real <details> rather than a state toggle.

        This is reference material somebody consults when an upload was
        refused, not something to read on the way to the grid — and the whole
        screen exists to show thumbnails, which is the argument that took the
        upload panel out of the toolbar in the first place. A native disclosure
        keeps the keyboard behaviour and needs no client component.
      */}
      <summary className="cursor-pointer list-none px-3.5 py-2 text-[12.5px] font-semibold text-muted marker:content-none hover:text-ink">
        About this library
        <span className="ml-2 font-normal text-faint">
          {meta.images} image{meta.images === 1 ? "" : "s"}, {meta.files} document
          {meta.files === 1 ? "" : "s"} · {size(meta.bytes)}
          {meta.trashed > 0 && ` · ${meta.trashed} in the bin`}
        </span>
      </summary>

      <div className="grid gap-4 border-t border-line px-3.5 py-3 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-[12.5px] font-semibold">Accepted formats</h2>
          <ul className="flex flex-wrap gap-1">
            {meta.extensions.map((ext) => (
              <li
                key={ext}
                className="rounded border border-line-strong bg-card px-1.5 py-0.5 font-mono text-[11.5px] text-muted"
              >
                {ext}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-faint">
            An allowlist, not a filter on what is dangerous to store: these are
            served straight back to browsers.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-[12.5px] font-semibold">Size limits</h2>
          <dl className="space-y-0.5 text-[12.5px]">
            <Row label="Images and documents" value={mb(meta.max_kb)} />
            <Row label="Video (MP4, WebM)" value={mb(meta.max_video_kb)} />
            <Row label="This server allows" value={mb(meta.php_ceiling_kb)} />
          </dl>
          <p className="mt-1.5 text-[11.5px] text-faint">
            The first two are set in Settings → Media. The third is php.ini, and
            it wins — a limit above it cannot take effect.
          </p>
        </div>
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
