<?php

namespace App\Console\Commands;

use App\Support\Fonts\GoogleFonts;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * The console's font samples are cached for a week (0.179.0): a preview is a
 * file somebody looked at once, and nothing refers to it afterwards.
 */
class PruneFontPreviews extends Command
{
    protected $signature = 'technoware:prune-font-previews';

    protected $description = 'Delete cached Google font samples older than seven days';

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $cutoff = now()->subDays(7)->getTimestamp();
        $removed = 0;

        foreach ($disk->files(GoogleFonts::PREVIEWS) as $file) {
            if ($disk->lastModified($file) < $cutoff) {
                $disk->delete($file);
                $removed++;
            }
        }

        $this->info("Removed {$removed} cached font sample(s).");

        return self::SUCCESS;
    }
}
