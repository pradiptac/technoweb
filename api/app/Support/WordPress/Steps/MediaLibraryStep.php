<?php

namespace App\Support\WordPress\Steps;

use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;

/**
 * The whole media library, when the review asks for it.
 *
 * By default only files something imported refers to are brought across —
 * a library is usually years of uploads nothing shows any more. This step
 * runs only when the decision `media_scope` is `all`, and hands every
 * attachment to the media service, which counts, fetches and maps it the
 * same way it does a featured image (so a file both here and in a post is
 * one file).
 */
class MediaLibraryStep extends Step
{
    public function key(): string
    {
        return 'media_library';
    }

    public function label(): string
    {
        return 'Whole media library';
    }

    public function section(): string
    {
        return 'content';
    }

    public function collection(): string
    {
        return 'media';
    }

    public function applies(Context $ctx): bool
    {
        return $ctx->decision('media_scope') === 'all';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        return Outcome::delegated(self::raw($record['title'] ?? '') ?: (string) ($record['id'] ?? ''));
    }

    public function media(Context $ctx, array $record): array
    {
        return isset($record['id']) ? [(int) $record['id']] : [];
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $ctx->media((int) $record['id'], $outcome->label);
    }
}
