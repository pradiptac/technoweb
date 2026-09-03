"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import $ from "jquery";
import "summernote/dist/summernote-lite";
import "summernote/dist/summernote-lite.css";
import { uploadEditorImageAction } from "@/app/admin/(app)/media-actions";
import { MediaBrowser } from "./media-browser";
import { LayoutPicker, type LayoutOption } from "./layout-picker";

/*
 * The eight layouts the Insert-layout dropdown writes.
 *
 * **Tables, and that is forced rather than chosen.** The sanitiser
 * (`api/config/purifier.php`) allows no `div` and no `class` on anything, so
 * every CSS-grid or flex answer to "two columns" is stripped on save — the
 * exact failure this file's own header warns about, where a control appears to
 * work and the markup is gone when the page reloads. A table survives it: the
 * element, `tbody`, `tr` and `td[style]` are all allowlisted already, and
 * `width` is an allowed CSS property. Nothing here needed the allowlist
 * widened, which is why nothing about the sanitiser changed for this feature.
 *
 * `prose.tsx` styles a table with **no `th`** as a layout rather than data: no
 * rules between cells, aligned to the top, a gutter after the first cell, and
 * stacked below `sm` so two columns do not become two ribbons on a phone. That
 * distinction is structural — a data table written in this editor gets its
 * header row from the table dialog — rather than a flag somebody has to
 * remember.
 *
 * The image is a real placeholder file rather than an empty `src`: an editor
 * needs something to click on to replace, and a `src=""` is both invalid and
 * invisible.
 */
const PLACEHOLDER = '<img src="/layout-placeholder.svg" alt="" style="width:100%;">';
const HEADING = "<h3>Section heading</h3>";
const BODY = "<p>Write this section's copy here.</p>";

/** One row of a two-column layout, with the image on the given side. */
const row = (side: "left" | "right") =>
  side === "left"
    ? `<tr><td style="width:40%;">${PLACEHOLDER}</td><td>${HEADING}${BODY}</td></tr>`
    : `<tr><td>${HEADING}${BODY}</td><td style="width:40%;">${PLACEHOLDER}</td></tr>`;

const table = (sides: ("left" | "right")[]) =>
  `<table style="width:100%;"><tbody>${sides.map(row).join("")}</tbody></table><p><br></p>`;

const LAYOUTS: LayoutOption[] = [
  { label: "Image left, content right", html: table(["left"]), rows: ["left"] },
  { label: "Content left, image right", html: table(["right"]), rows: ["right"] },
  {
    label: "Image left, content right × 5 rows",
    html: table(Array(5).fill("left")),
    rows: ["left", "left", "left"],
  },
  {
    label: "Content left, image right × 5 rows",
    html: table(Array(5).fill("right")),
    rows: ["right", "right", "right"],
  },
  {
    label: "Alternating, image first",
    html: table(["left", "right"]),
    rows: ["left", "right"],
  },
  {
    label: "Alternating, content first",
    html: table(["right", "left"]),
    rows: ["right", "left"],
  },
  {
    label: "Image on top, content below",
    // Not a table: one column needs no columns. `text-align` is allowed, and
    // the width keeps a full-bleed placeholder from dwarfing the copy.
    html: `<p style="text-align:center;"><img src="/layout-placeholder.svg" alt="" style="width:60%;"></p>${HEADING}${BODY}<p><br></p>`,
    rows: ["stack"],
  },
  { label: "Title and content", html: `${HEADING}${BODY}<p><br></p>`, rows: ["text"] },
];

/**
 * Rich-text editor for CMS bodies — Summernote, with its full toolbar.
 *
 * Two rules govern what is enabled, and they pull in opposite directions:
 *
 * 1. **Every button must survive the round trip.** The API sanitises each body
 *    on write against an allowlist (`api/config/purifier.php`), so a toolbar
 *    offering something the allowlist drops is a control that appears to work
 *    and silently does nothing — an editor colours a paragraph, saves, and the
 *    colour is gone with nothing said. The allowlist was widened alongside
 *    this file and `components/ui/prose.tsx` styles every tag it now admits.
 *    Adding a button means touching all three, in that order.
 * 2. **Two things the page owns are still not on offer**, because both are
 *    checked by `npm run audit` rather than settled by taste. **`h1`** — the
 *    page renders exactly one and it is the record's title, so a body that
 *    adds a second fails the audit on every screen it appears on. And
 *    **arbitrary iframes** — video is restricted to the two hosts the
 *    sanitiser and the CSP also name.
 *
 * The codeview lets an editor type raw HTML regardless, which is fine and is
 * the point: this toolbar is a usability guardrail and the server is the
 * boundary. `App\Support\HtmlSanitiser` treats whatever arrives as hostile.
 *
 * Formatting is element-based (`styleWithCSS: false`), and the allowlist is
 * written around what a browser actually emits rather than what it ought to —
 * see the option itself for what going the other way silently broke.
 *
 * Summernote touches `document` when its module is evaluated, so this file
 * must never be imported by a server component — `editor-field.tsx` loads it
 * through next/dynamic with `ssr: false`.
 */

/** Escapes a string for use in an HTML attribute value. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A filename is not a description, but it beats an empty alt attribute. */
function altFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

export function RichTextEditor({
  value, onChange, id,
}: {
  value: string;
  onChange: (html: string) => void;
  id?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [browsing, setBrowsing] = useState(false);
  const [pickingLayout, setPickingLayout] = useState(false);

  /*
    The callback is held in a ref and the editor is built exactly once.

    `onChange` is a new function on every render of the parent, and it fires on
    every keystroke — so the parent re-renders on every keystroke. An effect
    that listed it as a dependency would tear the editor down and rebuild it
    between characters, taking the caret, the selection and the undo stack with
    it each time.
  */
  const onChangeRef = useRef(onChange);
  // Written in an effect rather than during render: a ref assignment in the
  // render body is a side effect on every attempt React makes, including the
  // ones it throws away, and `react-hooks/refs` refuses it outright. No
  // dependency array — the point is that it tracks whatever the latest render
  // produced.
  useEffect(() => { onChangeRef.current = onChange; });

  /*
    The initial body, likewise read once. This is `defaultValue` semantics: an
    uncontrolled editor, like every other input in the console's forms, which
    is what lets a rejected save leave what was typed on screen.
  */
  const initial = useRef(value);

  /*
    Summernote's own selection, saved before the picker opens.

    A native <dialog> takes focus, which collapses the selection in the editor
    — so an insert afterwards has no idea where "at the cursor" was and lands
    at the top of the body. Summernote's editor module keeps a `lastRange` for
    exactly this, and its own dialogs save and restore it the same way.
  */
  const restoreRange = useRef<() => void>(() => {});

  const insertImage = useCallback((image: { url: string; alt: string }) => {
    const el = host.current;
    if (!el) return;
    restoreRange.current();
    $(el).summernote("pasteHTML", `<img src="${attr(image.url)}" alt="${attr(image.alt)}">`);
  }, []);

  const insertLayout = useCallback((html: string) => {
    const el = host.current;
    if (!el) return;
    restoreRange.current();
    $(el).summernote("pasteHTML", html);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    /*
      Summernote reads the element's own markup as its starting content.
      Setting it here rather than rendering it as children keeps React out of
      it: this node is rendered childless and is never reconciled again, so the
      DOM Summernote goes on to build is nothing React believes it owns.
    */
    el.innerHTML = initial.current;

    const $el = $(el);

    $el.summernote({
      height: 340,
      // A floor, not a fixed height — the drag handle in the status bar is a
      // real feature, and this stops it being dragged down to nothing.
      minHeight: 200,
      focus: false,
      spellCheck: true,
      disableDragAndDrop: false,

      /*
        Dialogs are appended to <body>, not to the editor.

        Every CMS form here is a single <form>, and a Summernote dialog is a
        live fragment of DOM with its own inputs and its own submit-shaped
        button. Left where it is built, the link dialog's text field sits
        *inside* the record's form — so Enter while typing a URL submits the
        whole record from a modal that was asking a question. Same failure the
        mail-test field documents, reached from the other direction.
      */
      dialogsInBody: true,

      /*
        Left at Summernote's default of `false`, and that is a decision that
        was made the other way first and corrected by running it.

        With it **on**, `document.execCommand` writes CSS instead of elements —
        so Bold produces `<span style="font-weight: bold">` and Underline
        produces `<span style="text-decoration-line: underline">`. Two things
        wrong with that, one of which is silent. Emphasis stops being emphasis:
        a span with a font weight carries no semantics for a screen reader, and
        `Prose` styles `strong`, not "a span that happens to be bold". And
        `text-decoration-line` is a longhand the CSS allowlist does not name, so
        underline was dropped on save with nothing reporting it — exactly the
        failure this whole arrangement is written to prevent, produced by the
        arrangement itself.

        With it **off** the same commands emit `<b>`, `<u>` and `<font>`. The
        first two are in the allowlist, and `<font>` is rewritten to a
        validated `<span style>` by HTMLPurifier's own Tidy module — so the
        colour and family buttons still work, and nothing legacy is stored.
      */
      styleWithCSS: false,

      /*
        h1 is absent deliberately: the page renders it, and `npm run audit`
        fails any route with more or fewer than exactly one. h5 and h6 are
        absent for the neighbouring rule — the same audit fails a heading-level
        jump, and an article that has reached h5 has structure that wants
        separate records rather than deeper nesting.
      */
      styleTags: ["p", "h2", "h3", "h4", "blockquote", "pre"],

      toolbar: [
        ["history", ["undo", "redo"]],
        ["style", ["style"]],
        ["font", ["bold", "italic", "underline", "strikethrough", "superscript", "subscript", "clear"]],
        ["fontname", ["fontname"]],
        ["fontsize", ["fontsize"]],
        ["color", ["forecolor", "backcolor"]],
        ["para", ["ul", "ol", "paragraph"]],
        ["height", ["height"]],
        ["table", ["table"]],
        ["insert", ["layouts", "library", "picture", "link", "video", "hr"]],
        ["view", ["fullscreen", "codeview", "help"]],
      ],

      /*
        The font families offered are the ones a reader's machine actually has.

        This site's own faces are loaded by next/font under generated family
        names (`__Inter_a1b2c3`), so an inline `font-family: Inter` would match
        a system Inter if one happened to be installed and fall through to the
        default if not — a control whose effect depends on the reader's font
        book. Body text inherits the site's face by saying nothing at all,
        which is both the right default and the one that stays right when a
        theme changes the face.
      */
      fontNames: [
        "Arial", "Arial Black", "Comic Sans MS", "Courier New", "Georgia",
        "Helvetica", "Impact", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
      ],
      fontNamesIgnoreCheck: [],
      /*
        Starts at 12, where Summernote's own list starts at 8.

        The public site has a 12px type floor — an unlayered rule in
        `globals.css` scoped to `.public-site` — and `npm run audit:mobile`
        fails on text under 12px. An inline `font-size` beats a stylesheet rule,
        so offering 8, 9, 10 and 11 in this dropdown is offering four ways to
        author a page that fails a gate the whole site is held to, from a
        control that gives no hint of it.

        Same call as the missing h1: the *feature* is font size and it is here.
        What is not here is the handful of values that are measurably wrong.
      */
      fontSizes: ["12", "13", "14", "16", "18", "20", "24", "30", "36", "48"],

      /*
        A custom toolbar button, first in the insert group.

        The library is where images live in this product, so inserting one that
        is already there has to be at least as easy as uploading a new copy —
        otherwise the same logo arrives four times under four hashed names and
        the grid cannot tell them apart. `picture` stays beside it for the file
        that genuinely is new; both end up in the same place.
      */
      buttons: {
        /*
          A plain button that opens a React picker, not a Summernote dropdown.

          `ui.dropdown` was tried first and does not work in this
          distribution: measured on this build, the menu renders with the
          right classes, as the toggle's next sibling, with
          `data-toggle="dropdown"` set — and clicking never adds the `open`
          class lite's own stylesheet keys visibility off, so the menu stays
          at `display: none`. Driving that class by hand from the button's
          `click` did not fire either.

          Rather than keep guessing at an internal, this uses the pattern the
          Library button beside it has proven in this very file: a button that
          saves the range and flips React state, and a component that inserts
          at the saved cursor. It also buys a better picker — eight named
          layouts with room to describe each, rather than a bare menu.
        */
        layouts: (context: SummernoteContext) => {
          restoreRange.current = () => context.invoke("editor.restoreRange");

          return context.ui.button({
            contents: '<i class="note-icon-table"></i><span class="note-library-label">Layout</span>',
            tooltip: "Insert a layout",
            container: context.options.container,
            click: () => {
              context.invoke("editor.saveRange");
              setPickingLayout(true);
            },
          }).render();
        },

        library: (context: SummernoteContext) => {
          restoreRange.current = () => context.invoke("editor.restoreRange");

          return context.ui.button({
            contents: '<i class="note-icon-picture"></i><span class="note-library-label">Library</span>',
            tooltip: "Insert from the media library",
            /*
              `container` is not optional, and leaving it out throws.

              Summernote's Buttons module wraps `ui.button` with its own method
              that sets `o.container = this.options.container` on the way past,
              so every built-in button gets it and a custom one calling
              `context.ui.button` directly does not. `TooltipUI.show` then does
              `$(this.options.target).offset()` against `undefined` and dies on
              `.top` — on hover, so the button works and the console fills with
              a TypeError the moment anyone points at it.

              Read off the context rather than hard-coded: Summernote resolves
              this to the editor element during its own initialise, and
              `dialogsInBody` means it is not always the same node.
            */
            container: context.options.container,
            click: () => {
              context.invoke("editor.saveRange");
              setBrowsing(true);
            },
          }).render();
        },
      },

      callbacks: {
        onChange(contents: string) {
          onChangeRef.current(contents);
        },
        /*
          Called for a chosen file, a dropped file and a pasted one alike,
          which is the whole reason it is worth wiring: without it all three
          become base64 inside the body. See uploadEditorImageAction.
        */
        onImageUpload(files: FileList) {
          void insertUploads($el, Array.from(files));
        },
        /*
          Deleting an image from a body does **not** delete the file.

          It is a media-library row now, quite possibly referenced by other
          records, and a body edit is the wrong place to destroy a shared
          asset. The library's own delete already warns that nothing tracks
          what references a file; doing it from here would be that same hazard
          with no dialog in front of it at all.
        */
        onMediaDelete() {},
      },
    });

    demoteDialogTitles();

    return () => {
      // Restores the original element and removes everything Summernote built,
      // so React only ever unmounts a node it put there itself.
      $el.summernote("destroy");
    };
  }, []);

  return (
    <div id={id} className="cms-editor">
      <div ref={host} />
      <MediaBrowser open={browsing} onClose={() => setBrowsing(false)} onPick={insertImage} />
      <LayoutPicker
        open={pickingLayout}
        options={LAYOUTS}
        onClose={() => setPickingLayout(false)}
        onPick={(html: string) => {
          insertLayout(html);
          setPickingLayout(false);
        }}
      />
    </div>
  );
}

/** The slice of Summernote's plugin context this file uses. */
type SummernoteContext = {
  invoke: (method: string, ...args: unknown[]) => unknown;
  /** Resolved options, after Summernote has filled in its own defaults. */
  options: { container?: unknown };
  ui: {
    button: (options: {
      contents: string;
      tooltip: string;
      container: unknown;
      click: () => void;
    }) => { render: () => unknown };
  };
};

/**
 * Summernote titles its dialogs with an `<h4>`. This turns each into a `<div>`.
 *
 * `dialogsInBody` appends those dialogs to `<body>`, which puts their headings
 * into the *page's* heading outline — and the last heading before them on a CMS
 * form is an `<h2>`, so every edit screen carrying an editor failed
 * `npm run audit` with `heading jump: h2 -> h4: "Insert Link"`. Three routes
 * reported it before the run even reached the discovered edit screens.
 *
 * Demoting rather than renumbering, because the heading was never doing any
 * work: Summernote already sets `aria-label` to the same string on the
 * `role="dialog"` element, which is what actually names the dialog for a screen
 * reader. An `<h4>` inside it is a second copy of that name, contributing
 * nothing except a level in an outline it does not belong to — the dialog is
 * modal, so when it is open the rest of the document is inert, and when it is
 * closed it is `display: none` and is not a section of this page at all.
 *
 * The class is what the stylesheet targets, so it is carried across and nothing
 * moves. Idempotent, and scoped to titles that are still headings, so running
 * it again — or with a second editor on the page — does nothing.
 */
function demoteDialogTitles(): void {
  document.querySelectorAll(".note-modal-title").forEach((title) => {
    if (!/^H[1-6]$/.test(title.tagName)) return;

    const div = document.createElement("div");
    div.className = title.className;
    div.textContent = title.textContent;
    title.replaceWith(div);
  });
}

/**
 * Uploads one file at a time and inserts each as it lands.
 *
 * Sequential for the same reason the media library's own uploader is: each
 * call is a request that can fail on its own, and a parallel batch reports one
 * outcome for several files without saying which file it belongs to.
 */
async function insertUploads($el: ReturnType<typeof $>, files: File[]): Promise<void> {
  for (const file of files) {
    const body = new FormData();
    body.set("file", file);

    const result = await uploadEditorImageAction(body);

    if ("error" in result) {
      /*
        Into the body, at the caret, where the person is looking.

        A toast would be the wrong shape: this is about the thing being
        written, and it has to still be there while they go and fix the file.
        It is plain text, so saving it is harmless and deleting it is a
        keystroke.
      */
      $el.summernote("insertText", `[Upload failed: ${result.error}]`);
      continue;
    }

    const alt = result.alt || altFromFilename(file.name);
    $el.summernote("pasteHTML", `<img src="${attr(result.url)}" alt="${attr(alt)}">`);
  }
}
