<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\InboundMail\InboundMail;
use App\Support\InboundMail\Mailbox;
use App\Support\InboundMail\MailFilter;
use App\Support\InboundMail\ReplyParser;
use App\Support\InboundMail\TicketPiper;
use Illuminate\Console\Command;
use Throwable;

/**
 * Reads the support mailbox and turns what is waiting into tickets.
 *
 * Run by the scheduler every minute. Always exits 0: a mailbox that refuses
 * us is a banner on Settings → Ticketing (`inbound_mail_error`), not a
 * failed scheduler event, and nothing is lost by it — the mail stays where
 * it is and is picked up when the credentials are fixed. With piping off
 * it says so and touches nothing, which is the whole of "don't break the
 * existing system".
 *
 * `--dry-run` lists what would happen and does not write a row, flag a
 * message or send anything — for looking at a mailbox before switching on.
 */
class PipeInboundMail extends Command
{
    protected $signature = 'technoware:pipe-inbound-mail
        {--limit=25 : How many messages to take in one run}
        {--dry-run : Say what would be done with what is waiting, and do none of it}';

    protected $description = 'Open tickets from new messages in the support mailbox';

    public function handle(): int
    {
        if (! InboundMail::enabled()) {
            $this->info(InboundMail::switchedOn()
                ? 'Email piping is switched on but the mailbox is not fully configured (Settings → Ticketing). Nothing to do.'
                : 'Email piping is off (Settings → Ticketing). Nothing to do.');

            return self::SUCCESS;
        }

        $limit = max(1, min(200, (int) $this->option('limit')));

        if ($this->option('dry-run')) {
            return $this->dryRun($limit);
        }

        $tally = app(TicketPiper::class)->run($limit);

        if ($tally->error !== null) {
            $this->warn("The mailbox refused us: {$tally->error}");

            return self::SUCCESS;
        }

        $this->info($tally->summary());

        return self::SUCCESS;
    }

    private function dryRun(int $limit): int
    {
        try {
            $messages = app(Mailbox::class)->unseen($limit);
        } catch (Throwable $e) {
            $this->warn("The mailbox refused us: {$e->getMessage()}");

            return self::SUCCESS;
        }

        $own = InboundMail::ownAddresses();
        $staff = User::query()->pluck('email')->map(fn ($e) => strtolower((string) $e))->all();
        $rows = [];

        foreach ($messages as $m) {
            $skip = MailFilter::reason($m, $own, $staff);
            $reference = ReplyParser::reference($m->subject);

            $rows[] = [
                $m->fromEmail,
                mb_strimwidth($m->subject, 0, 60, '…'),
                $skip !== null ? "skip ({$skip})" : ($reference !== null ? "reply on {$reference}, or a new ticket" : 'new ticket'),
            ];
        }

        $this->table(['From', 'Subject', 'Would be'], $rows);
        $this->info(count($rows).' message(s) waiting. Nothing was written, flagged or sent.');

        return self::SUCCESS;
    }
}
