<?php

namespace App\Console\Commands;

use App\Support\Store\Zoho\ZohoInvoices;
use App\Support\Store\Zoho\ZohoPayments;
use Illuminate\Console\Command;

/**
 * Zoho Books invoices that are waiting or due another attempt (0.134.0,
 * docs/store.md "Zoho Books invoices").
 *
 * The queued job makes an invoice within moments of an order becoming due.
 * This is what catches everything else: a job that never ran because
 * nothing drains the queue, an attempt Zoho refused or could not be reached
 * for, a worker that died mid-attempt. Each failure waits longer than the
 * last (5 minutes, 30, 2 hours, 12 hours) and after five the order is left
 * for a person, with Zoho's own words on it.
 *
 * Always exits 0: an accounts system being down is a line on an order, not
 * a failed scheduler event.
 */
class SyncZohoInvoices extends Command
{
    protected $signature = 'technoware:sync-zoho-invoices {--limit=20 : Orders to work through in one run}';

    protected $description = 'Create Zoho Books invoices that are waiting or due another attempt';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $worked = ZohoInvoices::sweep($limit);

        // Payments and refunds after the invoices they hang off (0.136.0).
        $payments = ZohoPayments::sweep($limit);

        $this->info($worked + $payments === 0 ? 'Nothing waiting.' : "Worked through {$worked} order(s) and {$payments} payment(s).");

        return self::SUCCESS;
    }
}
