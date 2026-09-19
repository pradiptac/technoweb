<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\InboundMailProvider;
use App\Http\Controllers\Controller;
use App\Models\InboundEmail;
use App\Models\Setting;
use App\Models\TicketCategory;
use App\Support\InboundMail\InboundMail;
use App\Support\InboundMail\Mailbox;
use App\Support\OAuth\CallbackPath;
use App\Support\OAuth\OAuthConnection;
use App\Support\QueueHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The support mailbox tickets are read from: connecting it, and proving it
 * can be read. Behind role:admin, beside MailController, and for the same
 * reason separate from SettingController — none of this is a key/value
 * write. The credentials it reads and writes are ordinary settings rows in
 * the `tickets` group, which is where the two meet.
 */
class InboundMailController extends Controller
{
    private const CALLBACK = '/admin/settings/tickets/callback';

    /** What the Ticketing panel needs to draw itself. */
    public function status(): JsonResponse
    {
        $provider = InboundMail::provider();
        $oauth = $provider?->isOAuth() ? OAuthConnection::inbound($provider) : null;

        $recent = InboundEmail::query()
            ->with('ticket:id,reference')
            ->latest('id')
            ->limit(10)
            ->get()
            ->map(fn (InboundEmail $row) => [
                'id' => $row->id,
                'from' => $row->from_email,
                'from_name' => $row->from_name,
                'subject' => $row->subject,
                'outcome' => $row->outcome,
                'reason' => $row->reason,
                'ticket_reference' => $row->ticket?->reference,
                'received_at' => $row->received_at?->toIso8601String(),
                'created_at' => $row->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'data' => [
                'enabled' => InboundMail::enabled(),
                'switched_on' => InboundMail::switchedOn(),
                'provider' => $provider?->value,
                'providers' => array_map(fn (InboundMailProvider $p) => $p->toOption(), InboundMailProvider::cases()),
                'address' => InboundMail::address(),
                'account' => Setting::get('inbound_oauth_account'),
                'connected_at' => Setting::get('inbound_oauth_connected_at'),
                'is_connected' => $oauth?->isConnected() ?? false,
                'folder' => InboundMail::folder(),
                'moves_processed' => InboundMail::movesProcessed(),
                'processed_folder' => InboundMail::processedFolder(),
                // Surfaced rather than logged — the `mail_error` pattern.
                'error' => Setting::get('inbound_mail_error'),
                'last_run_at' => Setting::get('inbound_mail_last_run'),
                // Piping runs on the scheduler, so when the scheduler has
                // stopped the mailbox is simply not read, silently. The panel
                // says so from the same heartbeat the mail screen reads.
                'scheduler' => QueueHealth::scheduler(),
                'categories' => TicketCategory::query()->where('is_active', true)->orderBy('sort_order')->orderBy('name')
                    ->get(['id', 'name'])->map(fn (TicketCategory $c) => ['id' => $c->id, 'name' => $c->name]),
                'callback_path' => self::CALLBACK,
                /*
                 * What this PHP has that the IMAP library needs. The library
                 * declares ext-zip; a server installed with the platform
                 * check skipped would fail at the first connection, so the
                 * panel says whether it is on *before* anybody saves a
                 * password — and reminds them to tick the same box on the
                 * server they deploy to.
                 */
                'php' => InboundMail::phpRequirements(),
                'recent' => $recent,
            ],
        ]);
    }

    /** The consent URL to send the administrator to. */
    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => ['required', Rule::in(['google', 'microsoft'])],
            // Supplied by the frontend, which alone knows the origin it is
            // reachable at; checked against a strict shape below.
            'redirect_uri' => ['required', 'url', 'max:300'],
        ]);

        $redirect = CallbackPath::assert($data['redirect_uri'], self::CALLBACK);
        $provider = InboundMailProvider::from($data['provider']);

        try {
            $result = OAuthConnection::inbound($provider)->authorizeUrl($redirect, ['provider' => $provider->value]);
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
            // The state was minted for a provider; that is the one the code
            // is exchanged with, whatever the settings say by now.
            $probe = InboundMailProvider::current()?->isOAuth() ? InboundMailProvider::current() : InboundMailProvider::Google;
            $stored = OAuthConnection::inbound($probe)->consumeState($data['state']);
            $provider = InboundMailProvider::tryFrom((string) ($stored['extra']['provider'] ?? '')) ?? $probe;

            $account = OAuthConnection::inbound($provider)->exchange($data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // The provider is settled by the consent that just completed, and
        // the address customers write to is the connected one unless the
        // administrator typed a different one.
        Setting::put('inbound_mail_provider', $provider->value);
        if (blank(Setting::get('inbound_mail_address')) && filter_var($account, FILTER_VALIDATE_EMAIL)) {
            Setting::put('inbound_mail_address', strtolower($account));
        }

        return response()->json(['data' => ['account' => $account, 'provider' => $provider->value]]);
    }

    public function disconnect(): JsonResponse
    {
        foreach ([InboundMailProvider::Google, InboundMailProvider::Microsoft] as $provider) {
            OAuthConnection::inbound($provider)->disconnect();
        }

        return response()->json(['data' => ['is_connected' => false]]);
    }

    /**
     * Connect, select the folder, count what is waiting — and report what
     * actually happened, in the server's own words. Reads only: nothing is
     * flagged, moved or turned into a ticket, so the button is safe to
     * press on a live inbox.
     */
    public function test(): JsonResponse
    {
        $provider = InboundMail::provider();

        if ($provider === null) {
            return response()->json(['message' => 'Choose how the mailbox is reached and save first.'], 422);
        }

        if (! InboundMail::enabled() && ! $this->configured()) {
            return response()->json(['message' => $provider->isOAuth()
                ? 'Connect the mailbox first.'
                : 'Fill in the host, username and password and save first.'], 422);
        }

        try {
            $result = app(Mailbox::class)->probe();
        } catch (\Throwable $e) {
            InboundMail::fail($e->getMessage());

            return response()->json(['message' => $e->getMessage()], 422);
        }

        InboundMail::clearError();

        return response()->json(['data' => $result]);
    }

    /** Enough saved to attempt a connection, whatever the switch says. */
    private function configured(): bool
    {
        $provider = InboundMail::provider();

        if ($provider === null) {
            return false;
        }

        if ($provider->isOAuth()) {
            return OAuthConnection::inbound($provider)->isConnected();
        }

        return filled(Setting::get('inbound_imap_host'))
            && filled(Setting::get('inbound_imap_username'))
            && filled(Setting::get('inbound_imap_password'));
    }
}
