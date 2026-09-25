<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Support\Messaging\Contacts;
use App\Support\Messaging\MessagingWebhook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The public half of messaging: providers reporting back, and a browser
 * subscribing to push.
 */
class MessagingController extends Controller
{
    /**
     * A provider's webhook. Un-throttled, like the payment and bounce
     * webhooks — a provider that gets a 429 retries harder — and 200 to
     * everything; see `MessagingWebhook`.
     */
    public function webhook(Request $request, string $channel, string $provider): Response
    {
        $channel = MessageChannel::tryFrom($channel);

        return $channel === null ? response('', 200) : MessagingWebhook::handle($channel, $provider, $request);
    }

    /**
     * The push bell. A guest's token is stored with no customer and is
     * reached by broadcasts only; a signed-in customer's — the portal token
     * forwarded by the Next server, read by name because this route is
     * public — is stamped with the account, so order and ticket updates
     * reach that browser too.
     *
     * 202 and one sentence whatever happened, so the endpoint says nothing
     * about which tokens exist.
     */
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:500']]);

        $user = $request->user('sanctum');

        // A staff member viewing as a customer must not subscribe their own
        // browser to that customer's order updates.
        if (MessageChannel::Push->ready() && ! ($user instanceof Customer && $user->isImpersonated())) {
            Contacts::optIn(MessageChannel::Push, $data['token'], $user instanceof Customer ? $user->id : null, 'push_bell', $user instanceof Customer ? $user->name : null);
        }

        return response()->json(['message' => 'Notifications are on for this browser.'], 202);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:500']]);

        Contacts::optOut(MessageChannel::Push, $data['token'], 'push_bell');

        return response()->json(['message' => 'Notifications are off for this browser.'], 202);
    }
}
