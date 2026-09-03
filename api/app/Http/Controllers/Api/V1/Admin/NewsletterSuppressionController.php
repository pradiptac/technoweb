<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Http\Controllers\Controller;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Setting;
use App\Support\Newsletter\BounceWebhook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The do-not-mail list.
 *
 * Read-mostly on purpose. Adding is ordinary; removing is not, and this
 * refuses to lift a suppression that the person put there themselves.
 */
class NewsletterSuppressionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = NewsletterSuppression::query()
            ->when($request->filled('q'), fn ($q) => $q->where('email', 'like', '%'.$request->string('q').'%'))
            ->when($request->filled('reason'), fn ($q) => $q->where('reason', $request->string('reason')))
            ->latest('id')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        $rows->getCollection()->transform(fn (NewsletterSuppression $s) => [
            'id' => $s->id,
            'email' => $s->email,
            'reason' => $s->reason->value,
            'reason_label' => $s->reason->label(),
            'note' => $s->note,
            'created_at' => $s->created_at?->toIso8601String(),
            // Whether staff are allowed to lift it at all.
            'can_lift' => ! $s->reason->isTheirDecision(),
        ]);

        return response()->json($rows->toArray() + ['meta' => [
            'reasons' => SuppressionReason::options(),
            'total' => NewsletterSuppression::count(),
            /*
             * What to paste into the mail provider's dashboard.
             *
             * Built from **this** route table rather than assembled in the
             * console, for the reason `TrackingRewriter` builds the pixel and
             * click URLs the same way: the console runs on the frontend origin
             * and the webhook lives on the API's, so a URL the console composed
             * would be a second answer to where this endpoint is — and the
             * newsletter has already shipped one of those, when every campaign
             * carried a tracking pixel that answered 404.
             *
             * `APP_URL` therefore has to be the public API origin, which is the
             * same requirement the open and click URLs already impose.
             *
             * `secret_set` and never the secret: it is encrypted at rest and no
             * admin response returns a credential, the rule the SMTP password
             * follows. Without it the endpoint accepts nothing, so whether one
             * exists is the single fact the screen has to be able to show.
             */
            'webhook' => [
                'secret_set' => filled(Setting::get('newsletter_webhook_secret')),
                'providers' => collect(BounceWebhook::PROVIDERS)
                    ->map(fn (string $p) => [
                        'value' => $p,
                        'url' => route('api.v1.newsletter.webhook', ['provider' => $p]),
                    ])
                    ->all(),
            ],
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $row = NewsletterSuppression::add($data['email'], SuppressionReason::Manual, $data['note'] ?? null);

        // The subscriber row is marked too, so the list screen agrees with
        // this one rather than showing them as active.
        NewsletterSubscriber::where('email', $row->email)->update([
            'status' => SubscriberStatus::Suppressed,
            'updated_at' => now(),
        ]);

        return response()->json(['data' => ['id' => $row->id, 'email' => $row->email]], 201);
    }

    /**
     * Lift a suppression — and refuse to, when the person put it there.
     *
     * A hard bounce is a fact about a mailbox and can be wrong: the domain was
     * down, the mailbox was full, it works again now. An unsubscribe or a spam
     * complaint is a decision by a person, and the only party who may reverse
     * it is that person. An endpoint that treats those the same is one that
     * lets a tidy-up put somebody back on a list they left.
     */
    public function destroy(int $id): JsonResponse
    {
        $row = NewsletterSuppression::findOrFail($id);

        if ($row->reason->isTheirDecision()) {
            return response()->json([
                'message' => 'This address unsubscribed itself. Only they can undo that — ask them to sign up again.',
            ], 422);
        }

        $email = $row->email;
        $row->delete();

        NewsletterSubscriber::where('email', $email)
            ->where('status', '!=', SubscriberStatus::Unsubscribed->value)
            ->update(['status' => SubscriberStatus::Active, 'updated_at' => now()]);

        return response()->json(null, 204);
    }
}
