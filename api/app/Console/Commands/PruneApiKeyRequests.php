<?php

namespace App\Console\Commands;

use App\Models\ApiKeyRequest;
use Illuminate\Console\Command;

/** Deletes API key request log rows older than thirty days — the usage screen reads no further back. */
class PruneApiKeyRequests extends Command
{
    public const DAYS = 30;

    protected $signature = 'technoware:prune-api-key-requests';

    protected $description = 'Delete API key request records older than thirty days';

    public function handle(): int
    {
        $before = now()->subDays(self::DAYS);
        $deleted = 0;

        do {
            $batch = ApiKeyRequest::query()
                ->where('created_at', '<', $before)
                ->orderBy('id')
                ->limit(1000)
                ->pluck('id');

            $deleted += $batch->isEmpty() ? 0 : ApiKeyRequest::query()->whereIn('id', $batch)->delete();
        } while ($batch->count() === 1000);

        $this->info("Deleted {$deleted} API key request".($deleted === 1 ? '' : 's').' older than '.self::DAYS.' days.');

        return self::SUCCESS;
    }
}
