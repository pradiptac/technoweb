<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MediaResource;
use App\Models\Media;
use App\Support\ImageEditor;
use App\Support\MediaHistory;
use App\Support\SvgSanitiser;
use App\Support\UploadLimits;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The media library. Behind auth:sanctum + role:content_manager.
 *
 * These files are public by design — cover images, logos, og:image and the
 * datasheets the Files tab holds — which is the opposite of ticket
 * attachments, and the reason they go to the `public` disk rather than
 * `local`. Nothing private belongs here: the allowlist decides what is safe
 * to hand to a visitor, not merely what is safe to store.
 */
class MediaController extends Controller
{
    /**
     * What the library accepts, as one list.
     *
     * Stated once and used twice — by the upload rule and by the console's
     * info panel — because a screen telling an editor which formats are
     * allowed, from a second list, is a screen that lies the first time
     * somebody widens one of them.
     *
     * Still an allowlist rather than "anything not executable": these land on
     * the public disk and are served straight back to browsers, so the
     * question is what is safe to hand a visitor, not what is safe to store.
     */
    public const ALLOWED_EXTENSIONS = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
        'mp4', 'webm',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $media = Media::query()
            ->with('uploader')
            // Filename *and* alt text. A hashed stored name is meaningless to
            // search, the human filename is often "img_4821", and the alt text
            // is the one field that says what the picture actually shows —
            // which is what someone hunting for a photograph types.
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%'.$request->string('q')->value().'%';
                $q->where(fn ($w) => $w->where('filename', 'like', $term)
                    ->orWhere('alt_text', 'like', $term)
                    ->orWhere('description', 'like', $term)
                    // LIKE against the raw JSON. A tag is a short token in a
                    // small array, so this finds it; the alternative is
                    // JSON_SEARCH, which is MySQL-only and buys nothing at
                    // this size. It needs replacing at five figures, along
                    // with the rest of this LIKE-based search.
                    ->orWhere('tags', 'like', $term));
            })
            // `folder=unfiled` is not the same as no folder parameter: one
            // means "the files in no folder", the other means "everything".
            ->when($request->input('folder') === 'unfiled', fn ($q) => $q->whereNull('folder_id'))
            ->when($request->filled('folder') && $request->input('folder') !== 'unfiled',
                fn ($q) => $q->where('folder_id', $request->integer('folder')))
            ->when($request->input('kind') === 'image', fn ($q) => $q->where('mime', 'like', 'image/%'))
            ->when($request->input('kind') === 'file', fn ($q) => $q->where('mime', 'not like', 'image/%'))
            /*
             * The bin is a view of the same table, not a second screen.
             *
             * `?trashed=1` shows only deleted rows; everything else shows only
             * live ones, which is the default `SoftDeletes` behaviour and the
             * reason this is one line rather than a parallel endpoint.
             */
            ->when($request->boolean('trashed'), fn ($q) => $q->onlyTrashed())
            ->tap(fn ($q) => $this->applySort($q, $request))
            /*
             * Ten by default, and the console is the only caller that takes
             * the default — the pickers ask for their own size.
             *
             * A page of thumbnails is not a page of table rows: each one
             * carries an image over the wire, so the default decides how much
             * of a library somebody downloads to glance at it. The size
             * control offers 10/25/50/100 and lives in the URL, so anyone
             * working through a large library sets it once and keeps it.
             */
            ->paginate(min($request->integer('per_page', 10), 100))
            ->withQueryString();

        /*
         * Facts about the library, alongside the page of it being shown.
         *
         * On the collection rather than a second endpoint: the console renders
         * them in the same panel as the grid, and a separate request for six
         * numbers would be a round trip per page change for something that
         * barely moves.
         */
        return MediaResource::collection($media)->additional([
            'meta' => [
                'library' => [
                    'images' => Media::where('mime', 'like', 'image/%')->count(),
                    'files' => Media::where('mime', 'not like', 'image/%')->count(),
                    'trashed' => Media::onlyTrashed()->count(),
                    'bytes' => (int) Media::sum('size'),
                    'extensions' => self::ALLOWED_EXTENSIONS,
                    'max_kb' => UploadLimits::maxKb(),
                    'max_video_kb' => UploadLimits::maxKb(true),
                    'php_ceiling_kb' => UploadLimits::phpCeilingKb(),
                    'max_megapixels' => UploadLimits::maxMegapixels(),
                ],
            ],
        ]);
    }

    /**
     * Ordering, from a whitelist.
     *
     * An unrecognised `sort` falls back to the default rather than returning
     * 422 — the same rule the catalogue's `?sort=` follows, and for the same
     * reason: this arrives from a bookmark or a stale tab, and an error page
     * is a worse answer than the library's own order.
     *
     * **Every ordering ends on `id`, and that is not decoration.** Thirty
     * files uploaded by the same seeder share a timestamp to the second, and
     * MySQL is free to order equal rows differently between two queries — so
     * without a tiebreak a page boundary shows one file twice and hides
     * another. The catalogue's index already carries this note; a library
     * whose rows are all created in one run is where it actually bites.
     */
    private function applySort(Builder $query, Request $request): void
    {
        $columns = [
            'created_at' => 'created_at',
            'filename' => 'filename',
            'size' => 'size',
            'updated_at' => 'updated_at',
        ];

        $column = $columns[$request->input('sort')] ?? 'created_at';

        // Newest and largest first are what you want by default; A-Z is what
        // you want from a name. So the default direction depends on the
        // column rather than being a constant somebody has to correct.
        $default = $column === 'filename' ? 'asc' : 'desc';
        $direction = in_array($request->input('direction'), ['asc', 'desc'], true)
            ? $request->input('direction')
            : $default;

        $query->orderBy($column, $direction)->orderBy('id', $direction);
    }

    public function store(Request $request): JsonResponse
    {
        // The setting, clamped to what PHP will accept. See UploadLimits for
        // why the effective limit is a minimum across three ceilings.
        $maxKb = UploadLimits::maxKb();
        $maxVideoKb = UploadLimits::maxKb(true);

        // Which limit applies is decided by what was actually sent, before
        // validation, so the rule can carry the right number and the message
        // can quote it.
        $isVideo = in_array(
            strtolower($request->file('file')?->getClientOriginalExtension() ?? ''),
            ['mp4', 'webm'], true,
        );

        /*
         * Documents as well as images, so the library's Files tab has
         * something to hold — datasheets are the reason it exists.
         *
         * Still an allowlist rather than "anything that is not executable".
         * These land on the public disk and are served straight back to
         * browsers, so the question is not whether a type is dangerous to
         * store but whether it is safe to hand to a visitor.
         *
         * **SVG is the one entry here a browser treats as a document**, and
         * this comment claimed for a long time that it was excluded while the
         * rule four lines below accepted it. It is accepted — vector is the
         * format logos and icons arrive in, and all 33 placeholder images in
         * this library are SVG — and it goes through `SvgSanitiser` before it
         * is written. Same boundary `HtmlSanitiser` draws for a CMS body:
         * sanitise on write, at the sink, once.
         *
         * `zip` is here deliberately and is a different question. A browser
         * downloads it rather than running it, and a bundle of datasheets is a
         * real thing an editor has to publish. It is *not* the same call as
         * the careers form, which refuses archives because that upload is open
         * to the internet; this one is behind a content-manager session.
         */
        $validated = $request->validate([
            'file' => [
                'required', 'file',
                'mimes:'.implode(',', self::ALLOWED_EXTENSIONS),
                'max:'.($isVideo ? $maxVideoKb : $maxKb),
            ],
            'alt_text' => ['nullable', 'string', 'max:255'],
            'folder_id' => ['nullable', 'integer', 'exists:media_folders,id'],
        ], [
            'file.mimes' => 'Upload an image (PNG, JPG, GIF, WebP, SVG), a video (MP4, WebM) or a document (PDF, Word, Excel, CSV, TXT, ZIP).',
            'file.max' => 'That file is over the '.round(($isVideo ? $maxVideoKb : $maxKb) / 1024).' MB limit.',
        ]);

        $file = $request->file('file');

        /*
         * Sanitised before it is stored, never after.
         *
         * The gap between writing a file to a public disk and cleaning it up
         * is a gap in which the URL is live and fetchable. This closes it by
         * never opening it: the bytes that reach the disk are already the
         * sanitised ones. A file the parser cannot read is refused rather than
         * repaired — there is no safe reading of markup nothing agrees on how
         * to parse.
         */
        $svg = null;

        /*
         * The detected type as well as the name.
         *
         * `mimes:` already refuses a mismatch between the two, so an SVG named
         * `.png` never reaches here — but the check that decides whether to
         * sanitise should not be the client's filename alone. Asking both
         * means a future change to the allowlist cannot quietly create a
         * spelling that skips this.
         */
        if (strtolower($file->getClientOriginalExtension()) === 'svg'
            || str_contains((string) $file->getMimeType(), 'svg')) {
            $svg = SvgSanitiser::clean((string) file_get_contents($file->getRealPath()));

            if ($svg === null) {
                throw ValidationException::withMessages([
                    'file' => 'That SVG could not be read as valid XML, so nothing can check it for anything a browser would run.',
                ]);
            }
        }

        /*
         * Resolution is checked before anything is written.
         *
         * `getimagesize` reads the header only — it does not decode the image,
         * which is the entire point: decoding is the expensive step this is
         * protecting. A well-compressed 12000x9000 JPEG sits inside the size
         * limit and costs GD roughly 4 bytes per pixel once opened, which is
         * past `memory_limit` and ends the request with a fatal error rather
         * than a message anybody can act on.
         *
         * Refused rather than downscaled: silently shrinking somebody's
         * original is a decision about their file that they did not make, and
         * the resize tools are right there.
         */
        if ($svg === null) {
            [$probeWidth, $probeHeight] = @getimagesize($file->getRealPath()) ?: [null, null];

            if ($probeWidth && $probeHeight) {
                $megapixels = ($probeWidth * $probeHeight) / 1_000_000;
                $maxMegapixels = UploadLimits::maxMegapixels();

                if ($megapixels > $maxMegapixels) {
                    throw ValidationException::withMessages([
                        'file' => sprintf(
                            'That image is %s x %s (%.1f megapixels), over the %s megapixel limit. '
                            .'Scale it down before uploading.',
                            $probeWidth, $probeHeight, $megapixels, rtrim(rtrim(number_format($maxMegapixels, 1), '0'), '.'),
                        ),
                    ]);
                }
            }
        }

        // Hashed name on a dated path: the original filename is metadata only,
        // so a crafted name cannot influence where the file lands.
        $path = $svg === null
            ? $file->store('media/'.now()->format('Y/m'), 'public')
            : $this->putSanitisedSvg($svg);

        // getimagesize only understands raster formats; SVG has no intrinsic
        // pixel size, so both stay null rather than being guessed at.
        [$width, $height] = @getimagesize($file->getRealPath()) ?: [null, null];

        $media = Media::create([
            'uploaded_by' => $request->user()->id,
            'folder_id' => $validated['folder_id'] ?? null,
            'disk' => 'public',
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize(),
            'width' => $width,
            'height' => $height,
            'alt_text' => $validated['alt_text'] ?? null,
        ]);

        return response()->json(['data' => new MediaResource($media)], 201);
    }

    /**
     * Rename, re-describe, or move to another folder.
     *
     * The stored path is never touched. `filename` is metadata — the file on
     * disk keeps its hashed name, so renaming cannot break a record that
     * already references the path, and cannot be used to steer where a file
     * lives.
     */
    public function update(Request $request, Media $medium): JsonResponse
    {
        $data = $request->validate([
            'filename' => ['sometimes', 'string', 'max:255'],
            'alt_text' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'folder_id' => ['sometimes', 'nullable', 'integer', 'exists:media_folders,id'],
            'tags' => ['sometimes', 'nullable', 'array', 'max:25'],
            /*
             * Nullable, because a blank entry is noise rather than an error.
             *
             * Laravel's ConvertEmptyStringsToNull turns '' into null before
             * validation, so a plain 'string' rule answers 422 for a stray
             * comma — "hero,,networking" would refuse the whole save and name
             * `tags.1` while doing it. Dropped in the normalisation below
             * instead, which is the same call the form builder makes for a key
             * no field declares.
             */
            'tags.*' => ['nullable', 'string', 'max:40'],
        ]);

        /*
         * Tags are normalised here rather than trusted as sent.
         *
         * They are typed by hand into one field, so "Hero", "hero " and "hero"
         * arrive as three labels that filter as three different things and
         * read as one mistake. Trimmed, lowercased, blanks dropped and
         * de-duplicated — with the order kept, because an editor putting the
         * most important label first meant it.
         */
        if (array_key_exists('tags', $data)) {
            $data['tags'] = collect($data['tags'] ?? [])
                ->map(fn ($tag) => Str::lower(trim((string) $tag)))
                ->filter()
                ->unique()
                ->values()
                ->all();
        }

        $medium->fill($data)->save();

        return response()->json(['data' => new MediaResource($medium->fresh('uploader'))]);
    }

    /**
     * Move a selection into a folder, or out of every folder.
     *
     * A folder is a label rather than a location: `folder_id` is a column on
     * the row and nothing on disk moves, so this cannot break a stored path.
     * That is the same property `nullOnDelete` relies on when a folder is
     * deleted and its files become Unfiled.
     *
     * `folder_id: null` is a real instruction here, not an omitted one —
     * "take these out of their folder" has to be expressible or the only way
     * out of a folder is deleting it.
     */
    public function move(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer'],
            'folder_id' => ['present', 'nullable', 'integer', 'exists:media_folders,id'],
        ]);

        $moved = Media::query()
            ->whereIn('id', $data['ids'])
            ->update(['folder_id' => $data['folder_id']]);

        /*
         * A mass update is right here, and that is worth saying because this
         * project has twice insisted on the opposite.
         *
         * `Media` has no model events — nothing recomputes a path, writes a
         * redirect or deletes a file when `folder_id` changes. The landing-page
         * repath and the CV prune go one row at a time precisely *because*
         * their events are the work; borrowing that rule where there are no
         * events would be 200 queries bought with nothing.
         */
        return response()->json(['data' => ['moved' => $moved]]);
    }

    /**
     * Duplicate a selection, bytes and all.
     *
     * A real copy of the file rather than a second row pointing at one path:
     * two rows sharing a path is a delete that silently breaks the other, and
     * a crop that silently edits it. The library has no concept of a reference
     * count and should not grow one for this.
     *
     * The copy keeps the original's metadata — alt text, description, tags —
     * because a duplicate is nearly always about to become a variant of the
     * same picture, and retyping a description is how a library ends up with
     * three descriptions of one thing.
     */
    public function copy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:50'],
            'ids.*' => ['integer'],
            'folder_id' => ['sometimes', 'nullable', 'integer', 'exists:media_folders,id'],
        ]);

        $copies = [];

        foreach (Media::query()->whereIn('id', $data['ids'])->get() as $original) {
            $copy = $this->duplicate(
                $original,
                $request->user()->id,
                // Named rather than defaulted: a copy lands where it was asked
                // to, and beside the original when nobody said.
                array_key_exists('folder_id', $data) ? $data['folder_id'] : $original->folder_id,
            );

            // A file the database knows about and the disk does not is a row
            // that would copy to nothing. Skipped rather than failing the
            // batch: one missing file must not stop the other forty-nine.
            if ($copy) {
                $copies[] = $copy;
            }
        }

        return response()->json([
            'data' => MediaResource::collection(collect($copies)->map->load('uploader')),
        ], 201);
    }

    /**
     * Move a selection to the bin.
     *
     * A mass `delete()` is correct here *now*, and was not before: this used
     * to remove each file from disk, which is work that only a loop can do.
     * Soft-deleting is a column write and `Media` has no delete events, so the
     * one-row-at-a-time rule buys nothing — the same test the move endpoint
     * applies.
     *
     * The files stay. Deleting them here while only soft-deleting the row
     * would make every restore bring back a record pointing at nothing, which
     * is worse than not offering a bin at all.
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer'],
        ]);

        $deleted = Media::query()->whereIn('id', $data['ids'])->delete();

        return response()->json(['data' => ['deleted' => $deleted]]);
    }

    /**
     * One file and its row, duplicated. Returns null if the file has gone.
     *
     * Shared by the bulk copy and by the `as_copy` option on the editing
     * endpoints, so "a duplicate" means the same thing however it is asked
     * for — same naming, same metadata carried across, same fresh hashed path.
     */
    private function duplicate(Media $original, ?int $userId, ?int $folderId): ?Media
    {
        $disk = Storage::disk($original->disk);

        if (! $disk->exists($original->path)) {
            return null;
        }

        $extension = pathinfo($original->path, PATHINFO_EXTENSION);
        $path = 'media/'.now()->format('Y/m').'/'.Str::random(40).($extension ? '.'.$extension : '');

        $disk->copy($original->path, $path);

        return Media::create([
            'uploaded_by' => $userId,
            'folder_id' => $folderId,
            'disk' => $original->disk,
            'path' => $path,
            'filename' => $this->copyName($original->filename),
            'mime' => $original->mime,
            'size' => $original->size,
            'width' => $original->width,
            'height' => $original->height,
            'alt_text' => $original->alt_text,
            'description' => $original->description,
            'tags' => $original->tags,
        ]);
    }

    /**
     * Which row an edit should be written to.
     *
     * Every editing endpoint rewrites the file in place by default, because
     * the path is the identity records store and keeping it is what lets an
     * edit reach every page already using the image. `as_copy` is the other
     * intent — "I want the cropped version *as well*" — and it has to be a
     * choice rather than a rule, since each answer silently ruins the other
     * case: editing in place when a copy was wanted destroys the original, and
     * copying when a replacement was wanted leaves every page showing the
     * old one.
     */
    private function targetFor(Media $medium, Request $request): Media
    {
        if (! $request->boolean('as_copy')) {
            return $medium;
        }

        return $this->duplicate($medium, $request->user()?->id, $medium->folder_id) ?? $medium;
    }

    /**
     * "photo.jpg" becomes "photo copy.jpg", then "photo copy 2.jpg".
     *
     * The extension is preserved rather than appended to, because the filename
     * here is a label an editor reads — "photo.jpg copy" is what a naive
     * concatenation produces and it looks like a mistake every time.
     */
    private function copyName(string $filename): string
    {
        $extension = pathinfo($filename, PATHINFO_EXTENSION);
        $stem = pathinfo($filename, PATHINFO_FILENAME);
        $suffix = $extension ? '.'.$extension : '';

        $candidate = $stem.' copy'.$suffix;
        $n = 2;

        while (Media::where('filename', $candidate)->exists()) {
            $candidate = $stem.' copy '.$n.$suffix;
            $n++;
        }

        return $candidate;
    }

    /**
     * Resize the file in place, and optionally cut square thumbnails from it.
     *
     * A thumbnail becomes its own media row rather than a hidden variant of
     * this one: the point of making one is to use it somewhere, and anything
     * the library cannot list is something an editor cannot reach.
     *
     * The resize itself scales the whole frame, because the caller named exact
     * dimensions. The thumbnails crop to square instead — see cover().
     */
    public function resize(Request $request, Media $medium): JsonResponse
    {
        $data = $request->validate([
            'width' => ['required', 'integer', 'min:1', 'max:6000'],
            'height' => ['required', 'integer', 'min:1', 'max:6000'],
            'thumbnails' => ['sometimes', 'array'],
            'thumbnails.*' => ['integer', Rule::in([90, 120, 180])],
            // Write to a duplicate instead of over the original. See targetFor.
            'as_copy' => ['sometimes', 'boolean'],
        ]);

        if (! ImageEditor::isResizable((string) $medium->mime)) {
            return response()->json([
                'message' => 'Only JPG, PNG, GIF and WebP can be resized. An SVG has no pixel size to change.',
            ], 422);
        }

        $target = $this->targetFor($medium, $request);

        /*
          Archived **before** the edit, because afterwards the previous bytes
          are gone and there is nothing left to copy. Skipped when writing to a
          copy: the copy has no history of its own yet, and the original is
          untouched, so there is nothing to undo.
        */
        if ($target->is($medium)) {
            MediaHistory::snapshot($medium, 'resize', $request->user()?->id);
        }

        $disk = Storage::disk($target->disk);
        $absolute = $disk->path($target->path);

        try {
            [$w, $h, $bytes] = ImageEditor::resize($absolute, $absolute, $data['width'], $data['height']);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $target->update(['width' => $w, 'height' => $h, 'size' => $bytes]);

        $created = [];

        foreach (array_unique($data['thumbnails'] ?? []) as $size) {
            $extension = pathinfo($target->path, PATHINFO_EXTENSION);
            $thumbPath = 'media/'.now()->format('Y/m').'/'.Str::random(40)."-{$size}x{$size}.{$extension}";
            $thumbAbsolute = $disk->path($thumbPath);

            @mkdir(dirname($thumbAbsolute), 0775, true);

            try {
                // cover(), not resize(): a square thumbnail of a 4:3 photo has
                // to crop to square, and scaling the whole frame into one
                // squashes everything in it. A circle in an 800x400 source
                // came out as an ellipse half as wide as it was tall.
                [, , $thumbBytes] = ImageEditor::cover($absolute, $thumbAbsolute, $size, $size);
            } catch (\RuntimeException $e) {
                continue;
            }

            $created[] = Media::create([
                'uploaded_by' => $request->user()->id,
                'folder_id' => $medium->folder_id,
                'disk' => $target->disk,
                'path' => $thumbPath,
                'filename' => pathinfo((string) $target->filename, PATHINFO_FILENAME)."-{$size}x{$size}.".$extension,
                'mime' => $target->mime,
                'size' => $thumbBytes,
                'width' => $size,
                'height' => $size,
                'alt_text' => $target->alt_text,
            ]);
        }

        return response()->json([
            'data' => new MediaResource($target->fresh('uploader')),
            'thumbnails' => MediaResource::collection($created),
        ]);
    }

    /**
     * Crop the image to a rectangle, optionally scaling the result.
     *
     * Coordinates are in the image's own pixels, so the client has to map
     * whatever it drew on screen back to natural size before sending — the
     * displayed image is almost never at 1:1.
     *
     * Replaces the file, like resize does, and the dialog says so. The
     * alternative is a library that doubles in size every time somebody
     * straightens a photograph.
     */
    public function crop(Request $request, Media $medium): JsonResponse
    {
        $data = $request->validate([
            'x' => ['required', 'integer', 'min:0', 'max:20000'],
            'y' => ['required', 'integer', 'min:0', 'max:20000'],
            'width' => ['required', 'integer', 'min:1', 'max:20000'],
            'height' => ['required', 'integer', 'min:1', 'max:20000'],
            'out_width' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:6000'],
            'out_height' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:6000'],
            // Write to a duplicate instead of over the original. See targetFor.
            'as_copy' => ['sometimes', 'boolean'],
        ]);

        if (! ImageEditor::isResizable((string) $medium->mime)) {
            return response()->json([
                'message' => 'Only JPG, PNG, GIF and WebP can be cropped. An SVG has no pixels to cut.',
            ], 422);
        }

        $target = $this->targetFor($medium, $request);

        /*
          Archived **before** the edit, because afterwards the previous bytes
          are gone and there is nothing left to copy. Skipped when writing to a
          copy: the copy has no history of its own yet, and the original is
          untouched, so there is nothing to undo.
        */
        if ($target->is($medium)) {
            MediaHistory::snapshot($medium, 'crop', $request->user()?->id);
        }

        $disk = Storage::disk($target->disk);
        $absolute = $disk->path($target->path);

        try {
            [$w, $h, $bytes] = ImageEditor::crop(
                $absolute, $absolute,
                $data['x'], $data['y'], $data['width'], $data['height'],
                $data['out_width'] ?? null, $data['out_height'] ?? null,
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $target->update(['width' => $w, 'height' => $h, 'size' => $bytes]);

        return response()->json(['data' => new MediaResource($target->fresh('uploader'))]);
    }

    /**
     * Turn, mirror and adjust — the three edits that are not a crop.
     *
     * One endpoint rather than three, because they share every line except
     * which `ImageEditor` call runs: the same raster check, the same
     * write-in-place, the same row update. Three endpoints would be three
     * copies of the SVG refusal, which is the message people actually hit.
     *
     * **Every one of these rewrites the file in place**, like resize and crop
     * before them. That is the trade this library already made: there is no
     * version history, so an edit is not undoable and the UI has to say so
     * before it is applied rather than offering a Revert that cannot work.
     */
    public function transform(Request $request, Media $medium): JsonResponse
    {
        $data = $request->validate([
            'operation' => ['required', Rule::in(['rotate', 'flip', 'adjust'])],
            // Quarter turns only. See ImageEditor::rotate for why an arbitrary
            // angle is a different feature rather than a wider range.
            'degrees' => ['required_if:operation,rotate', 'integer', Rule::in([90, 180, 270])],
            'axis' => ['required_if:operation,flip', Rule::in(['horizontal', 'vertical'])],
            'brightness' => ['sometimes', 'integer', 'between:-255,255'],
            'contrast' => ['sometimes', 'integer', 'between:-100,100'],
            'greyscale' => ['sometimes', 'boolean'],
            'as_copy' => ['sometimes', 'boolean'],
        ]);

        if (! ImageEditor::isResizable((string) $medium->mime)) {
            return response()->json([
                'message' => 'Only JPG, PNG, GIF and WebP can be edited. An SVG has no pixels to change.',
            ], 422);
        }

        $target = $this->targetFor($medium, $request);

        /*
          Archived **before** the edit, because afterwards the previous bytes
          are gone and there is nothing left to copy. Skipped when writing to a
          copy: the copy has no history of its own yet, and the original is
          untouched, so there is nothing to undo.
        */
        if ($target->is($medium)) {
            MediaHistory::snapshot($medium, $data['operation'], $request->user()?->id);
        }

        $disk = Storage::disk($target->disk);
        $absolute = $disk->path($target->path);

        try {
            [$w, $h, $bytes] = match ($data['operation']) {
                'rotate' => ImageEditor::rotate($absolute, $absolute, $data['degrees']),
                'flip' => ImageEditor::flip($absolute, $absolute, $data['axis']),
                'adjust' => ImageEditor::adjust(
                    $absolute, $absolute,
                    $data['brightness'] ?? 0,
                    $data['contrast'] ?? 0,
                    (bool) ($data['greyscale'] ?? false),
                ),
            };
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $target->update(['width' => $w, 'height' => $h, 'size' => $bytes]);

        return response()->json(['data' => new MediaResource($target->fresh('uploader'))]);
    }

    /**
     * Replace the bytes and keep the row.
     *
     * The point is the **path**: records store a path rather than a media id,
     * so every page already using this image keeps working and picks up the
     * new picture. Uploading a replacement as a new file and deleting the old
     * one breaks all of them silently, which is exactly what an editor does
     * today when they want to swap a photograph.
     *
     * The new file must be the same *kind* — an image for an image — because
     * the stored path keeps its extension and the records referencing it
     * expect a picture. Swapping a PNG for a PDF at the same URL is a broken
     * `<img>` on every page that used it.
     */
    public function replace(Request $request, Media $medium): JsonResponse
    {
        $maxKb = UploadLimits::maxKb();

        $request->validate([
            'file' => ['required', 'file', "max:{$maxKb}"],
        ], [
            'file.max' => 'That file is over the '.round($maxKb / 1024).' MB limit.',
        ]);

        $file = $request->file('file');
        $mime = $file->getClientMimeType();

        $wasImage = $medium->isImage();
        $isImage = str_starts_with($mime, 'image/');

        if ($wasImage !== $isImage) {
            return response()->json([
                'message' => $wasImage
                    ? 'This is an image, so its replacement has to be one too — everything using it renders it as a picture.'
                    : 'This is a document. Replace it with another document.',
            ], 422);
        }

        /*
         * The extension is part of the stored path and does not change, so a
         * replacement has to match it. A .png path serving JPEG bytes works in
         * most browsers and breaks the one thing that reads the extension —
         * and `Content-Type` is served from the file on disk, not the row.
         */
        $extension = strtolower(pathinfo($medium->path, PATHINFO_EXTENSION));
        $incoming = strtolower($file->getClientOriginalExtension());
        $equivalent = ['jpg' => 'jpeg', 'jpeg' => 'jpeg'];

        if (($equivalent[$incoming] ?? $incoming) !== ($equivalent[$extension] ?? $extension)) {
            return response()->json([
                'message' => "The replacement has to be a .{$extension} file, because everything already pointing at this image uses that address.",
            ], 422);
        }

        $disk = Storage::disk($medium->disk);

        // The bytes being replaced are the ones worth keeping: a replacement
        // is the edit most likely to be the wrong file.
        MediaHistory::snapshot($medium, 'replace', $request->user()?->id);

        // SVG is sanitised on the way in here exactly as it is on upload — a
        // replacement is an upload, and skipping it would be a way to put
        // unsanitised markup at an address the library already trusts.
        if ($mime === 'image/svg+xml') {
            try {
                $clean = SvgSanitiser::clean((string) file_get_contents($file->getRealPath()));
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            $disk->put($medium->path, $clean);
        } else {
            $disk->put($medium->path, (string) file_get_contents($file->getRealPath()));
        }

        [$width, $height] = @getimagesize($disk->path($medium->path)) ?: [null, null];

        $medium->update([
            'mime' => $mime,
            'size' => $disk->size($medium->path),
            'width' => $width,
            'height' => $height,
        ]);

        return response()->json(['data' => new MediaResource($medium->fresh('uploader'))]);
    }

    /**
     * Stream the file back with its human filename rather than its hashed
     * one — the stored name is deliberately meaningless, and a download
     * called "9f3c…c1.png" is no use to anyone.
     */
    public function download(Media $medium): StreamedResponse
    {
        $disk = Storage::disk($medium->disk);

        abort_unless($disk->exists($medium->path), 404);

        return $disk->download($medium->path, $medium->filename ?: basename($medium->path));
    }

    /**
     * Move a file to the bin. The bytes stay where they are.
     *
     * Deliberately *not* deleting from disk: a restore has to put back the
     * exact URL that was already published, and re-uploading the same bytes
     * under a new hashed name would not do that — every record pointing at the
     * old path would still be broken. So the path is held until the file is
     * purged for real.
     */
    public function destroy(Media $medium): JsonResponse
    {
        $medium->delete();

        return response()->json(['message' => 'Moved to the bin.']);
    }

    /** Take a file back out of the bin, at the path it always had. */
    public function restore(int $id): JsonResponse
    {
        $medium = Media::onlyTrashed()->findOrFail($id);
        $medium->restore();

        return response()->json(['data' => new MediaResource($medium->fresh('uploader'))]);
    }

    /**
     * Delete for real: the row, the bytes, and every archived version.
     *
     * Versions cascade at the database level, and each one's own `deleting`
     * hook removes its file — which is why this iterates the relation rather
     * than relying on the cascade alone. A foreign key deletes rows; it knows
     * nothing about the disk.
     */
    public function purge(int $id): JsonResponse
    {
        $medium = Media::onlyTrashed()->findOrFail($id);

        foreach ($medium->versions as $version) {
            $version->delete();
        }

        Storage::disk($medium->disk)->delete($medium->path);
        $medium->forceDelete();

        return response()->json(['message' => 'File deleted permanently.']);
    }

    /** Empty the bin. One row at a time, for the reason purge() gives. */
    public function emptyTrash(): JsonResponse
    {
        $deleted = 0;

        foreach (Media::onlyTrashed()->get() as $medium) {
            foreach ($medium->versions as $version) {
                $version->delete();
            }

            Storage::disk($medium->disk)->delete($medium->path);
            $medium->forceDelete();
            $deleted++;
        }

        return response()->json(['data' => ['deleted' => $deleted]]);
    }

    /* ------------------------------------------------------------ versions */

    public function versions(Media $medium): JsonResponse
    {
        return response()->json([
            'data' => $medium->versions()->with('author')->get()->map(fn ($v) => [
                'id' => $v->id,
                'url' => $v->url(),
                'mime' => $v->mime,
                'size' => (int) $v->size,
                'width' => $v->width,
                'height' => $v->height,
                'operation' => $v->operation,
                'created_by' => $v->author?->name,
                'created_at' => $v->created_at?->toIso8601String(),
            ]),
        ]);
    }

    /** Put an archived version back over the live file. */
    public function restoreVersion(Request $request, Media $medium, int $versionId): JsonResponse
    {
        $version = $medium->versions()->whereKey($versionId)->firstOrFail();

        if (! MediaHistory::restore($medium, $version, $request->user()?->id)) {
            return response()->json([
                'message' => 'That version is no longer on disk and cannot be restored.',
            ], 422);
        }

        return response()->json(['data' => new MediaResource($medium->fresh('uploader'))]);
    }

    /**
     * Write the cleaned document under the same hashed-name convention.
     *
     * `store()` cannot be used, because it copies the temporary upload
     * verbatim — which is exactly the file being replaced. The name is
     * generated the way Laravel generates one, so nothing downstream can tell
     * the two paths apart.
     */
    private function putSanitisedSvg(string $svg): string
    {
        $path = 'media/'.now()->format('Y/m').'/'.Str::random(40).'.svg';

        Storage::disk('public')->put($path, $svg);

        return $path;
    }
}
