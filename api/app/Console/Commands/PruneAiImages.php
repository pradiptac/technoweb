<?php

namespace App\Console\Commands;

use App\Support\Images\ImagePreviews;
use Illuminate\Console\Command;

class PruneAiImages extends Command
{
    protected $signature = 'technoware:prune-ai-images';

    protected $description = 'Delete AI picture previews nobody kept (older than ten minutes).';

    public function handle(): int
    {
        $this->info(ImagePreviews::prune().' preview(s) deleted.');

        return self::SUCCESS;
    }
}
