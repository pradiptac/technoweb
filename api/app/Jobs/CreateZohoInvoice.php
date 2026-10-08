<?php

namespace App\Jobs;

use App\Models\Order;
use App\Support\Store\Zoho\ZohoInvoices;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Make one order's invoice in Zoho Books (0.134.0, docs/store.md "Zoho Books
 * invoices").
 *
 * One try, on purpose: `ZohoInvoices::run()` never throws, records why an
 * attempt failed on the order itself and sets when the next is due — and the
 * scheduler's `technoware:sync-zoho-invoices` makes it. A queue retry beside
 * that would be a second clock for one job. Only the order's id is carried,
 * so the work is done on the order as it stands when the worker runs.
 */
class CreateZohoInvoice implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Under the database queue's `retry_after` of 90: four or five calls to Zoho at up to 25s each is the worst case. */
    public int $timeout = 80;

    public function __construct(public readonly int $orderId) {}

    public function handle(): void
    {
        $order = Order::query()->find($this->orderId);

        if ($order !== null) {
            ZohoInvoices::run($order);
        }
    }
}
