<?php

namespace App\Jobs;

use App\Models\Payment;
use App\Support\Store\Zoho\ZohoPayments;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Tell Zoho Books about one payment or refund (0.136.0, docs/store.md "Zoho
 * Books: payments and credit notes").
 *
 * One try, like `CreateZohoInvoice` and for its reason: `ZohoPayments::run()`
 * never throws, records why an attempt failed on the row and when the next
 * is due, and the scheduler's sweep makes it. Only the row's id is carried.
 */
class SyncZohoPayment implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Under the database queue's `retry_after` of 90. A killed attempt leaves a stale claim the sweep takes over. */
    public int $timeout = 80;

    public function __construct(public readonly int $paymentId) {}

    public function handle(): void
    {
        $payment = Payment::query()->find($this->paymentId);

        if ($payment !== null) {
            ZohoPayments::run($payment);
        }
    }
}
