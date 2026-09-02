<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\StockMovementReason;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\Store\StockMovementResource;
use App\Support\Newsletter\Csv;
use App\Support\Store\SalesReport;
use App\Support\Store\StockReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * What came in and what went out.
 *
 * Three representations of one query — the totals for the screen, the
 * movements behind them, and the CSV — all built from `StockReport::query()`,
 * so a filtered screen and its export cannot cover different rows. That is the
 * mistake `/admin/leads/export` was written to avoid by sharing `filtered()`
 * with its index, and the reason the sales report and its CSV both go through
 * `SalesReport`.
 *
 * There is no `store`. A movement exists because stock moved, and an endpoint
 * that could invent one would make every figure on the screen unauditable —
 * the same reason the activity log has no write path and `/admin/leads` has no
 * create.
 */
class StockController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);
        $filters = $this->filters($request);

        return response()->json([
            'data' => StockReport::read($from, $to, $filters),
            'meta' => [
                // Sent rather than restated in TypeScript, the rule
                // `schema_type_options` follows.
                'reasons' => StockMovementReason::options(),
                'max_days' => StockReport::MAX_DAYS,
            ],
        ]);
    }

    /**
     * The movements themselves, paginated.
     *
     * Separate from the report rather than nested inside it, because they are
     * two different questions asked at two different rates: the totals are read
     * once and the ledger is paged through. Nesting them would rebuild every
     * total on the way to page four.
     */
    public function movements(Request $request): AnonymousResourceCollection
    {
        [$from, $to] = $this->range($request);

        $movements = StockReport::query($from, $to, $this->filters($request))
            // Newest first, and `id` as the tiebreak: a bulk save writes a
            // movement per variation inside one second, and MySQL is free to
            // order equal rows differently between two queries — so without it
            // a page boundary shows one row twice and hides another. The rule
            // the media library's `?sort=` had to learn.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min((int) $request->integer('per_page', 50), 100))
            ->withQueryString();

        return StockMovementResource::collection($movements);
    }

    /**
     * The same rows, as a file.
     *
     * Streamed and written a chunk at a time, so a long export starts arriving
     * at once rather than after a minute of an apparently hung browser.
     */
    public function export(Request $request): StreamedResponse
    {
        [$from, $to] = $this->range($request);
        $filters = $this->filters($request);
        $name = "technoware-stock-{$from->toDateString()}-to-{$to->toDateString()}.csv";

        return response()->streamDownload(function () use ($from, $to, $filters) {
            $handle = fopen('php://output', 'w');

            /*
             * `Csv::write` escapes every cell beginning `=`, `+`, `-` or `@`,
             * because Excel executes those and an export is a file somebody
             * opens in Excel. It matters more here than anywhere else in the
             * product: **every outgoing quantity is negative**, so a raw `-3`
             * in the change column is a formula to Excel rather than a number.
             *
             * It is the only CSV writer in the application, under the
             * newsletter namespace because that is where it was first needed;
             * a second one here would be a second set of escaping rules to
             * keep right.
             */
            Csv::write($handle, [
                'Date', 'Product', 'Variation', 'SKU', 'Direction',
                'Quantity', 'Change', 'Balance after', 'Reason', 'Order', 'Changed by', 'Note',
            ], $this->rows($from, $to, $filters));

            fclose($handle);
        }, $name, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * The movements, one at a time.
     *
     * `lazyById` rather than `get()`: a year of a busy shop is not a thing to
     * hold in memory in order to write it out row by row, and a generator means
     * the browser starts receiving the file before the query has finished.
     *
     * @return \Generator<int, array<int, string>>
     */
    private function rows(Carbon $from, Carbon $to, array $filters): \Generator
    {
        $movements = StockReport::query($from, $to, $filters)
            ->orderBy('created_at')
            ->orderBy('id')
            ->lazyById(500);

        foreach ($movements as $movement) {
            yield [
                $movement->created_at?->format('Y-m-d H:i') ?? '',
                $movement->product_name,
                $movement->variation_name ?? '',
                $movement->sku ?? '',
                $movement->delta > 0 ? 'In' : 'Out',
                (string) abs($movement->delta),
                (string) $movement->delta,
                // Blank, never zero, where it was never known — every movement
                // backfilled from a historic order. Zero is a level somebody
                // would read as "we ran out".
                $movement->balance_after === null ? '' : (string) $movement->balance_after,
                $movement->reason->label(),
                $movement->order_number ?? '',
                $movement->actor_name ?? '',
                $movement->note ?? '',
            ];
        }
    }

    /**
     * @return array{product: int|null, reason: string|null, direction: string|null}
     */
    private function filters(Request $request): array
    {
        return [
            'product' => $request->filled('product') ? (int) $request->query('product') : null,
            'reason' => $request->query('reason'),
            'direction' => in_array($request->query('direction'), ['in', 'out'], true)
                ? $request->query('direction')
                : null,
        ];
    }

    /**
     * The range, echoed back by the report so a figure is never quoted against
     * dates nobody chose.
     *
     * Thirty days ending today by default. A backwards range is corrected —
     * swapping two dates in a form is a slip, not a question — and one over the
     * ceiling is a 422 naming it. Shared wording and shared limit with
     * `SalesReport`, because two report screens in one console disagreeing
     * about how far back they will look is a question somebody has to ask.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function range(Request $request): array
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'product' => ['nullable', 'integer'],
            'reason' => ['nullable', 'string'],
            'direction' => ['nullable', 'string'],
            'per_page' => ['nullable', 'integer'],
        ]);

        $to = isset($data['to']) ? Carbon::parse($data['to'])->startOfDay() : Carbon::today();
        $from = isset($data['from']) ? Carbon::parse($data['from'])->startOfDay() : $to->copy()->subDays(29);

        if ($from->gt($to)) {
            [$from, $to] = [$to, $from];
        }

        if (SalesReport::spanInDays($from, $to) > StockReport::MAX_DAYS) {
            throw ValidationException::withMessages([
                'from' => 'A report covers at most '.StockReport::MAX_DAYS.' days. Narrow the range.',
            ]);
        }

        return [$from, $to];
    }
}
