<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\ReturnReason;
use App\Enums\ReturnStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\Store\OrderReturnResource;
use App\Models\OrderReturn;
use App\Models\OrderReturnPhoto;
use App\Support\ListSort;
use App\Support\Store\Returns\ReturnActions;
use App\Support\Store\Returns\ReturnPhotos;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The returns desk (0.132.0, docs/store.md "Returns"). Behind auth:sanctum +
 * role:store_manager — a return ends in stock and in money, the two things
 * that role is trusted with.
 *
 * Bound by **reference** (`RMA-2026-00001`), the order's rule: nothing about
 * a return changes its reference, and it is what a customer reads out on the
 * telephone. There is no `store` — a return exists because a customer asked
 * for one — and no `destroy`: a return that should not have been is
 * rejected or closed, and stays in the order's history.
 */
class ReturnController extends Controller
{
    /** The columns a header may sort by — `ListSort`'s allowlist. */
    private const SORTS = [
        'requested' => 'created_at',
        'status' => 'status',
        'reference' => 'reference',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = OrderReturn::query()
            ->with(['order', 'items', 'photos'])
            ->when($request->filled('status'), fn (Builder $q) => $q->where('status', $request->string('status')->value()))
            ->when($request->boolean('open'), fn (Builder $q) => $q->open())
            ->when($request->filled('reason'), fn (Builder $q) => $q->where('reason', $request->string('reason')->value()))
            ->when($request->filled('q'), function (Builder $q) use ($request) {
                $like = '%'.addcslashes($request->string('q')->value(), '%_\\').'%';

                $q->where(fn (Builder $w) => $w
                    ->where('reference', 'like', $like)
                    ->orWhereHas('order', fn (Builder $o) => $o
                        ->where('order_number', 'like', $like)
                        ->orWhere('customer_name', 'like', $like)
                        ->orWhere('customer_email', 'like', $like)));
            });

        // What is waiting first, oldest first — a queue; then the rest, newest first.
        ListSort::apply($query, $request, self::SORTS, fn (Builder $q) => $q
            ->orderByRaw('CASE WHEN status = ? THEN 0 WHEN status IN (?, ?) THEN 1 ELSE 2 END', [
                ReturnStatus::Requested->value, ReturnStatus::Approved->value, ReturnStatus::Received->value,
            ])
            ->orderByRaw('CASE WHEN status = ? THEN created_at END ASC', [ReturnStatus::Requested->value])
            ->orderByDesc('created_at'));

        $returns = $query->paginate(min(max($request->integer('per_page', 25), 1), 100))->withQueryString();

        return OrderReturnResource::collection($returns)->additional(['meta' => [
            'statuses' => ReturnStatus::options(),
            'reasons' => ReturnReason::options(),
            'waiting_count' => OrderReturn::query()->waiting()->count(),
            'open_count' => OrderReturn::query()->open()->count(),
        ]]);
    }

    public function show(OrderReturn $orderReturn): JsonResource
    {
        return $this->resource($orderReturn);
    }

    /** The note colleagues read. Never mailed, never on the customer's resource. */
    public function update(Request $request, OrderReturn $orderReturn): JsonResource
    {
        $data = $request->validate(['staff_note' => ['nullable', 'string', 'max:5000']]);

        $orderReturn->forceFill(['staff_note' => filled($data['staff_note'] ?? null) ? trim((string) $data['staff_note']) : null])->save();

        return $this->resource($orderReturn);
    }

    public function approve(Request $request, OrderReturn $orderReturn): JsonResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:2000']]);

        return $this->resource(ReturnActions::approve($orderReturn, $request->user(), $data['note'] ?? null));
    }

    public function reject(Request $request, OrderReturn $orderReturn): JsonResource
    {
        $data = $request->validate(
            ['note' => ['required', 'string', 'max:2000']],
            ['note.required' => 'Say why — this is what the customer is told.'],
        );

        return $this->resource(ReturnActions::reject($orderReturn, $request->user(), $data['note']));
    }

    public function receive(Request $request, OrderReturn $orderReturn): JsonResource
    {
        $data = $request->validate([
            'items' => ['sometimes', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.received_quantity' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'items.*.restock' => ['sometimes', 'boolean'],
        ]);

        $lines = [];
        foreach ($data['items'] ?? [] as $row) {
            $lines[(int) $row['id']] = [
                'received_quantity' => $row['received_quantity'] ?? null,
                'restock' => (bool) ($row['restock'] ?? false),
            ];
        }

        return $this->resource(ReturnActions::receive($orderReturn, $request->user(), $lines));
    }

    public function refund(Request $request, OrderReturn $orderReturn): JsonResource
    {
        $data = $request->validate([
            'amount_paise' => ['required', 'integer', 'min:1'],
            'reference' => ['required', 'string', 'max:191'],
            'note' => ['nullable', 'string', 'max:2000'],
        ], [
            'amount_paise.required' => 'Enter how much went back.',
            'reference.required' => "Enter the gateway's refund id or the bank reference. It is what ties this to a line on the statement.",
        ]);

        return $this->resource(ReturnActions::refund($orderReturn, $request->user(), $data));
    }

    public function close(Request $request, OrderReturn $orderReturn): JsonResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:2000']]);

        return $this->resource(ReturnActions::close($orderReturn, $request->user(), $data['note'] ?? null));
    }

    /** One photograph, streamed. A photo of another return is a 404. */
    public function photo(OrderReturn $orderReturn, int $photo): StreamedResponse
    {
        /** @var OrderReturnPhoto|null $row */
        $row = $orderReturn->photos()->whereKey($photo)->first();

        abort_if($row === null || ! ReturnPhotos::exists($row), 404);

        return ReturnPhotos::stream($row);
    }

    private function resource(OrderReturn $return): OrderReturnResource
    {
        $return = $return->fresh() ?? $return;
        $return->load(['order', 'items.orderItem', 'photos', 'decider', 'refundPayment']);

        return (new OrderReturnResource($return))->detail();
    }
}
