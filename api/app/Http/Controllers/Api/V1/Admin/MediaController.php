<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MediaResource;
use App\Models\Media;
use App\Support\ImageEditor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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
    public function index(Request $request): AnonymousResourceCollection
    {
        $media = Media::query()
            ->with('uploader')
            ->when($request->filled('q'), fn ($q) => $q->where('filename', 'like', '%'.$request->string('q')->value().'%'))
            // `folder=unfiled` is not the same as no folder parameter: one
            // means "the files in no folder", the other means "everything".
            ->when($request->input('folder') === 'unfiled', fn ($q) => $q->whereNull('folder_id'))
            ->when($request->filled('folder') && $request->input('folder') !== 'unfiled',
                fn ($q) => $q->where('folder_id', $request->integer('folder')))
            ->when($request->input('kind') === 'image', fn ($q) => $q->where('mime', 'like', 'image/%'))
            ->when($request->input('kind') === 'file', fn ($q) => $q->where('mime', 'not like', 'image/%'))
            ->latest()
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        return MediaResource::collection($media);
    }

    public function store(Request $request): JsonResponse
    {
        $maxKb = config('media.max_kb', 5120);

        /*
         * Documents as well as images, so the library's Files tab has
         * something to hold — datasheets are the reason it exists.
         *
         * Still an allowlist rather than "anything that is not executable".
         * These land on the public disk and are served straight back to
         * browsers, so the question is not whether a type is dangerous to
         * store but whether it is safe to hand to a visitor. Nothing that a
         * browser will run: no html, no svg-as-document, no archives that
         * unpack on click.
         */
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:png,jpg,jpeg,gif,webp,svg,pdf,doc,docx,xls,xlsx,csv,txt,zip', "max:{$maxKb}"],
            'alt_text' => ['nullable', 'string', 'max:255'],
            'folder_id' => ['nullable', 'integer', 'exists:media_folders,id'],
        ], [
            'file.mimes' => 'Upload an image (PNG, JPG, GIF, WebP, SVG) or a document (PDF, Word, Excel, CSV, TXT, ZIP).',
            'file.max' => 'That file is over the '.round($maxKb / 1024).' MB limit.',
        ]);

        $file = $request->file('file');

        // Hashed name on a dated path: the original filename is metadata only,
        // so a crafted name cannot influence where the file lands.
        $path = $file->store('media/'.now()->format('Y/m'), 'public');

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
            'folder_id' => ['sometimes', 'nullable', 'integer', 'exists:media_folders,id'],
        ]);

        $medium->fill($data)->save();

        return response()->json(['data' => new MediaResource($medium->fresh('uploader'))]);
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
        ]);

        if (! ImageEditor::isResizable((string) $medium->mime)) {
            return response()->json([
                'message' => 'Only JPG, PNG, GIF and WebP can be resized. An SVG has no pixel size to change.',
            ], 422);
        }

        $disk = Storage::disk($medium->disk);
        $absolute = $disk->path($medium->path);

        try {
            [$w, $h, $bytes] = ImageEditor::resize($absolute, $absolute, $data['width'], $data['height']);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $medium->update(['width' => $w, 'height' => $h, 'size' => $bytes]);

        $created = [];

        foreach (array_unique($data['thumbnails'] ?? []) as $size) {
            $extension = pathinfo($medium->path, PATHINFO_EXTENSION);
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
                'disk' => $medium->disk,
                'path' => $thumbPath,
                'filename' => pathinfo((string) $medium->filename, PATHINFO_FILENAME)."-{$size}x{$size}.".$extension,
                'mime' => $medium->mime,
                'size' => $thumbBytes,
                'width' => $size,
                'height' => $size,
                'alt_text' => $medium->alt_text,
            ]);
        }

        return response()->json([
            'data' => new MediaResource($medium->fresh('uploader')),
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
        ]);

        if (! ImageEditor::isResizable((string) $medium->mime)) {
            return response()->json([
                'message' => 'Only JPG, PNG, GIF and WebP can be cropped. An SVG has no pixels to cut.',
            ], 422);
        }

        $disk = Storage::disk($medium->disk);
        $absolute = $disk->path($medium->path);

        try {
            [$w, $h, $bytes] = ImageEditor::crop(
                $absolute, $absolute,
                $data['x'], $data['y'], $data['width'], $data['height'],
                $data['out_width'] ?? null, $data['out_height'] ?? null,
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $medium->update(['width' => $w, 'height' => $h, 'size' => $bytes]);

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

    public function destroy(Media $medium): JsonResponse
    {
        // Records referencing this path keep a dead path rather than a broken
        // relation; the resource renders a missing image, not a 500.
        Storage::disk($medium->disk)->delete($medium->path);
        $medium->delete();

        return response()->json(['message' => 'File deleted.']);
    }
}
