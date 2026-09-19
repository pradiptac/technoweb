<?php

namespace App\Support\Seo\Ai;

use App\Models\Media;
use App\Support\Chat\AiProvider;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Alt text for a picture in the media library, proposed by the model.
 *
 * `image_alt` is a check in the SEO score and a real accessibility gap —
 * the library holds hundreds of files and `alt_text` is typed by hand, one
 * dialog at a time. This asks a vision-capable model what a picture shows
 * and hands the sentence back for the editor to accept into the field;
 * nothing is written here. Alt text lives with the file (`MediaAlt`), so
 * one accepted sentence reaches every page using the picture.
 *
 * The picture goes as a `data:` URL, never as a link: the API's own asset
 * URL is `127.0.0.1` on a development machine and behind whatever the host
 * allows in production, and a provider that cannot fetch the picture
 * answers about nothing. Raster formats only — a vector is a document, and
 * describing one from its markup is a different task — and under 4MB, the
 * provider's own ceiling. Same refusals, cap and counter as every other
 * action; the reply is one JSON key, bounded to the 125 characters a
 * screen reader reads without pausing.
 */
class AltText
{
    private const MAX_BYTES = 4 * 1024 * 1024;

    private const RASTER = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    public function __construct(private AiProvider $provider) {}

    /** @return array{ok: bool, error?: string, alt?: string} */
    public function suggest(Media $media): array
    {
        if (! in_array((string) $media->mime, self::RASTER, true)) {
            return ['ok' => false, 'error' => 'Only a JPEG, PNG, WebP or GIF can be described; a vector has no picture to look at.'];
        }

        if (! SeoAiSettings::enabled()) {
            return ['ok' => false, 'error' => 'The AI SEO assistant is switched off. Turn it on in Settings → SEO defaults.'];
        }

        if (! filled(SeoAiSettings::apiKey())) {
            return ['ok' => false, 'error' => 'No OpenAI key is configured. Add one in Settings → API keys.'];
        }

        if (! SeoAssistant::underDailyCap()) {
            return ['ok' => false, 'error' => 'The daily limit of '.SeoAiSettings::dailyCap().' AI requests has been reached. It resets at midnight.'];
        }

        $disk = Storage::disk($media->disk ?: 'public');

        if (! $disk->exists($media->path)) {
            return ['ok' => false, 'error' => 'The file is not on disk any more.'];
        }

        if ($disk->size($media->path) > self::MAX_BYTES) {
            return ['ok' => false, 'error' => 'The file is over 4MB, which is more than the model will look at. Resize it first.'];
        }

        $dataUrl = 'data:'.$media->mime.';base64,'.base64_encode((string) $disk->get($media->path));

        $reply = $this->provider->complete(
            [
                ['role' => 'system', 'content' => implode("\n", [
                    'You write alt text for images on a business website — a hardware and network solution provider.',
                    'Describe what the picture shows for somebody who cannot see it: the subject, and what matters about it.',
                    'One sentence, at most 125 characters, no "image of" or "picture of", no marketing.',
                    'If a product, brand or model name is legible in the picture, use it exactly as written.',
                    'If the picture is purely decorative (a texture, a gradient, an abstract shape), say so: {"alt": "", "decorative": true}.',
                    'Reply with a single JSON object and nothing else. Shape: {"alt": string, "decorative": boolean}',
                ])],
                ['role' => 'user', 'content' => [
                    ['type' => 'text', 'text' => 'Write the alt text for this image.'.(filled($media->filename) ? ' Its file name is "'.mb_substr((string) $media->filename, 0, 120).'".' : '')],
                    ['type' => 'image_url', 'image_url' => ['url' => $dataUrl, 'detail' => 'low']],
                ]],
            ],
            120,
            ['model' => SeoAiSettings::model(), 'response_format' => ['type' => 'json_object']],
        );

        if (! $reply->ok) {
            Log::warning('Alt text could not be suggested', ['media' => $media->id, 'error' => mb_substr((string) $reply->error, 0, 200)]);

            return ['ok' => false, 'error' => 'The AI service did not answer. Try again shortly.'];
        }

        $data = SeoAssistant::decode($reply->text);

        if ($data === null) {
            return ['ok' => false, 'error' => 'The AI service answered in a form we could not read. Try again.'];
        }

        $alt = trim(preg_replace('/\s+/', ' ', (string) ($data['alt'] ?? '')) ?? '');
        $decorative = (bool) ($data['decorative'] ?? false);

        if ($alt === '' && ! $decorative) {
            return ['ok' => false, 'error' => 'The AI service answered, but nothing in it was usable. Try again.'];
        }

        SeoAssistant::countRun();

        return ['ok' => true, 'alt' => $decorative ? '' : mb_substr($alt, 0, 255)];
    }
}
