<?php

namespace App\Support\SiteImport\Steps;

use App\Support\SiteImport\Context;
use App\Support\WordPress\Outcome;

/**
 * One kind of thing the site import brings across: the WordPress importer's
 * `Step` over this import's context. `plan()` decides and writes nothing,
 * `write()` does what `plan()` decided, so the review's counts are the
 * commit's counts.
 */
abstract class Step
{
    /** A short key, used in the report and the commit cursor. */
    abstract public function key(): string;

    /** The heading the review shows. */
    abstract public function label(): string;

    /** @return iterable<array<string, mixed>> */
    abstract public function records(Context $ctx): iterable;

    /** @param  array<string, mixed>  $record */
    abstract public function plan(Context $ctx, array $record): Outcome;

    /** @param  array<string, mixed>  $record */
    abstract public function write(Context $ctx, array $record, Outcome $outcome): void;

    /** The map's source type for this step's records, marked as planned in a dry run. */
    public function mapType(): ?string
    {
        return null;
    }

    /** The record's identity in the map. */
    public function identity(array $record): string
    {
        return (string) ($record['path'] ?? $record['id'] ?? '');
    }

    public function applies(Context $ctx): bool
    {
        return true;
    }

    /** Runs once after the last record, in the commit only. */
    public function finish(Context $ctx): void {}
}
