<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Models\NewsletterSubscriber;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriberController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = NewsletterSubscriber::query()->with('groups');
        ExtList::status($request, $query, SubscriberStatus::class);

        return ExtList::page($request, $query, fn (NewsletterSubscriber $s) => WebhookPayload::subscriber($s));
    }
}
