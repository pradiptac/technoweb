<?php

namespace App\Console\Commands;

use App\Models\Media;
use Illuminate\Console\Command;

/**
 * Makes the blurred preview for library pictures that do not have one yet
 * (0.123.0, docs/media.md).
 *
 * A new picture gets its preview when the row is created. This is for the
 * library that already existed — and for anything that reached the table
 * without firing a model event — worked a batch at a time from the
 * scheduler, so a site with two thousand photographs is not asked to decode
 * them all in one run, and an install updated by hand needs no command
 * anybody has to remember.
 *
 * `blur` is null until a row has been tried and never null afterwards: a
 * picture GD cannot read is recorded as an empty string, or it would be
 * tried again every hour for ever. Once nothing is null, a run is one cheap
 * query. `--all` starts every picture again, for after the preview's size or
 * quality changes.
 */
class BackfillMediaBlur extends Command
{
    protected $signature = 'technoware:backfill-media-blur
        {--limit=250 : How many pictures to work in this run}
        {--all : Re-make every picture\'s preview, not only the missing ones}';

    protected $description = 'Make the blurred loading preview for library pictures that have none';

    public function handle(): int
    {
        if ($this->option('all')) {
            Media::withTrashed()->toBase()->update(['blur' => null]);
        }

        $limit = max(1, (int) $this->option('limit'));
        $made = 0;
        $none = 0;

        // Trashed rows too: a binned file still serves at its path, and a
        // setting may still point at it (`PublicSettings`).
        Media::withTrashed()->whereNull('blur')->orderBy('id')->limit($limit)->get()
            ->each(function (Media $medium) use (&$made, &$none) {
                $medium->refreshBlur();
                $medium->blur === '' ? $none++ : $made++;
            });

        $left = Media::withTrashed()->whereNull('blur')->count();

        $this->info("Previews made: {$made}. Nothing to make for: {$none}. Still waiting: {$left}.");

        return self::SUCCESS;
    }
}
