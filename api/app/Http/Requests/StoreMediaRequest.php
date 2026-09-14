<?php

namespace App\Http\Requests;

use App\Support\Media\MediaUploader;
use App\Support\UploadLimits;
use Illuminate\Foundation\Http\FormRequest;

/**
 * An upload to the media library: the allowlist and the size ceiling.
 *
 * Which ceiling applies is decided by what was actually sent, before
 * validation, so the rule can carry the right number and the message can
 * quote it. The ceiling itself is `UploadLimits::maxKb()` — the setting,
 * clamped to what php.ini will accept, because a limit above that is not a
 * bigger limit but a promise the server will not keep.
 */
class StoreMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function isVideo(): bool
    {
        return in_array(
            strtolower($this->file('file')?->getClientOriginalExtension() ?? ''),
            MediaUploader::VIDEO_EXTENSIONS,
            true,
        );
    }

    private function maxKb(): int
    {
        return UploadLimits::maxKb($this->isVideo());
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'file' => [
                'required', 'file',
                'mimes:'.implode(',', MediaUploader::ALLOWED_EXTENSIONS),
                'max:'.$this->maxKb(),
            ],
            'alt_text' => ['nullable', 'string', 'max:255'],
            'folder_id' => ['nullable', 'integer', 'exists:media_folders,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'file.mimes' => 'Upload an image (PNG, JPG, GIF, WebP, SVG), a video (MP4, WebM) or a document (PDF, Word, Excel, CSV, TXT, ZIP).',
            'file.max' => 'That file is over the '.round($this->maxKb() / 1024).' MB limit.',
        ];
    }
}
