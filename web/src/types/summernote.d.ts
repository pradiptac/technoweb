/**
 * Minimal ambient types for jQuery and Summernote.
 *
 * Neither ships its own. `@types/jquery` exists and is ~30k lines describing a
 * surface this project uses four calls of — the whole of the integration is
 * `$(el).summernote(...)`, so the honest declaration is the one below rather
 * than a dependency that implies jQuery is used generally. If jQuery ever
 * becomes something this codebase leans on, swap this for the real types;
 * today that would be describing an API nothing calls.
 */
declare module "jquery" {
  /** Every Summernote call this project makes. */
  interface SummernoteElement {
    summernote(options: Record<string, unknown>): void;
    summernote(method: "destroy" | "reset" | "focus"): void;
    summernote(method: "code"): string;
    summernote(method: "code", html: string): void;
    summernote(method: "pasteHTML", html: string): void;
    summernote(method: "insertText", text: string): void;
  }

  function jQuery(target: Element | Document | string): SummernoteElement;

  export default jQuery;
}

declare module "summernote/dist/summernote-lite";
