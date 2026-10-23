/**
 * How to call the API with a key. The base URL is the API's own
 * (`meta.base_url`), never built here: it is the API's public address, which
 * is not the website's.
 */
export function CurlExample({ baseUrl, keyText = "ak_…" }: { baseUrl: string; keyText?: string }) {
  return (
    <div className="mb-[18px] rounded border border-line-strong bg-card p-3 text-12-5 leading-[1.5] text-muted">
      <p className="mb-1 text-13 font-semibold text-ink">Using a key</p>
      <p className="mb-2">
        Send it as a bearer token to <code className="font-mono break-all">{baseUrl}</code>. This
        call answers with the key&apos;s name and permissions:
      </p>
      <pre className="w-0 min-w-full overflow-x-auto rounded border border-line bg-surface-2 p-2 font-mono text-12 text-ink" tabIndex={0}>
        {`curl -H "Authorization: Bearer ${keyText}" ${baseUrl}/me`}
      </pre>
    </div>
  );
}
