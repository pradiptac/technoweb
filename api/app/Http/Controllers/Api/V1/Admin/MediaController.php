<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MediaResource;
use App\Models\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;

/**
 * The media library. Behind auth:sanctum + role:content_manager.
 *
 * These files are public by design — cover images, logos, og:image — which is
 * the opposite of ticket attachments, and the reason they go to the `public`
 * disk rather than `local`. Nothing here should ever accept a document that
 * was meant to be private; the mime allowlist keeps it to images.
 */
class MediaController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $media = Media::query()
            ->with('uploader')
            ->when($request->filled('q'), fn ($q) => $q->where('filename', 'like', '%'.$request->string('q')->value().'%'))
            ->latest()
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        return MediaResource::collection($media);
    }

    public function store(Request $request): JsonResponse
    {
        $maxKb = config('media.max_kb', 5120);

        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:png,jpg,jpeg,gif,webp,svg', "max:{$maxKb}"],
            'alt_text' => ['nullable', 'string', 'max:255'],
        ], [
            'file.mimes' => 'Upload an image — PNG, JPG, GIF, WebP or SVG.',
            'file.max' => 'That image is over the '.round($maxKb / 1024).' MB limit.',
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

    public function destroy(Media $medium): JsonResponse
    {
        // Records referencing this path keep a dead path rather than a broken
        // relation; the resource renders a missing image, not a 500.
        Storage::disk($medium->disk)->delete($medium->path);
        $medium->delete();

        return response()->json(['message' => 'File deleted.']);
    }
}
