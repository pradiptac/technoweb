<?php

namespace App\Console\Commands;

use App\Support\Messaging\QuietHours;
use App\Support\Store\CartReminders;
use Illuminate\Console\Command;

/**
 * Emails the people who left something in their basket — twice at most.
 *
 * Scheduled every ten minutes. Everything it decides is in `CartReminders`;
 * this is the loop, and the two early exits that make a run cheap: the switch
 * (off by default) and the quiet-hours window. Outside the window a reminder
 * is not dropped — the basket is still due on the next run inside it, which
 * is what "promotional messages wait until 9am" means in practice.
 *
 * The second reminder is taken before the first in each run, so a basket
 * cannot be told twice in one pass: one reminded now has `reminders_sent = 1`
 * and a `last_reminded_at` of now, which the second stage's twelve-hour gap
 * refuses anyway.
 */
class RemindAbandonedCarts extends Command
{
    protected $signature = 'technoware:remind-abandoned-carts';

    protected $description = 'Email a reminder about baskets left with items in them';

    public function handle(): int
    {
        if (! CartReminders::enabled()) {
            $this->info('Basket reminders are switched off (Store → Settings).');

            return self::SUCCESS;
        }

        if (! QuietHours::allows()) {
            $this->info('Outside the hours promotional messages may go; the next run inside them will send.');

            return self::SUCCESS;
        }

        $sent = [1 => 0, 2 => 0];

        foreach ([2, 1] as $number) {
            CartReminders::due($number)
                ->with(['customer', 'items.product', 'items.variation'])
                ->orderBy('id')
                ->limit(CartReminders::BATCH)
                ->get()
                ->each(function ($cart) use ($number, &$sent) {
                    if (CartReminders::send($cart, $number)) {
                        $sent[$number]++;
                    }
                });
        }

        $this->info("Sent {$sent[1]} first and {$sent[2]} second basket reminder(s).");

        return self::SUCCESS;
    }
}
