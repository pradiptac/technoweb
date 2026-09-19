<?php

namespace App\Jobs;

use App\Support\IndexNow;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * One IndexNow submission: the changed URLs, the key, and where the key
 * can be fetched. `api.indexnow.org` fans the ping out to every engine in
 * the protocol, so one call is all of them.
 *
 * Never fails the queue: a 4xx is a misconfiguration (a key file the engine
 * could not fetch, most likely — 403) and is logged at `warning` with the
 * engine's own status, which is the one thing an operator needs; a network
 * error is the same. Nothing retries — the next change to the page sends
 * the next ping, and a submission is only a hint.
 */
class PingIndexNow implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 30;

    /** @param  array<int, string>  $urls */
    public function __construct(public readonly array $urls) {}

    public function handle(): void
    {
        if (! IndexNow::enabled() || $this->urls === []) {
            return;
        }

        $host = parse_url((string) config('app.frontend_url'), PHP_URL_HOST);

        try {
            $res = Http::acceptJson()->timeout(10)->post(IndexNow::ENDPOINT, [
                'host' => $host,
                'key' => IndexNow::key(),
                'keyLocation' => IndexNow::keyLocation(),
                'urlList' => array_slice($this->urls, 0, 10000),
            ]);
        } catch (\Throwable $e) {
            Log::warning('IndexNow could not be reached', ['error' => mb_substr($e->getMessage(), 0, 200)]);

            return;
        }

        // 200 and 202 are both "received"; anything else names what to fix.
        if (! in_array($res->status(), [200, 202], true)) {
            Log::warning('IndexNow refused a submission', [
                'status' => $res->status(),
                'urls' => count($this->urls),
                'body' => mb_substr($res->body(), 0, 200),
            ]);
        }
    }
}
