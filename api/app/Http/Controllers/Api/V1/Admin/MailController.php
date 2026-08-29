<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MailTransport;
use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\MailOAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

                /*
                 * The queue, because mail now leaves through it.
                 *
                 * Moving the send off the request path traded one silent
                 * failure for another: if the scheduler stops, nothing throws,
                 * nothing is logged and no `mail_error` is written — jobs
                 * simply accumulate and every receipt stops arriving, from a
                 * console that looks perfectly healthy. `mail_error` exists
                 * because that failure mode is unacceptable; this is the same
                 * argument applied to the thing that replaced the send.
                 *
                 * `oldest_seconds` is the figure that matters, not `pending`:
                 * a hundred jobs queued in the last ten seconds is a busy
                 * minute, and one job sitting for an hour is a broken
                 * deployment.
                 */
                'queue' => self::queueHealth(),
            ],
        ]);
    }

    /**
     * How the mail queue is doing.
     *
     * Reads the `database` queue directly rather than through the Queue
     * facade, which has no "how old is the oldest job" question. Guarded,
     * because a deployment on a different queue driver has no such table and
     * this must degrade to "cannot tell" rather than 500 the settings screen.
     */
    private static function queueHealth(): array
    {
        if (config('queue.default') !== 'database') {
            return ['driver' => config('queue.default'), 'known' => false];
        }

        try {
            $oldest = DB::table('jobs')->min('available_at');

            return [
                'driver' => 'database',
                'known' => true,
                'pending' => DB::table('jobs')->count(),
                'failed' => DB::table('failed_jobs')->count(),
                // Seconds, so the console decides what "too long" looks like
                // rather than the API hard-coding a threshold into a word.
                'oldest_seconds' => $oldest === null ? null : max(0, time() - (int) $oldest),
            ];
        } catch (\Throwable) {
            return ['driver' => 'database', 'known' => false];
        }
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
     * It defaults to the signed-in administrator and accepts one other
     * address, because the question this button answers is often "does our
     * mail reach *outside*" — a Gmail inbox proves SPF, DKIM and reputation in
     * a way a message to the same domain never can, and without this the only
     * way to check was to change the account's own address.
     *
     * **The body is fixed and the caller cannot influence it**, which is the
     * line between this and an open relay. What can be posted is one
     * self-identifying sentence, from an authenticated administrator, at six a
     * minute, recorded in the activity log with the recipient. Somebody who
     * holds an administrator session can already change every address the site
     * sends to; what they must not gain here is a way to write arbitrary mail
     * over this server's reputation.
     */
    public function test(Request $request): JsonResponse
    {
        $staff = $request->user();

        $data = $request->validate([
            // `email:dns` is deliberately absent — it is a DNS lookup on the
            // request path, which this project has already measured the cost
            // of once, and a send that fails tells you more than an MX record.
            'email' => ['sometimes', 'nullable', 'email:rfc', 'max:255'],
        ], [
            'email.email' => 'That does not look like an email address.',
        ]);

        $recipient = filled($data['email'] ?? null) ? trim((string) $data['email']) : $staff->email;

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
                fn ($message) => $message->to($recipient)->subject('Technoware test message'),
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
            'data' => ['sent_to' => $recipient, 'transport' => $transport->label()],
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
