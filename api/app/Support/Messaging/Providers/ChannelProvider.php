<?php

namespace App\Support\Messaging\Providers;

use App\Models\MessageTemplate;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * One provider carrying one channel — the whole of what `Messenger`, the
 * settings screen, the templates screen and the webhook route ask of it.
 *
 * Laravel's HTTP client only, no vendor SDK, so every implementation is
 * testable with `Http::fake()` and nothing is added to the deploy.
 *
 * A failure is a `ProviderException` carrying the provider's own words —
 * the `mail/test` rule: "Recipient phone number not in allowed list" says
 * what to fix, where a friendlier sentence would not.
 */
interface ChannelProvider
{
    /** Every setting it reads to send is saved. */
    public function configured(): bool;

    /**
     * Send one message. Returns the provider's id for it, which its webhook
     * later names when it reports delivered or read.
     *
     * @throws ProviderException
     */
    public function send(OutgoingMessage $message): string;

    /**
     * Send the fixed test message to an address the administrator typed.
     * The body is not the caller's to choose — the line between a test
     * button and an open relay.
     *
     * @throws ProviderException
     */
    public function test(string $to): string;

    /**
     * Where the channel has approval (WhatsApp): the provider's list of
     * templates with their state. Empty for a channel that approves nothing.
     *
     * @return list<SyncedTemplate>
     *
     * @throws ProviderException
     */
    public function syncTemplates(): array;

    /**
     * Where the channel has approval: submit a template for review and
     * answer what the provider said.
     *
     * @throws ProviderException
     */
    public function submitTemplate(MessageTemplate $template): SyncedTemplate;

    /**
     * A provider's handshake, answered before any verification: Meta's GET
     * challenge, Google's `clientToken`/`secret` echo. Null when the request
     * is not one.
     */
    public function challenge(Request $request): ?Response;

    /**
     * Whether a webhook request proves it came from the provider. **Fails
     * closed**: with no secret configured nothing is accepted, the bounce
     * webhook's rule — a forged STOP would silently opt people out.
     */
    public function verifyWebhook(Request $request): bool;

    /**
     * What a verified webhook reported.
     *
     * @return list<ProviderEvent>
     */
    public function webhookEvents(Request $request): array;
}
