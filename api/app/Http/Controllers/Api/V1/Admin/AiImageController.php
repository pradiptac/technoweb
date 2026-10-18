<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ImageShape;
use App\Enums\ImageStyle;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MediaResource;
use App\Support\Images\ImageMaker;
use App\Support\Images\ImagePreviews;
use App\Support\Images\ImageRefused;
use App\Support\Images\ImageSettings;
use App\Support\Media\MediaUploader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Pictures made from a description (0.184.0, docs/ai-images.md). */
class AiImageController extends Controller
{
    public function status(): JsonResponse
    {
        $reason = ImageSettings::refusal();

        return response()->json(['data' => [
            'available' => $reason === null,
            'reason' => $reason,
            'used' => ImageSettings::runsToday(),
            'cap' => ImageSettings::dailyCap(),
            'styles' => ImageStyle::options(),
            'shapes' => ImageShape::options(),
        ]]);
    }

    public function make(Request $request, ImageMaker $maker): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:10', 'max:1000'],
            'style' => ['required', Rule::enum(ImageStyle::class)],
            'shape' => ['required', Rule::enum(ImageShape::class)],
        ]);

        try {
            $made = $maker->make(trim($data['prompt']), ImageStyle::from($data['style']), ImageShape::from($data['shape']), (int) $request->user()->id);
        } catch (ImageRefused $e) {
            return $this->refused($e->getMessage());
        }

        return response()->json(['data' => $made], 201);
    }

    public function show(Request $request, string $token): BinaryFileResponse
    {
        $preview = ImagePreviews::find($token, (int) $request->user()->id) ?? abort(404);

        return response()->file($preview['path'], [
            'Content-Type' => $preview['mime'],
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function keep(Request $request, string $token): JsonResponse
    {
        $data = $request->validate([
            'folder_id' => ['nullable', 'integer', 'exists:media_folders,id'],
            'alt_text' => ['nullable', 'string', 'max:255'],
        ]);
        $preview = ImagePreviews::find($token, (int) $request->user()->id) ?? abort(404);

        $alt = trim((string) ($data['alt_text'] ?? ''));
        if ($alt === '') {
            $first = preg_split('/(?<=[.!?])\s/u', $preview['prompt'], 2)[0] ?? $preview['prompt'];
            $alt = Str::limit(trim($first), 125, '');
        }
        $name = Str::slug(Str::limit($preview['prompt'], 40, '')) ?: 'ai-picture';

        // A ValidationException (over the library's limit) leaves the preview in place so the editor can Discard.
        $media = MediaUploader::storeFromPath($preview['path'], $name.'.'.$preview['ext'], (int) $request->user()->id, [
            'folder_id' => $data['folder_id'] ?? null,
            'alt_text' => $alt,
        ]);
        $media->forceFill([
            'tags' => array_values(array_unique([...($media->tags ?? []), 'ai-generated'])),
            'description' => "Made with AI ({$preview['model']}) from: {$preview['prompt']}",
        ])->save();
        ImagePreviews::forget($token);

        return (new MediaResource($media->fresh()))->response()->setStatusCode(201);
    }

    public function discard(Request $request, string $token): Response
    {
        if (ImagePreviews::find($token, (int) $request->user()->id) !== null) {
            ImagePreviews::forget($token);
        }

        return response()->noContent();
    }

    /** The administrator's model check: one small square picture, counted, deleted. It answers in the provider's own words. */
    public function test(Request $request, ImageMaker $maker): JsonResponse
    {
        try {
            $made = $maker->make('A plain blue square with a soft gradient.', ImageStyle::Flat, ImageShape::Square, (int) $request->user()->id);
        } catch (ImageRefused $e) {
            return $this->refused($e->detail ?? $e->getMessage());
        }
        ImagePreviews::forget($made['token']);

        return response()->json(['data' => ['model' => $made['model'], 'ok' => true]]);
    }

    private function refused(string $sentence): JsonResponse
    {
        return response()->json(['message' => $sentence, 'errors' => ['image' => [$sentence]]], 422);
    }
}
