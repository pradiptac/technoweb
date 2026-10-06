# The media library

*Who can use this: Content manager and Administrator. Content → Media settings: Administrator only.*

Every picture, video and document on your website lives in one place:
**Content → Media**. Wherever the console asks for an image — a blog cover, a
product picture, a slide, a logo — it opens this same library, where you can
pick an existing file or upload a new one.

## What you can upload

| Kind | Formats |
|---|---|
| Images | PNG, JPG, GIF, WebP, SVG |
| Video | MP4, WebM |
| Documents | PDF, Word (DOC, DOCX), Excel (XLS, XLSX), CSV, TXT, ZIP |

The size limits are shown on the screen under **Size limits**. By default an
image or document may be up to 5 MB, a video up to 20 MB, and an image no
larger than 50 megapixels; an administrator can change these under
**Content → Media settings**. Your hosting's own PHP
limits also apply — the settings screen shows them, and a limit set higher
than the server allows has no effect.

**SVG drawings** are cleaned when uploaded: anything that could run as a
script is removed. A file that cannot be read as a proper SVG is refused.

## Uploading

- Drag files from your computer onto the library, or press **Upload** and
  choose several at once. **Folder…** uploads every file inside a folder
  (its sub-folders are not kept). Each file shows its own progress bar.
- When you are **choosing** an image for a field and upload a single file, it
  is picked for you. Upload several and they simply join the library.
- Uploads are stored exactly as they arrive — your originals are never
  re-compressed.

## Finding files

- **Folders** on the left organise the library. *Unfiled* holds files in no
  folder. Deleting a folder **does not delete its files**; they return to
  Unfiled. You confirm a folder deletion by typing YES.
- **Search** looks at the file name, alt text, description and tags.
- The tabs along the top show **Images**, **Files** or **Recent** (last
  changed first); the bin icon at the right opens the **Bin**. **Sort by**
  upload date, last modified, file name or file size.
- The grid can be worked from the keyboard: arrow keys to move, Space to
  view, Enter to edit details, **x** to select, Delete to delete.

## Working with a file

Right-click a file (or use its menu) for:

| Action | What it does |
|---|---|
| View | A full-screen preview |
| Download | Downloads it under its human file name |
| Edit details | File name, alt text, description, tags, folder, focal point |
| Crop | Crop to a free shape or a fixed ratio (1:1, 4:3, 16:9 and so on) |
| Resize | A new width and height, and optional square thumbnails (90, 120 or 180 px) |
| Edit image | Rotate, flip, brightness, contrast, greyscale |
| Overwrite | Replace the file with a new upload at the same address |
| Delete | Move it to the Bin |

Select several files to **move**, **duplicate** or **delete** them together.

### Alt text

**Alt text** describes a picture for people who cannot see it and for search
engines. Write it once, in **Edit details**, and every page using that picture
uses it. Describe what the picture shows — "Rack of Cisco switches with blue
patch cables" — not the page it is on. Leave it empty only for purely
decorative images.

If the AI SEO assistant is switched on (**SEO → Settings**, chapter 13) and
an OpenRouter key is saved (**System → Settings → API keys**, chapter 18),
**Suggest alt text** in the same dialog proposes a
sentence for you to check and edit. It works on
photographs (JPG, PNG, WebP, GIF) under 4 MB. The picture itself is sent to
the AI service to be described. On a free Google key a refusal usually means
the minute's limit is used up: wait a moment and press it again.

### Description and tags

The **description** and **tags** are for your team only — they help you find
files and are never shown on the site. Do not use the description in place of
alt text.

### Focal point

Pictures are often cropped to fit a box — a wide banner, a square thumbnail.
The **focal point** says where the subject is, so every crop keeps it in view.
In **Edit details**, under **Focal point**, click the preview on the
important part (a crosshair marks it; arrow keys nudge it). **Reset to centre** clears it. Without one,
crops are centred.

## Editing changes the file everywhere

Crop, resize, edit and overwrite change the file **in place**, at the same
address, so every page using it shows the new version straight away. That is
usually what you want — fix a logo once and it is fixed everywhere.

If you want the edited version **as well as** the original, tick **Save as a
new file, keeping the original** in the crop or resize dialog. In **Edit
image** the same box makes the first change on a copy, and every later
change in that dialog goes to the copy.

### History

Before every in-place edit, the previous version is kept. **Edit image**
shows the **History** (the last ten versions) with a **Restore** button on
each, so a mistaken crop or rotation can be undone.

Image quality for the files the library produces (crops, resizes, thumbnails)
is set by an administrator under **Content → Media settings** (*Image
quality*, *Good* by default). It never re-compresses your uploads.

Resizing and cropping are for photographs. An SVG drawing has no pixel size to
change, and the console says so.

## The Bin

Deleting a file moves it to the **Bin**, and the file keeps working on the
site until it is deleted permanently. This matters because the library cannot
tell you which pages use a file: a deleted picture could leave a gap on a page
you forgot about.

- **Restore** puts it back at exactly the same address, so any page using it
  is whole again.
- **Delete permanently** removes the file and its history for good.
- **Empty the bin** does that for everything in it.

## Things to know

- The library cannot tell you where a file is used. Delete to the Bin first,
  check the site, and only then delete permanently.
- Edits change the file everywhere it appears; save as a copy if you want
  both.
- **Overwrite** must be the same kind of file (a PNG replaces a PNG).
- Alt text belongs to the file, so write it in the library, not on each page.
- Pictures pasted into the text editor are uploaded here, not stored inside
  the page.
- The 33 placeholder drawings that come with a demo install are SVGs; Google
  Shopping will not accept SVG product pictures, so replace them with real
  photographs.
