<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * `files` is written as `{field: {path, name, size, mime}}` (`FormUploads`),
 * and typed here as what a JSON column can actually hand back: a map of maps.
 * Everything that reads it checks for the key it needs.
 *
 * @property array<string, mixed>|null $data
 * @property array<string, array<string, mixed>>|null $files
 */
class FormSubmission extends Model
{
    /**
     * Where an upload is kept: the private disk, the careers form's and the
     * ticket attachments' — nothing on it has a URL, so the only way to a
     * file is the authorised route that streams it.
     */
    public const DISK = 'local';

    protected $fillable = ['form_id', 'form_slug', 'data', 'files', 'ip_address', 'read_at'];

    protected function casts(): array
    {
        return ['data' => 'array', 'files' => 'array', 'read_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        // `form.submitted` carries the raw answers; the lead made from them
        // announces itself separately as `lead.created`.
        static::created(function (self $submission) {
            Webhooks::emit(WebhookEvent::FormSubmitted, fn () => WebhookPayload::formSubmission($submission));
        });

        /*
         * A submission's files go with it, the rule a job application's CV
         * follows. Deleting the *form* is a different thing and does not come
         * through here: `form_id` is nulled by the database, no model event
         * fires, and the submissions keep their files exactly as they keep
         * their answers.
         */
        static::deleting(function (self $submission) {
            foreach ($submission->files ?? [] as $file) {
                try {
                    Storage::disk(self::DISK)->delete((string) ($file['path'] ?? ''));
                } catch (\Throwable $e) {
                    // The row is what the console lists; a file the disk
                    // would not give up must not keep it there.
                    Log::warning('A form upload could not be deleted with its submission.', [
                        'submission' => $submission->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        });
    }

    /** @return BelongsTo<Form, $this> */
    public function form(): BelongsTo
    {
        return $this->belongsTo(Form::class);
    }

    /**
     * The upload stored for one field, or null.
     *
     * @return array{path: string, name: string}|null
     */
    public function upload(string $field): ?array
    {
        $file = $this->files[$field] ?? null;
        $path = $file['path'] ?? null;

        if (! is_string($path) || $path === '') {
            return null;
        }

        $name = $file['name'] ?? null;

        return ['path' => $path, 'name' => is_string($name) && $name !== '' ? $name : 'upload'];
    }
}
