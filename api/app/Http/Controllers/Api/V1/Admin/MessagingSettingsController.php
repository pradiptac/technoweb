<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\Messaging\Contacts;
use App\Support\Messaging\ProviderOption;
use App\Support\Messaging\Providers\ProviderException;
use App\Support\Messaging\QuietHours;
use App\Support\QueueHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The messaging channels' configuration, and proving each one works —
 * `role:admin`, because what it reads and writes are provider keys.
 *
 * The values themselves are ordinary settings rows, saved through
 * `PATCH /admin/settings` like every other; this answers what the screen
 * needs to draw itself (which providers exist, what each reads, whether
 * the chosen one is ready, the webhook URL to paste) and sends a test.
 */
class MessagingSettingsController extends Controller
{
    public function status(): JsonResponse
    {
        return response()->json(['data' => [
            'channels' => array_map(fn (MessageChannel $c) => [
                'value' => $c->value,
                'label' => $c->label(),
                'setting' => $c->settingKey(),
                'provider' => $c->current()?->id(),
                'ready' => $c->ready(),
                'address_kind' => $c->addressKind(),
                'needs_approval' => $c->needsApproval(),
                'error' => Setting::get($c->errorKey()),
                'providers' => array_map(fn (ProviderOption $p) => [
                    'value' => $p->id(),
                    'label' => $p->label(),
                    'blurb' => $p->blurb(),
                    'fields' => $p->fields(),
                    'available' => $p->isAvailable(),
                    'configured' => $p->client()->configured(),
                    /*
                     * Built from the route table, never written down — the
                     * payment webhook's rule: a URL typed into a template
                     * keeps pointing at the old path after a route moves,
                     * and the failure is weeks of silence. Push has none.
                     */
                    'webhook_url' => $c === MessageChannel::Push ? null
                        : route('api.v1.messaging.webhook', ['channel' => $c->value, 'provider' => $p->id()]),
                    'webhook_secret_param' => in_array('messaging_webhook_secret', $p->fields(), true),
                ], $c->providers()),
            ], MessageChannel::cases()),
            'quiet_hours' => [
                'start' => (string) Setting::get('messaging_promo_start', QuietHours::DEFAULT_START),
                'end' => (string) Setting::get('messaging_promo_end', QuietHours::DEFAULT_END),
                'open_now' => QuietHours::allows(),
                'next_opening' => QuietHours::nextOpening()->toIso8601String(),
                'timezone' => config('app.timezone'),
            ],
            'queue' => QueueHealth::read(),
        ]]);
    }

    /**
     * One real message, the mail test's rules: a fixed body the caller
     * cannot influence, to an address the administrator typed, six a
     * minute, the provider's own words on a refusal — and a refusal of the
     * credentials written to the channel's banner, a success clearing it.
     */
    public function test(Request $request): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', Rule::enum(MessageChannel::class)],
            'to' => ['required', 'string', 'max:500'],
        ]);

        $channel = MessageChannel::from($data['channel']);
        $provider = $channel->current();

        if ($provider === null) {
            return response()->json(['message' => "Choose a provider for {$channel->label()} and save first."], 422);
        }

        if (! $provider->isAvailable()) {
            return response()->json(['message' => "{$provider->label()} needs the OpenSSL extension, which this server's PHP does not have."], 422);
        }

        if (! $provider->client()->configured()) {
            return response()->json(['message' => "Fill in {$provider->label()}'s details and save first."], 422);
        }

        $to = Contacts::normalise($channel, $data['to']);

        if ($to === null) {
            throw ValidationException::withMessages(['to' => $channel->addressKind() === 'phone'
                ? 'Give a mobile number — ten digits, or with its country code after a +.'
                : 'Paste a registration token: allow notifications on the site with the bell, and copy the token the browser console prints.']);
        }

        try {
            $id = $provider->client()->test($to);
        } catch (ProviderException $e) {
            Setting::put($channel->errorKey(), $e->getMessage().' ('.now()->toDayDateTimeString().')');
            Log::warning('Messaging test failed', ['channel' => $channel->value, 'provider' => $provider->id(), 'error' => $e->getMessage()]);

            return response()->json(['message' => $e->getMessage(), 'provider' => $provider->label()], 422);
        }

        Setting::put($channel->errorKey(), null);

        return response()->json(['data' => ['sent_to' => $channel->addressKind() === 'phone' ? $to : 'that browser', 'provider' => $provider->label(), 'id' => $id]]);
    }
}
