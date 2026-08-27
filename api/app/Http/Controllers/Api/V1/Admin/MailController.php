<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MailTransport;
use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\MailOAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

/**
 * Connecting a mailbox, and proving mail works. Behind role:admin.
 *
 * Separate from SettingController because none of this is a settings write:
 * one endpoint talks to Google, one sends a message, and both fail in ways a
 * key/value update has no vocabulary for. The credentials they read and write
 * are ordinary settings rows, which is where the two meet.
 */
class MailController extends Controller
{
    /**
     * What the settings screen needs to draw itself.
     *
     * Availability travels with the option. Four transports need a composer
     * package this project does not ship, and an editor choosing one that is
     * absent should be told before they save, not by a class-not-found when
     * the next ticket tries to send a receipt.
     */
    public function status(): JsonResponse
    {
        $current = MailTransport::current();

        return response()->json([
            'data' => [
                'transport' => filled(Setting::get('mail_transport')) ? $current->value : null,
                'transports' => array_map(fn (MailTransport $t) => [
                    'value' => $t->value,
                    'label' => $t->label(),
                    'blurb' => $t->blurb(),
                    'fields' => $t->fields(),
                    'is_oauth' => $t->isOAuth(),
                    'available' => $t->isAvailable(),
                    'install' => $t->installCommand(),
                ], MailTransport::cases()),
                'account' => Setting::get('oauth_account'),
                'connected_at' => Setting::get('oauth_connected_at'),
                'is_connected' => filled(Setting::get('oauth_refresh_token')),
                // Surfaced rather than logged. See MailOAuth::fail().
                'error' => Setting::get('mail_error'),
            ],
        ]);
    }

    /** The consent URL to send the administrator to. */
    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate([
            'transport' => ['required', Rule::in(['google'])],
            // Supplied by the frontend rather than built here: the console and
            // the API are different origins, and only the frontend knows the
            // URL it is actually reachable at. Checked against a strict shape
            // below — an open redirect here would hand somebody an
            // authorisation code.
            'redirect_uri' => ['required', 'url', 'max:300'],
        ]);

        $redirect = $this->safeRedirect($data['redirect_uri']);

        try {
            $result = MailOAuth::authorizeUrl(MailTransport::from($data['transport']), $redirect);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $result['url']]]);
    }

    /** Google sends the browser back here, via the console's own callback page. */
    public function callback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:2000'],
            'state' => ['required', 'string', 'max:200'],
        ]);

        try {
            $stored = MailOAuth::consumeState($data['state']);
            $account = MailOAuth::exchange($stored['transport'], $data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['account' => $account]]);
    }

    public function disconnect(): JsonResponse
    {
        MailOAuth::disconnect();

        return response()->json(['data' => ['is_connected' => false]]);
    }

    /**
     * Send one real message, and report what actually happened.
     *
     * The only endpoint in this application that is *allowed* to fail on a
     * mail error. Everywhere else `Notifier` swallows, because a committed
     * ticket must still answer 201 when mail is down — which means that until
     * now the only way to discover a broken configuration was for a customer's
     * receipt not to arrive. This is the screen asking the question directly.
     *
     * It goes to the signed-in administrator, never to an address in the
     * request: an authenticated endpoint that posts arbitrary mail to an
     * arbitrary recipient is an open relay with extra steps.
     */
    public function test(Request $request): JsonResponse
    {
        $staff = $request->user();
        $transport = MailTransport::current();

        if (! $transport->isAvailable()) {
            return response()->json([
                'message' => "{$transport->label()} is not installed on this server. Run: {$transport->installCommand()}",
            ], 422);
        }

        try {
            Mail::raw(
                "This is a test from the Technoware admin console.\n\n"
                .'If you are reading it, outgoing mail is working: ticket receipts, enquiry '
                ."alerts and password resets will reach people.\n\n"
                ."Sent via {$transport->label()} at ".now()->toDayDateTimeString().'.',
                fn ($message) => $message->to($staff->email)->subject('Technoware test message'),
            );
        } catch (\Throwable $e) {
            // Recorded as well as returned, so the banner agrees with what the
            // person pressing the button was just told.
            MailOAuth::fail($e->getMessage());
            Log::warning('Mail test failed', ['transport' => $transport->value, 'error' => $e->getMessage()]);

            return response()->json([
                'message' => $e->getMessage(),
                'transport' => $transport->label(),
            ], 422);
        }

        Setting::put('mail_error', null);

        return response()->json([
            'data' => ['sent_to' => $staff->email, 'transport' => $transport->label()],
        ]);
    }

    /**
     * Only ever this application's own callback path.
     *
     * The redirect is echoed to Google and then used again when the code is
     * exchanged, so an unchecked value is an open redirect that ends with
     * somebody else holding an authorisation code for this site's mailbox. The
     * host is compared against the configured frontend exactly — `str_contains`
     * would accept `technoware.in.attacker.test`, the same reasoning the
     * YouTube parser already follows.
     */
    private function safeRedirect(string $url): string
    {
        $allowed = parse_url((string) config('app.frontend_url'), PHP_URL_HOST);
        $host = parse_url($url, PHP_URL_HOST);
        $path = parse_url($url, PHP_URL_PATH);

        $isLocal = in_array($host, ['localhost', '127.0.0.1'], true);

        abort_unless(
            ($host === $allowed || $isLocal) && $path === '/admin/settings/mail/callback',
            422,
            'That is not this site\'s callback address.',
        );

        return $url;
    }
}
