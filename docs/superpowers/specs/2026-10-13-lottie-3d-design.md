# 0.172.0 — Lottie animations and 3D models (A3)

Approved in conversation on 2026-10-13. Roadmap 2.0, track A, release A3.

## Intent

Editors can place a **Lottie animation** or a **3D model** on a page as
builder sections and as widgets in the custom layout section. Files live in
the media library. A pasted link is **downloaded into the library once, on
save**, so no visitor's browser ever fetches from LottieFiles, Sketchfab or
any other third party. Animations play when seen; everything is still under
reduced motion.

## The client's decisions

- **Where:** page-builder sections, and layout widgets.
- **Source:** an upload to the media library, or a pasted link that is copied into the library.
- **Behaviour:** play when seen and respect reduced motion; editors get few controls.
- **AR is out** of this release.

## Binding constraints

- **No third-party request at view time, and no change to the security policy.** Everything comes from the asset origin, which is already in `img-src`, `connect-src` and `media-src`.
- **No `eval`, no WebAssembly:**
  - Lottie uses `lottie-web`'s light build (`lottie_light`, SVG renderer).
  - 3D uses `@google/model-viewer`.
  - Models that need a decoder are refused on upload: Draco, meshopt and Basis/KTX2 all need WebAssembly or a CDN.
- **Bundles:** both libraries are loaded with dynamic `import()`, only on a page that has the section, and only when it nears the screen.
- **No layout shift:**
  - Lottie reserves its box from the animation's own width and height, which are stored on the media row.
  - A model reserves a fixed height choice.
- **Reduced motion:**
  - Lottie shows its first frame, still.
  - A model does not auto-rotate; the visitor can still drag it.
- **Moving content longer than 5 seconds has a Pause button:** a looping Lottie.

## 1. API — media library

`App\Support\Media\MediaUploader` accepts three more extensions: `json`, `lottie` and `glb`. They bypass the `mimes:` rule (finfo is unreliable for them) and go through `App\Support\Media\MotionFiles::check(string $path, string $ext): array{mime: string, width: ?int, height: ?int}`. That method throws a `ValidationException` on the `file` key, with a plain sentence.

| Extension | Check | Stored `mime` | Width and height |
|---|---|---|---|
| `json` | Decodes to an object with `v`, `fr`, `ip`, `op`, numeric `w`/`h` and a `layers` array. Every `assets[]` entry with a `p` either has `e: 1` or a `p` starting with `data:`; otherwise "This animation loads pictures from another site. Export it with its images embedded." | `application/lottie+json` | `w`, `h` |
| `lottie` | A zip (ZipArchive) with `manifest.json` naming at least one animation. `animations/<id>.json` passes the `json` check, where an asset `p` may also name a file in the zip's `images/`. At most 200 entries. | `application/lottie+zip` | the first animation's `w`, `h` |
| `glb` | First 4 bytes are `glTF`, the version is 2, and the declared length is ≤ the file size. The JSON chunk parses. Any `buffers[].uri` or `images[].uri` not starting with `data:` is refused ("This model loads files from another site…"). `extensionsUsed` containing `KHR_draco_mesh_compression`, `EXT_meshopt_compression` or `KHR_texture_basisu` is refused ("This model is compressed in a way the site cannot open without loading code from another site. Export it uncompressed (glTF binary, no Draco)."). | `model/gltf-binary` | null |

- **Size caps:** `MotionFiles::MAX_LOTTIE_KB = 5120` and `MAX_MODEL_KB = 25600`, each also bounded by php.ini's ceiling through `UploadLimits::phpCeilingKb()`.
- **The JSON check** decodes with `JSON_THROW_ON_ERROR` and a depth of 512.
- **`storeFromPath()`** (imports) applies the same branch.
- **Width and height** are written to the media row's existing `width`/`height` columns.
- **`meta.library.extensions`** lists the three new extensions. `meta.library` adds `max_lottie_kb` and `max_model_kb`.
- **`GET /admin/media`** gains `?kind=lottie` (`mime like 'application/lottie%'`) and `?kind=model` (`mime = 'model/gltf-binary'`). `kind=file` keeps meaning "not an image".
- **The media resource** carries `width`/`height` for these rows, as it does for images.

### Importing a link

`POST /admin/media/import-url` is `role:content_manager`, throttled 10/min.

- **Body:** `url` (an http(s) URL, max 2048 characters) and optional `folder_id`.
- **Download:** `MediaDownload::toTemp($url, false, min(cap, …) bytes)`, through `SafeHttp`: public hosts only, redirects checked hop by hop. Private hosts are allowed only under the existing local-only env switches, and this endpoint does not honour them at all.
- **The filename** is the URL path's basename. The extension must be one the library accepts.
- **Storing:** `MediaUploader::storeFromPath()`, so every content check above applies, as do SVG sanitising and the image limits.
- **Answers:**
  - **201** with the media resource (`{data: {...}}`, created through `->response()->setStatusCode(201)`).
  - **422 on `url`**, with one sentence, when the address is refused or unreachable, too large, or of a type the library does not take, and with the content check's sentence when the file fails it.
- The temp file is always unlinked.

## 2. API — sections and widgets

Two new `PageSectionType` cases, **appended at the end of the enum**:

- **`lottie` — "Animation"**
  - `heading?` (160), `lede?` (300) and `file_path` (required, a library file whose mime starts with `application/lottie`).
  - `alt?` (200): what it shows, for a screen reader; blank means decorative.
  - `loop` (bool, default false), `size` (`s`|`m`|`l`, default `m`), `align` (`center`|`start`, default `center`).
  - Defaults are not stored.
- **`model` — "3D model"**
  - `heading?`, `lede?` and `file_path` (required, a library file whose mime is `model/gltf-binary`).
  - `alt` (required, 200): `model-viewer` needs a description.
  - `poster_path?` (a library image), `rotate` (bool, default true) and `height` (`s`|`m`|`l`, default `m`).

**Errors** are keyed `blocks.N.data.file_path`, with "Choose an animation from the media library." and "Choose a 3D model (.glb) from the media library."

**`SectionPresenter`:**
- **`lottie`:** `file_path` becomes `file` (URL, via `MediaUrl::for`), plus `format` (`json`|`lottie`, from the extension) and `ratio` (`width / height` from the media row, else 1). The section is dropped if the file has gone.
- **`model`:** `file_path` becomes `file`, `poster_path` becomes `poster`/`poster_alt`. Dropped if the file has gone.

**`LayoutRules::widgets()`** gains `lottie` and `model` widgets:
- **`lottie`:** `file_path` of kind `lottie` (required), `alt` (text 200), `loop` (choice `no`|`yes`, default `no`).
- **`model`:** `file_path` of kind `model` (required), `alt` (text 200, required), `poster_path` (kind `path`, optional), `rotate` (choice `yes`|`no`, default `yes`).
- The new field kinds `lottie` and `model` are media checks with prefix `application/lottie` and `model/` respectively.
- `LayoutPresenter` maps them as the sections do. A widget whose file has gone is dropped.

**Tests:** `MotionFilesTest`, `MediaImportUrlTest` (with SafeHttp faked or bound), and `PageBuilderTest` provider rows for both types.

## 3. Web

**`components/page-sections/motion-sections.tsx` (server):**
- `LottieSection` draws the heading, the lede and a `<LottiePlayer>` box sized `aspect-ratio: ratio` with max-width by size (S 320, M 560, L 880).
- `ModelSection` draws the heading, the lede and a `<ModelStage>` with a fixed height by size (S 320, M 440, L 600).

**`components/ui/lottie-player.tsx` (client):**
- An IntersectionObserver with a 200px root margin starts the load.
- **Loading:** `import("lottie-web/build/player/lottie_light")` and `fetch(file)`.
  - **`.lottie`:** `fflate.unzipSync`, then the manifest's first animation; images in `images/` are inlined as data URIs.
  - **Rendering:** `renderer: "svg"`, `autoplay: false`.
- **Playing:**
  - It plays when at least 50% is visible, and pauses when it leaves the screen or the tab is hidden.
  - Under reduced motion, `goToAndStop(0, true)` and nothing plays.
  - When it loops, a Pause/Play button (24px) sits in the box's corner.
- **Accessibility:** `role="img"` with `aria-label` from `alt`, or `aria-hidden` when `alt` is blank.
- **Failure:** a failed load shows nothing (an empty box at the reserved size) and logs nothing to the console.

**`components/ui/model-stage.tsx` (client):**
- **Server render:** the poster (via `next/image`) or a soft placeholder at the reserved height.
- **Near the screen:** `import("@google/model-viewer")`, then it renders `<model-viewer>` with:
  - `src`, `alt`, `camera-controls`, `touch-action="pan-y"`, `poster`, `loading="eager"`, `shadow-intensity="1"`;
  - `auto-rotate` and `rotation-per-second="18deg"` only when `rotate` is on and motion is allowed;
  - `interaction-prompt="none"`.
- **Pausing:** auto-rotate pauses while the tab is hidden, which model-viewer does itself.
- **No AR attributes.**
- A JSX intrinsic declaration for `model-viewer` goes in `types/model-viewer.d.ts`.

**Builder (`renderSection` cases):** each section is wrapped in `SectionFrame`.

**Layout widgets:** `widgets.tsx` cases render the same islands.

**Console:**
- `blocks/editors/shared.tsx` gains `LottiePath` and `ModelPath`. Each is a `CoverField` with `accept` (`.json,.lottie` / `.glb`) and a new `kind` prop passed through to `MediaBrowser` (`"lottie"` / `"model"`), plus a **"Or paste a link"** row: an input and an Add button that call `importMediaUrlAction(url)`, a Server Action that POSTs `/admin/media/import-url`, then set the field's path. The API's sentence is shown under the row on a refusal.
- `MediaBrowser`'s `kind` prop widens to `"image" | "file" | "lottie" | "model"`.
- Section editors and blank defaults: `lottie` → `{ size: "m", align: "center" }`, `model` → `{ height: "m", rotate: true }`.
- The layout editor maps field kinds `lottie`/`model` to the two path components.

**Elsewhere:** `types/page-sections.ts` types; `mock-api.mjs` section types and presenter.

**Probe:** `scripts/probes/motion-media.mjs`:
- **Setup:** uploads a small fixture Lottie JSON and a small `.glb` (both generated by the probe), builds a published builder page with both sections, and deletes everything after.
- **Lottie checks:** it plays when scrolled to (frame advances); Pause holds it when looping; reduced motion keeps it on frame 0.
- **Model checks:** the `<model-viewer>` element appears and `auto-rotate` is absent under reduced motion.
- **Page-wide checks:** no request leaves the site's own and asset origins; no console errors; no sideways scroll at 320.

## 4. Docs and release

- `docs/page-builder.md`, `docs/media.md` and the CLAUDE.md module lines.
- `API.md` (media types, `import-url`, both sections and widgets).
- The manual: the media chapter and the builder table. Then `npm run help`.
- `VERSION.md` and `version.ts` move to 0.172.0.

## Not in scope

- AR ("view in your room").
- Compressed models (Draco, meshopt, KTX2).
- Lottie as hero art or in empty states.
- Shortcodes in rich text.
- Scroll-scrubbed playback.
