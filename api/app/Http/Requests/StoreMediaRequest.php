<?php

namespace App\Http\Requests;

use App\Support\Media\MediaUploader;
use App\Support\Media\MotionFiles;
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

    private function extension(): string
    {
        return strtolower($this->file('file')?->getClientOriginalExtension() ?? '');
    }

    public function isVideo(): bool
    {
        return in_array($this->extension(), MediaUploader::VIDEO_EXTENSIONS, true);
    }

    private function maxKb(): int
    {
        return MediaUploader::maxKbFor($this->extension());
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // Lottie and 3D files are read by MotionFiles in the uploader, not by `mimes:`.
        $motion = in_array($this->extension(), MotionFiles::EXTENSIONS, true);

        return [
            'file' => array_filter([
                'required', 'file',
                $motion ? null : MediaUploader::mimesRule(),
                'max:'.$this->maxKb(),
            ]),
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
            'file.mimes' => 'Upload an image (PNG, JPG, GIF, WebP, SVG), a video (MP4, WebM), a document (PDF, Word, Excel, CSV, TXT, ZIP), a Lottie animation (JSON, .lottie) or a 3D model (GLB).',
            'file.max' => 'That file is over the '.round($this->maxKb() / 1024).' MB limit.',
        ];
    }
}
