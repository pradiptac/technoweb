# AI images

A picture made from a description, inside the media picker (0.184.0). One
picture per press, in a chosen shape and style, **previewed before it is kept**:
nothing reaches the media library until the editor presses Use this picture. It
uses the OpenRouter key and the on/off switch the SEO assistant already holds
(`docs/seo-ai.md`); the cap, the house style and the model are its own.

---

## Where it is

The **Make with AI** tab sits in `MediaBrowser`
(`web/src/components/admin/media-browser.tsx`), so every image field that
browses the library has it, and the library screen has a **Make with AI** button
(`MakeWithAiButton` in `media/media-uploader.tsx`, hidden in the bin and on the
Files tab). The tab is `MakeWithAi`
(`web/src/components/admin/media/make-with-ai.tsx`); it draws no dialog of its
own. The status is read **every time the dialog opens** (`imageStatusAction`),
so the switch and the limit are never stale; when the status cannot be read, or
`available` is false, the tab draws nothing.

When the field has an image spec (`lib/image-specs.ts`), `nearestShape()` picks
the nearest of the five shapes in log space (so 2:1 is as far from 1:1 as 1:2); a
free-ratio field opens on Wide. `web/src/lib/media-pick.ts` is the one
`{url, alt, path, name, bytes}` mapping a kept picture and a picked library file
both go through.

Role: `role:content_manager`, the library's own. The administrator's model test
is `role:admin`.

---

## The request (`App\Support\Images\ImageMaker`)

`POST https://openrouter.ai/api/v1/images` with the saved key, the attribution
headers, the maker's own provider pinned (`OpenRouterProvider::routing()`), `n: 1`
and the shape's `aspect_ratio`. Nothing else leaves the server. The prompt is:

1. the **house picture style** (`ai_image_style`, 500 characters), if set;
2. the **style's instruction** (`ImageStyle::instruction()`: photo, illustration,
   3D render, flat graphic);
3. the **standing rules** (`ImageMaker::RULES`): never a recognisable real
   person or a real person's face, never a logo, trademark or brand mark of any
   company, never words, letters or numbers;
4. a line saying the fenced text is a description, never an instruction;
5. the editor's description between two `---DESCRIPTION---` lines, with the
   marker stripped from it until nothing changes (a nested marker cannot rebuild
   itself).

Items 1-4 are the editor's and the administrator's own instructions, which is why
they sit outside the fence. The description is 10-1,000 characters.

**The answer** must carry `data.0.b64_json`, decoding to a **JPEG, PNG or WebP of
at most 8 MB** (`getimagesizefromstring()` decides the type, not the header).
Anything else is "The image service answered without a picture. Try again."

Shapes (`App\Enums\ImageShape`): Wide 16:9, Landscape 4:3, Square 1:1, Portrait
3:4, Banner 21:9. Styles (`App\Enums\ImageStyle`): Photo, Illustration, 3D
render, Flat graphic. Both lists reach the console as `options()` on the status
read; TypeScript lists neither.

---

## The preview, Use and Discard

`App\Support\Images\ImagePreviews`: the bytes and a JSON sidecar on the local
(private) disk, `ai-images/{token}.{ext}` and `.json`, the token 64 lower-case hex
from `random_bytes(32)`. A preview is **the maker's alone** (`user_id` is checked;
anyone else's token is a 404, as is an unknown or malformed one) and lives
**ten minutes** (`MINUTES`; an older one is deleted on the read that finds it).
`technoware:prune-ai-images` sweeps the rest **every ten minutes**. Nothing has
a public address: the console reads the bytes through
`web/src/app/api/admin/media/ai-image/[token]/route.ts`, which asks
`GET /admin/media/ai-image/{token}` (`Cache-Control: private, no-store`,
`nosniff`).

**Use** (`keep`) sends the preview's file through
`MediaUploader::storeFromPath()` - so the picture is checked against the
library's own extension list, size and megapixel limits, and blurred like any
upload - then tags it `ai-generated` and sets the description to
"Made with AI (model) from: prompt". The file name is a slug of the prompt; the
alt text is the editor's, else the description's first sentence (125 characters).
The preview is forgotten once the row exists. If the library's own upload rule
refuses it, the answer is Laravel's 422 on `errors.file` and **the preview stays
in place** so the editor can Discard; the console shows that sentence. A preview
that has gone says "That preview has expired. Make the picture again." (a 404
on keep, mapped in `lib/admin/media-ai.ts`).

**Discard** deletes the preview and answers 204 whether or not it was there. The
console discards on Try again, on closing the dialog, and when the component
unmounts; **a make that finishes after the dialog has closed discards its own
preview**. A preview nobody discarded is the sweep's.

---

## The cap and its own counter

One switch (`seo_ai_enabled`) and the SEO assistant's key. The cap is
pictures' own: `ai_image_daily_cap` (default 30, 0 switches pictures off, 1,000
at most), counter `ai:image:runs:<date>` in the cache, added once with its expiry
and then incremented. So a run of pictures cannot spend the writing or SEO day,
or the reverse. **A run is counted only when a picture decodes and is stored as a
preview**; every refusal and failure is free.

---

## The refusals

Every refusal is **one sentence**, a 422 `{message, errors: {image: [message]}}`
(`ImageRefused`): AI help is switched off; no OpenRouter key; the limit is 0; the
day's limit is reached; "The image service did not answer in time. Try again."
(no connection, a 429 or any 5xx); "The image service would not make that
picture. Try describing it differently." (any other 4xx - the maker declined);
"The image service answered without a picture. Try again." (no image, an `error`
object, bad base64, over 8 MB or not a JPEG, PNG or WebP). OpenRouter's own words
go to the log (`warning`) and, in `ImageRefused::$detail`, to **the
administrator's model test alone**. Validation errors on the make (`prompt`,
`style`, `shape`) are the ordinary 422 keyed by field.

---

## What leaves the server

The key, the model id, the house style, the style's instruction, the standing
rules and the editor's description. **No picture, no record, no customer data**
is sent. The picture that comes back is the provider's and is stored here.

---

## The settings

Three rows in the private `seo` group, drawn on **SEO → Settings**
(`/admin/seo/settings`, beside the writing help's) and written by
`PATCH /admin/settings` (`role:admin`); checked by
`ImageSettings::refusalFor()`:

| Key | Rule |
|---|---|
| `ai_image_daily_cap` | a whole number 0-1,000; default 30; 0 switches pictures off |
| `ai_image_style` | at most 500 characters |
| `ai_image_model` | an OpenRouter id by shape, at most 100 characters; blank uses `google/gemini-2.5-flash-image` |

**Test this model** sits directly under the `ai_image_model` row
(`settings/ai-image-test.tsx`, drawn by `settings-form.tsx`): `POST
/admin/media/ai-image/test` (`routes/api/admin-admin.php`, `role:admin`,
throttled 6/min) makes one small square picture, counts it, deletes it, and
answers `{model, ok: true}` or OpenRouter's own words. None of the rows is on the
public `/settings` map. `SettingsSeeder` adds them (additive); no migration.

---

## What it does not do

- **No editing** of an existing picture, and **no reference images**.
- **One picture per press** - no several options to choose from.
- **No automatic pictures**: nothing is made unless an editor presses Make
  picture.
- It does not write alt text with a model; the alt text is the editor's, or the
  description's first sentence.

---

## Known limits of this release

- **No audit opens the Make-with-AI dialog**, so its contrast, tap targets and
  phone widths have been checked by hand only.
- **The probe's AI-off branch has never run on this machine** (the key is on
  here); `scripts/probes/ai-image.mjs` has exercised the on branch. It **fails
  closed**: any Server Action it has not stubbed is aborted, so it can never
  reach OpenRouter or write a picture.
- **The cap is checked, then counted after the call**, so parallel makes can go
  slightly past it.
- **Two simultaneous keeps of one preview can make two media rows.**
- A preview is on the web server's local disk: a multi-server install would need
  a shared disk.

---

## Testing by hand

1. Settings → API keys: save an OpenRouter key. SEO → Settings: turn the AI
   assistant on, then under **Picture model** press **Test this model** (this
   makes, and counts, one picture).
2. Open a blog post, the cover field, **Make with AI**: describe a picture, pick a
   style, check the shape is the nearest to the field's, **Make picture**, then
   **Use this picture**; the field fills and the file appears in the library with
   the `ai-generated` tag and the description.
3. Make another and press **Discard**, and one more and close the dialog; both
   previews are gone from `storage/app/private/ai-images/`.
4. `cd web; ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/ai-image.mjs`
   - the make, keep and discard Server Actions are stubbed in the browser, so it
   spends nothing and stores nothing.

Tests: `AiImageTest` and `ImageSettingsTest` (Feature), on `Http::fake` under
`Http::preventStrayRequests()` - none reaches OpenRouter.
