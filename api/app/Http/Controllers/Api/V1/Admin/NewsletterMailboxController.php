<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\InboundMailProvider;
use App\Http\Controllers\Controller;
use App\Models\NewsletterImport;
use App\Models\Setting;
use App\Support\Newsletter\MailboxImport;
use App\Support\OAuth\CallbackPath;
use App\Support\QueueHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Connecting the mailbox a subscriber import scans.
 *
 * The consent half of the mailbox import: the same four verbs the ticket
 * mailbox has, on the newsletter's own slot, behind `role:campaign_manager`
 * — the consent is the credential, and the app registration it rides on is
 * saved once by an administrator under Settings → Ticketing. The scan
 * itself is `NewsletterImportController::scan()`.
 */
class NewsletterMailboxController extends Controller
{
    /** What the import screen needs to draw its first step. */
    public function status(): JsonResponse
    {
        $provider = MailboxImport::connectedProvider();

        $active = NewsletterImport::query()
            ->mailbox()
            ->whereIn('status', ['pending', 'scanning', 'ready'])
            ->latest('id')
            ->first();

        return response()->json([
            'data' => [
                'providers' => array_map(fn (InboundMailProvider $p) => $p->toOption(), MailboxImport::PROVIDERS),
                'provider' => $provider?->value,
                'account' => $provider !== null ? Setting::get('newsletter_oauth_account') : null,
                'connected_at' => $provider !== null ? Setting::get('newsletter_oauth_connected_at') : null,
                'is_connected' => $provider !== null,
                'client_configured' => MailboxImport::clientConfigured(),
                'error' => Setting::get('newsletter_oauth_error'),
                'callback_path' => MailboxImport::CALLBACK,
                'php' => MailboxImport::phpRequirements(),
                // A scan is queued work; with nothing draining the queue it
                // would sit as "pending" for ever, so the screen says so first.
                'delivering' => QueueHealth::delivering(),
                'active' => $active !== null ? NewsletterImportController::summary($active) : null,
            ],
        ]);
    }

    /** The consent URL to send the campaign manager to. */
    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => ['required', Rule::in(['google', 'microsoft'])],
            'redirect_uri' => ['required', 'url', 'max:300'],
        ]);

        $redirect = CallbackPath::assert($data['redirect_uri'], MailboxImport::CALLBACK);
        $provider = InboundMailProvider::from($data['provider']);

        if (! MailboxImport::clientConfigured()) {
            return response()->json([
                'message' => 'No OAuth client is saved. An administrator saves the client ID and secret under Settings → Ticketing; this screen only adds its own callback address to it.',
            ], 422);
        }

        try {
            $result = MailboxImport::oauth($provider)->authorizeUrl($redirect, ['provider' => $provider->value]);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $result['url']]]);
    }

    /** The provider sends the browser back here, via the console's own callback page. */
    public function callback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:4000'],
            'state' => ['required', 'string', 'max:200'],
        ]);

        try {
            // One slot, either provider: the state names which.
            $stored = MailboxImport::oauth(InboundMailProvider::Google)->consumeState($data['state']);
            $provider = InboundMailProvider::tryFrom((string) ($stored['extra']['provider'] ?? '')) ?? InboundMailProvider::Google;

            $account = MailboxImport::oauth($provider)->exchange($data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        Setting::put('newsletter_oauth_provider', $provider->value);

        return response()->json(['data' => ['account' => $account, 'provider' => $provider->value]]);
    }

    public function disconnect(): JsonResponse
    {
        MailboxImport::forgetConsent();

        return response()->json(['data' => ['is_connected' => false]]);
    }
}
