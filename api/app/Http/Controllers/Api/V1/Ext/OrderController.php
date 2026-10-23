<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Order::query()->with('items');
        ExtList::status($request, $query, OrderStatus::class);
        if ($request->query('paid') === '1') {
            $query->paid();
        }

        return ExtList::page($request, $query, fn (Order $o) => WebhookPayload::order($o));
    }

    public function show(string $number): JsonResponse
    {
        $row = Order::with('items')->where('order_number', $number)->first();

        return $row === null ? ExtList::notFound() : response()->json(['data' => WebhookPayload::order($row)]);
    }
}
