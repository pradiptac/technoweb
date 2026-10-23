<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Support\Newsletter\SubscriberIntake;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class SubscriberController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = NewsletterSubscriber::query()->with('groups');
        ExtList::status($request, $query, SubscriberStatus::class);

        return ExtList::page($request, $query, fn (NewsletterSubscriber $s) => WebhookPayload::subscriber($s));
    }

    /** Through `SubscriberIntake`: a suppressed address stays off, a known one is only enriched. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:120',
            'last_name' => 'nullable|string|max:120',
            'company' => 'nullable|string|max:160',
            'phone' => 'nullable|string|max:40',
            'group_ids' => 'nullable|array|max:50',
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id', function ($attribute, $value, $fail) {
                if (NewsletterGroup::whereKey($value)->where('source', 'customers')->exists()) {
                    $fail('That group is kept from the customer list and cannot be joined here.');
                }
            }],
        ]);

        $result = SubscriberIntake::take(
            $data['email'],
            Arr::only($data, ['first_name', 'last_name', 'company', 'phone']),
            $data['group_ids'] ?? [],
            'api',
        );
        $subscriber = $result['subscriber'];

        return response()->json([
            'outcome' => $result['outcome'],
            'data' => $subscriber === null ? null : WebhookPayload::subscriber($subscriber->load('groups')),
        ]);
    }
}
