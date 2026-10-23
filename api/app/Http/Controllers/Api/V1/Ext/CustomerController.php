<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return ExtList::page($request, Customer::query(), fn (Customer $c) => WebhookPayload::customer($c));
    }

    public function show(string $id): JsonResponse
    {
        $row = ctype_digit($id) ? Customer::find($id) : null;

        return $row === null ? ExtList::notFound() : response()->json(['data' => WebhookPayload::customer($row)]);
    }
}
