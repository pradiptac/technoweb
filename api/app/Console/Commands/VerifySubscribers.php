<?php

namespace App\Console\Commands;

use App\Support\Newsletter\HunterClient;
use App\Support\Newsletter\SubscriberVerifier;
use Illuminate\Console\Command;

/**
 * The nightly Hunter pass over the subscriber list.
 *
 * Reports by default with `--dry-run` and spends nothing; without it, checks
 * today's share of the month's allowance. Always exits 0: a Hunter outage is
 * written to `newsletter_verify_error` for the console to show, and is not a
 * failed scheduler event for somebody to be paged about at four in the
 * morning.
 */
class VerifySubscribers extends Command
{
    protected $signature = 'technoware:verify-subscribers
        {--limit= : Check at most this many today, instead of the allowance the month leaves}
        {--dry-run : Report the allowance and the queue; call nothing}';

    protected $description = 'Verify new subscriber addresses through Hunter, a few a day, and never the same address twice';

    public function handle(SubscriberVerifier $verifier): int
    {
        if (! HunterClient::configured()) {
            $this->line('No Hunter API key is set (Settings → API keys). Nothing to do.');

            return self::SUCCESS;
        }

        $budget = $verifier->budget();
        $estimate = $verifier->estimate($budget);

        if ($this->option('dry-run')) {
            $this->report($verifier, $budget, $estimate);

            return self::SUCCESS;
        }

        $limit = $this->option('limit') !== null ? max(0, (int) $this->option('limit')) : null;
        $tally = $verifier->run($limit);

        if ($tally['skipped'] !== null) {
            $this->line('Skipped: '.$tally['skipped'].'.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            '%d asked, %d copied from earlier checks. Verified %d, risky %d, invalid %d, disposable %d, still checking %d.',
            $tally['calls'], $tally['copied'], $tally['verified'], $tally['risky'],
            $tally['invalid'], $tally['disposable'], $tally['pending'],
        ));

        if ($tally['stopped'] !== null) {
            $this->warn('Stopped early: '.$tally['stopped']);
        }

        return self::SUCCESS;
    }

    private function report(SubscriberVerifier $verifier, array $budget, array $estimate): void
    {
        $this->line(sprintf(
            'This month: %d of %d used, %d left, %d days to go — %d a day. Resets on %s.',
            $budget['used'], $budget['cap'], $budget['remaining'], $budget['days_left'],
            $budget['per_day'], $budget['resets_on'],
        ));

        if ($account = $verifier->accountCached()) {
            $this->line(sprintf(
                'Hunter says: plan %s, %d used, %d available, resets %s.',
                $account['plan_name'] ?? '?', $account['used'], $account['available'], $account['reset_date'] ?? '?',
            ));
        } else {
            $this->line('Hunter could not be asked for its own figures.');
        }

        if ($error = SubscriberVerifier::error()) {
            $this->warn('Last error: '.$error);
        }

        $this->line(sprintf(
            '%d waiting%s.',
            $estimate['waiting'],
            $estimate['estimated_days'] ? ' — about '.$estimate['estimated_days'].' day(s) at this allowance' : '',
        ));

        $rows = $verifier->queue()->limit(25)->get()
            ->map(fn ($s) => [
                $s->email, $s->verification->label(), $s->verification_attempts,
                $s->verification_at?->toDateTimeString() ?? '—',
            ])->all();

        if ($rows !== []) {
            $this->table(['Email', 'Verification', 'Attempts', 'Last asked'], $rows);
        }
    }
}
