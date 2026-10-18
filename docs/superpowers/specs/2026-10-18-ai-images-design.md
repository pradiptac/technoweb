# AI images — design (B5, 0.184.0)

Date: 2026-10-18. Roadmap item B5 of the 2.0 plan (smart track), after 0.183.0
AI writing everywhere.

## Intent

An editor who needs a picture — a hero banner, a blog cover, a section
background — can describe it and get one, inside the picker they already use,
without leaving the console for an outside tool. A picture is always previewed
and never reaches the media library until the editor chooses it. The cost is
bounded by its own daily limit.

## The client's decisions

| Question | Answer |
|---|---|
| What it does | **A**: make new pictures from a description (no editing of existing pictures in this release) |
| Which service | **A**: OpenRouter, with the existing key |
| Where | **A**: a "Make with AI" tab inside the media picker, so every image field gets it |
| Switch and cost | **A**: the one AI switch (`seo_ai_enabled`), a separate `ai_image_daily_cap` (default 30) |
| How many | **A**: one picture per press in a chosen shape; "Try again" for another |
| Look and marking | **A**: a house picture style + a style choice; every saved picture tagged and described |
| Standing rules | **A**: no recognisable real people, no other companies' logos or trademarks, no lettering |
| Architecture | **1**: preview first (a temporary private file), then save through the normal upload path |

## What exists and is reused

- The OpenRouter key and pinning: `SeoAiSettings::apiKey()`,
  `OpenRouterProvider::routing()` (pin to the maker, no fallback).
- `App\Support\Media\MediaUploader` — the one path a file takes into the
  library: content check, size and megapixel limits, blur preview, metadata.
- `MediaBrowser` (`web/src/components/admin/media-browser.tsx`) — the dialog
  every image field opens; `lib/image-specs.ts` — what shape each field draws.
- The writing help's patterns: a status read per screen, a refusal as one
  sentence inside the dialog, an atomic per-day counter, the house style sent
  outside a fence, a probe that stubs the Server Action in the browser.

## API

### `App\Support\Images\ImageMaker`

The one implementation. `make(string $prompt, ImageStyle $style, ImageShape $shape, User $user): ImageResult`.

1. `ImageSettings::refusalFor()` — switched off (`SeoAiSettings::enabled()`),
   no key, cap 0, or the day's cap reached. One sentence or null.
2. The request text, in this order: the house picture style
   (`ai_image_style`), the style's own instruction, the three standing rules,
   then the editor's description inside a `---DESCRIPTION---` fence. The fence
   marker is stripped from the description until nothing changes.
3. `POST https://openrouter.ai/api/v1/images` with `model` (`ai_image_model`,
   default `google/gemini-2.5-flash-image`), `prompt`, `n: 1`,
   `aspect_ratio` from the shape, and the provider pinning the text calls use.
   90-second timeout. The request carries OpenRouter's attribution headers,
   as the text calls do.
4. The answer's `data[0].b64_json` is decoded. It is refused unless the bytes
   sniff as JPEG, PNG or WebP and are at most 8 MB. A 200 with no image, an
   `error` object, or undecodable data is a failure.
5. The bytes are written to the **private** disk at
   `ai-images/{token}.{ext}`, `{token}` 64 lower-case hex from `random_bytes`,
   with a small JSON sidecar holding the owner's user id, the prompt, the
   style, the shape, the model, the mime, width, height and the creation time.
6. `ImageSettings::countRun()` — once, only now, on the picture counter
   `ai:image:runs:<date>` (atomic: `Cache::add` with an expiry, then
   `Cache::increment`). Never the writing or SEO counter.

**`ImageShape`** (enum): `wide` 16:9, `landscape` 4:3, `square` 1:1,
`portrait` 3:4, `banner` 21:9 — each with a label and its `aspect_ratio`.
**`ImageStyle`** (enum): `photo`, `illustration`, `render` (3D render),
`flat` (flat graphic) — each with a label and a one-line instruction.

**The standing rules**, sent with every request and shown under the
description box: no recognisable real people or faces of real people; no
logos, trademarks or brand marks of any company; no words, letters, numbers
or lettering of any kind.

### Endpoints

All `role:content_manager` (the media library's role; an admin passes), in
`routes/api/admin-content-manager.php`, declared above `media/{id}`,
throttled 10/min.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/media/ai-image/status` | `{available, reason, used, cap, styles: [{value,label}], shapes: [{value,label,ratio}]}` |
| `POST` | `/admin/media/ai-image` | `{prompt (10–1000), style, shape}` → 201 `{data: {token, width, height, model, mime}}`; 422 `{message, errors: {image: [sentence]}}` for every refusal and failure |
| `GET` | `/admin/media/ai-image/{token}` | Streams the preview, `Cache-Control: private, no-store`, `nosniff`. 404 unless the token is 64 hex, exists, is under 10 minutes old and belongs to the caller |
| `POST` | `/admin/media/ai-image/{token}/keep` | `{folder_id?, alt_text? (≤ 255)}` → 201 with the media resource. Goes through `MediaUploader`; tags `ai-generated`; description "Made with AI (<model>) from: <prompt>"; alt text as sent, else the prompt's first sentence cut to 125 characters. Deletes the preview; a second keep is a 404 |
| `DELETE` | `/admin/media/ai-image/{token}` | Deletes the preview. 204, also for a token already gone |

`technoware:prune-ai-images` (every ten minutes) deletes previews older than
ten minutes; every read also refuses one that old.

### Refusals and failures

One sentence each, in `errors.image`, never OpenRouter's own words (logged
at `warning` with status and body excerpt):

- "AI help is switched off. Turn it on in SEO → Settings."
- "Add an OpenRouter API key in Settings → API keys first."
- "Pictures are switched off (the daily limit is 0)."
- "Today's limit of N pictures has been reached. It resets at midnight."
- "The image service would not make that picture. Try describing it differently." (a 400/403 or a content refusal)
- "The image service would not accept this site's AI settings. Ask an administrator to check the OpenRouter key and the picture model (SEO → Settings → Test this model)." (a 401, 402 or 404)
- "The image service did not answer in time. Try again." (timeout, 5xx)
- "The image service answered without a picture. Try again." (no image, bad bytes, too large)

### Settings (private `seo` group, `role:admin`)

- `ai_image_daily_cap` — 0–1,000, default 30; 0 means pictures are off.
- `ai_image_style` — ≤ 500 characters, plain text.
- `ai_image_model` — an OpenRouter id by shape (`maker/model`), default
  `google/gemini-2.5-flash-image`. `POST /admin/media/ai-image/test`
  (`role:admin`, throttled 6/min) makes one small square picture with the
  saved key and model, counts it, deletes it, and answers 200 or a 422 in
  OpenRouter's own words — the model test's rule.

Shape checks through `ImageSettings::refusalFor()` in `SettingController`'s
refusal chain, as the writing settings do.

## Web

- `types/media-ai.ts`; `lib/admin/media-ai.ts` (server-only) and Server
  Actions `imageStatusAction`, `makeImageAction`, `keepImageAction`,
  `discardImageAction`; the preview is drawn through a route handler
  `GET /api/admin/media/ai-image/[token]` that streams the API's preview with
  the staff token, `no-store` — never a public URL.
- `components/admin/media/make-with-ai.tsx` (client): the description box
  with the standing rules under it, Style and Shape chips, **Make picture**
  (`Button pending`, a line "This can take up to a minute"), the preview,
  an alt-text box filled from the description, **Use this picture**,
  **Try again**, **Discard**, a refusal `Alert` inside the dialog, and the
  footer "N of CAP pictures used today" (`Intl.NumberFormat("en-IN")`).
- `MediaBrowser` gains a "Make with AI" tab, drawn only while the status says
  available (one status read per dialog open). When the browser is opened with
  an image spec, the nearest shape is pre-selected (by ratio). **Use** keeps
  the picture and hands it to `onPick` exactly as a one-file upload does
  (`url` and `path`), so the field fills and the dialog closes. Closing the
  dialog with an unused preview discards it.
- The media library screen draws the same component in its upload area; Use
  there refreshes the grid with the new file first.
- The three settings rows on SEO → Settings (`settings-copy.ts`), beside the
  writing rows, with the "Test this model" button for `ai_image_model`.
- Glyphs from `icons-ui.tsx`; no client import of `@/components/icons`; no
  `toLocaleString`; the mock answers the status as unavailable and the other
  routes with the off refusal.

## What leaves the server

The house picture style, the style instruction, the three standing rules and
the editor's description. No record's content, no customer data, no existing
picture (no reference images in this release).

## Testing

`Http::fake` for OpenRouter under `preventStrayRequests()`; no real call.

- The request body: house style, style instruction and standing rules
  outside the fence, the description inside it with the marker stripped,
  `aspect_ratio` per shape, `n: 1`, the pinned provider, the model setting.
- Each refusal and failure is its own one-sentence 422.
- Counted only on a decoded picture; nothing on a failure or a refusal; the
  writing and SEO counters untouched; the cap at 0; the cap reached.
- Non-image bytes and an oversized answer refused.
- The token: unknown, another user's and expired are 404; keep then keep
  again is a 404; discard deletes the file; the prune deletes old previews.
- Keep: through `MediaUploader` (a media row with the blur preview), tag
  `ai-generated`, description with model and prompt, alt text as sent or
  from the prompt.
- Roles: content manager allowed, admin passes, a support engineer and a
  customer token refused.
- `scripts/probes/ai-image.mjs`: opens a blog post's cover picker, checks the
  tab and the pre-selected shape, stubs `makeImageAction`/`keepImageAction`
  in the browser so nothing is paid for, presses Use and checks the field
  filled; with AI off, checks there is no tab.
- Audits (light, dark, mobile) on a post form and `/admin/media`, with a
  throwaway administrator.

## Not in this release

- Editing existing pictures: background removal, extending, upscaling,
  relighting.
- Reference images, several options per press, video.
- Any picture made without an editor pressing the button.
- A per-staff limit.

## Release

0.184.0: `docs/ai-images.md`, a CLAUDE.md module block, an API.md section,
`manual/34-ai-images.md` with its README row and the help regeneration,
VERSION.md and `version.ts`, the full suite once.
