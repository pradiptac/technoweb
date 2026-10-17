<?php

namespace App\Console\Commands;

use App\Models\HealthLink;
use App\Support\Health\HealthSettings;
use App\Support\Health\LinkProber;
use Illuminate\Console\Command;

/** Probes the links that are due (docs/health.md "Link checker"). At most one request per host per second. */
class CheckLinks extends Command
{
    protected $signature = 'technoware:check-links {--limit=60}';

    protected $description = 'Check the links pages point at that are due a check';

    private const BUDGET_SECONDS = 50;

    public function handle(): int
    {
        $started = microtime(true);
        $lastByHost = [];

        $due = HealthLink::query()
            ->where('next_check_at', '<=', now())
            ->when(! HealthSettings::externalOn(), fn ($q) => $q->where('internal', true))
            ->orderBy('next_check_at')
            ->limit((int) $this->option('limit'))
            ->get();

        foreach ($due as $link) {
            if (microtime(true) - $started > self::BUDGET_SECONDS) {
                break;
            }

            $wait = 1.0 - (microtime(true) - ($lastByHost[$link->host] ?? 0));
            if ($wait > 0) {
                usleep((int) ($wait * 1_000_000));
            }

            LinkProber::probe($link);
            $lastByHost[$link->host] = microtime(true);
        }

        return self::SUCCESS;
    }
}
