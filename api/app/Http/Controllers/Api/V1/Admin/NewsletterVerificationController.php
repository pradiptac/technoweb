<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\EmailVerification;
use App\Http\Controllers\Controller;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterVerification;
use App\Support\Newsletter\HunterClient;
use App\Support\Newsletter\SubscriberVerifier;
use Illuminate\Http\JsonResponse;

/**
 * The verification screen: the breakdown, the allowance, the queue, and the
 * last twenty things Hunter said.
 *
 * Every figure here comes from stored rows. Hunter's own `used`/`available`
 * is the one exception and is cached for an hour, so opening the screen
 * costs nothing on the plan and nothing on the request when the cache holds.
 */
class NewsletterVerificationController extends Controller
{
    public function show(SubscriberVerifier $verifier): JsonResponse
    {
        $counts = NewsletterSubscriber::query()
            ->selectRaw('verification, count(*) as total')
            ->groupBy('verification')
            ->pluck('total', 'verification');

        $budget = $verifier->budget();

        return response()->json(['data' => [
            'configured' => HunterClient::configured(),
            'paused' => $budget['cap'] === 0,
            'breakdown' => collect(EmailVerification::cases())
                ->mapWithKeys(fn (EmailVerification $c) => [$c->value => (int) ($counts[$c->value] ?? 0)])
                ->all(),
            'month' => $budget,
            'hunter' => $verifier->accountCached(),
            'queue' => $verifier->estimate($budget),
            'last_run_at' => SubscriberVerifier::lastRunAt(),
            'error' => SubscriberVerifier::error(),
            'recent' => NewsletterVerification::latest('id')->limit(20)->get()
                ->map(fn (NewsletterVerification $v) => [
                    'id' => $v->id,
                    'email' => $v->email,
                    'subscriber_id' => $v->newsletter_subscriber_id,
                    'http_status' => $v->http_status,
                    'status' => $v->status,
                    'score' => $v->score,
                    'source' => $v->source,
                    'created_at' => $v->created_at?->toIso8601String(),
                ]),
        ]]);
    }
}
