<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Support\Money;
use App\Support\Newsletter\Csv;
use App\Support\Store\SalesReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Sales, over a range somebody chose.
 *
 * Two representations of one query: JSON for the screen, CSV for the
 * spreadsheet the accountant actually works in. Both go through
 * `App\Support\Store\SalesReport`, so the export cannot report a different
 * total from the screen that offered it.
 */
class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json([
            'data' => SalesReport::read($from, $to, (string) $request->query('group', 'day')),
            'meta' => [
                // Sent rather than restated in TypeScript, the rule
                // `schema_type_options` follows.
                'groups' => SalesReport::GROUPS,
                'max_days' => SalesReport::MAX_DAYS,
            ],
        ]);
    }

    /**
     * The same range, as a file.
     *
     * Streamed, and the header row is written before the first query runs, so a
     * long export starts arriving immediately rather than after a minute of an
     * apparently hung browser.
     */
    public function export(Request $request): StreamedResponse
    {
        [$from, $to] = $this->range($request);

        $type = $request->query('type') === 'products' ? 'products' : 'orders';
        $name = "technoware-{$type}-{$from->toDateString()}-to-{$to->toDateString()}.csv";

        return response()->streamDownload(function () use ($from, $to, $type) {
            $handle = fopen('php://output', 'w');

            /*
             * `Csv::write` escapes every cell that begins `=`, `+`, `-` or `@`
             * — Excel executes those, and an export is a file somebody opens in
             * Excel. It lives under the newsletter namespace because that is
             * where it was first needed; it is the only CSV writer in the
             * application and a second one here would be a second set of
             * escaping rules to keep right.
             */
            if ($type === 'products') {
                Csv::write($handle, [
                    'Product', 'SKU', 'Type', 'Units', 'Orders', 'Revenue (INR)',
                ], $this->productRows($from, $to));
            } else {
                Csv::write($handle, [
                    'Order', 'Placed', 'Status', 'Customer', 'Email', 'Items',
                    'Subtotal (INR)', 'Discount (INR)', 'Coupon',
                    'Taxable (INR)', 'GST (INR)', 'Total (INR)',
                ], $this->orderRows($from, $to));
            }

            fclose($handle);
        }, $name, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** @return \Generator<int, array<int, string>> */
    private function orderRows(Carbon $from, Carbon $to): \Generator
    {
        foreach (SalesReport::orderRows($from, $to) as $order) {
            yield [
                $order->order_number,
                $order->placed_at?->format('Y-m-d H:i') ?? '',
                $order->status?->label() ?? '',
                $order->customer_name,
                $order->customer_email,
                (string) $order->items->sum('quantity'),
                /*
                 * Rupees in the file, paise on the wire. A spreadsheet is read
                 * by a person and summed by Excel, and 1180000 in a column
                 * headed "Total" is a figure somebody will quote at a hundred
                 * times its value. The header says the unit either way.
                 */
                Money::toRupeeString($order->subtotal_paise),
                Money::toRupeeString($order->discount_paise),
                $order->coupon_code ?? '',
                Money::toRupeeString($order->taxable_paise),
                Money::toRupeeString($order->gst_paise),
                Money::toRupeeString($order->total_paise),
            ];
        }
    }

    /** @return \Generator<int, array<int, string>> */
    private function productRows(Carbon $from, Carbon $to): \Generator
    {
        foreach (SalesReport::read($from, $to)['products'] as $row) {
            yield [
                $row['name'] ?? '',
                $row['sku'] ?? '',
                $row['type'] ?? '',
                (string) $row['units'],
                (string) $row['orders'],
                Money::toRupeeString($row['revenue_paise']),
            ];
        }
    }

    /**
     * The range, defaulted and bounded.
     *
     * Defaults to the last thirty days so the endpoint answers something useful
     * with no parameters at all. A backwards range is corrected rather than
     * refused — swapping two dates in a form is a slip, not a question — but an
     * over-long one is a 422 naming the limit, because that is a report nobody
     * meant to ask for and it would scan the whole table.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function range(Request $request): array
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'group' => ['nullable', 'string'],
            'type' => ['nullable', 'string'],
        ]);

        $to = isset($data['to']) ? Carbon::parse($data['to'])->startOfDay() : Carbon::today();
        $from = isset($data['from']) ? Carbon::parse($data['from'])->startOfDay() : $to->copy()->subDays(29);

        if ($from->gt($to)) {
            [$from, $to] = [$to, $from];
        }

        if (SalesReport::spanInDays($from, $to) > SalesReport::MAX_DAYS) {
            throw ValidationException::withMessages([
                'from' => 'A report covers at most '.SalesReport::MAX_DAYS.' days. Narrow the range.',
            ]);
        }

        return [$from, $to];
    }
}
