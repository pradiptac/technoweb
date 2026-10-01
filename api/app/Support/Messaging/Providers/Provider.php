<?php

namespace App\Support\Messaging\Providers;

use App\Models\MessageTemplate;
use App\Models\Setting;
use App\Support\Messaging\Samples;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * What the six providers share: reading their settings, the fixed test
 * sentence, turning a transport failure into a `ProviderException`, and the
 * defaults for the parts a channel does not have.
 */
abstract class Provider implements ChannelProvider
{
    protected const TIMEOUT = 15;

    /** What every test says. Fixed, so the button cannot be a relay. */
    public const TEST_BODY = 'This is a test from your admin console. If you are reading it, this channel is working.';

    /** The provider's name in an error sentence. */
    abstract protected function name(): string;

    protected function setting(string $key): string
    {
        return trim((string) Setting::get($key));
    }

    /** @param  list<string>  $keys */
    protected function allFilled(array $keys): bool
    {
        foreach ($keys as $key) {
            if ($this->setting($key) === '') {
                return false;
            }
        }

        return true;
    }

    /**
     * Run a request, turning a network failure into the provider's error
     * rather than a stack trace.
     *
     * @param  callable(): Response  $request
     */
    protected function call(callable $request): Response
    {
        try {
            return $request();
        } catch (ConnectionException $e) {
            throw new ProviderException("{$this->name()} could not be reached: {$e->getMessage()}");
        }
    }

    public function syncTemplates(): array
    {
        return [];
    }

    public function submitTemplate(MessageTemplate $template): SyncedTemplate
    {
        throw new ProviderException("{$this->name()} does not review templates; nothing needs submitting.");
    }

    public function challenge(Request $request): ?HttpResponse
    {
        return null;
    }

    public function verifyWebhook(Request $request): bool
    {
        return false;
    }

    public function webhookEvents(Request $request): array
    {
        return [];
    }

    /**
     * The shared secret for providers that sign nothing (Gupshup): on the
     * callback URL as `?token=` or in an `X-Webhook-Secret` header, compared
     * with `hash_equals`. No secret configured accepts nothing.
     */
    protected function sharedSecretMatches(Request $request): bool
    {
        $secret = $this->setting('messaging_webhook_secret');

        if ($secret === '') {
            return false;
        }

        $given = (string) ($request->query('token') ?? $request->header('X-Webhook-Secret', ''));

        return $given !== '' && hash_equals($secret, $given);
    }

    /** The template's language as a provider code, `en` by default. */
    protected function language(MessageTemplate $template): string
    {
        return filled($template->language) ? (string) $template->language : 'en';
    }

    /** The example a provider insists on when reviewing a template. */
    protected function sample(string $name): string
    {
        return Samples::value($name);
    }
}
