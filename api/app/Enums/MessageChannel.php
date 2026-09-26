<?php

namespace App\Enums;

use App\Models\Setting;
use App\Support\Messaging\ProviderOption;

/**
 * The channels a customer may be told something on, besides email.
 *
 * Shaped like `MailTransport` and for its reason: **the enum is the only
 * list.** Each channel names the provider enum that lists who can carry it,
 * the setting that records which one this install chose, and what kind of
 * address a contact holds on it — so the settings screen, the automations
 * table, `Messenger` and the webhook route are built from one place rather
 * than from four that then have to agree.
 *
 * A channel with no provider chosen is **off**, not broken: nothing is
 * offered on the checkout, nothing is queued, and the console says why.
 */
enum MessageChannel: string
{
    case WhatsApp = 'whatsapp';
    case Rcs = 'rcs';
    case Push = 'push';

    public function label(): string
    {
        return match ($this) {
            self::WhatsApp => 'WhatsApp',
            self::Rcs => 'RCS messages',
            self::Push => 'Browser push',
        };
    }

    /**
     * What a contact's address is on this channel: an E.164 mobile number
     * for the two phone channels, an FCM registration token for push.
     */
    public function addressKind(): string
    {
        return $this === self::Push ? 'token' : 'phone';
    }

    /**
     * Whether the provider must approve a template before it may be sent.
     *
     * WhatsApp only. Meta reviews every business-initiated template, and a
     * message sent against one it has not approved is refused at send time —
     * so `Messenger` skips an unapproved WhatsApp template rather than
     * spending a delivery row on a certain refusal. RCS and push have no such
     * step; their templates are `not_required`.
     */
    public function needsApproval(): bool
    {
        return $this === self::WhatsApp;
    }

    /** @return list<ProviderOption> */
    public function providers(): array
    {
        return match ($this) {
            self::WhatsApp => WhatsAppProvider::cases(),
            self::Rcs => RcsProvider::cases(),
            self::Push => PushProvider::cases(),
        };
    }

    public function provider(?string $value): ?ProviderOption
    {
        if ($value === null || $value === '') {
            return null;
        }

        return match ($this) {
            self::WhatsApp => WhatsAppProvider::tryFrom($value),
            self::Rcs => RcsProvider::tryFrom($value),
            self::Push => PushProvider::tryFrom($value),
        };
    }

    /** The setting that records which provider carries this channel. */
    public function settingKey(): string
    {
        return "messaging_{$this->value}_provider";
    }

    /** The row a configuration failure is written to — the `mail_error` pattern. */
    public function errorKey(): string
    {
        return "messaging_{$this->value}_error";
    }

    /** The chosen provider, or null while the channel is off. */
    public function current(): ?ProviderOption
    {
        return $this->provider((string) Setting::get($this->settingKey()));
    }

    /**
     * Whether a message can actually go out on this channel: a provider
     * chosen, the code for it present, and every credential it reads saved.
     * A live check of the stored settings, the `PaymentGateway::isConfigured`
     * rule, so the checkout never offers a channel that cannot deliver.
     */
    public function ready(): bool
    {
        $provider = $this->current();

        return $provider !== null && $provider->isAvailable() && $provider->client()->configured();
    }

    /** Every field any provider on any channel reads, for the settings form. */
    public static function allFields(): array
    {
        $fields = [];

        foreach (self::cases() as $channel) {
            foreach ($channel->providers() as $provider) {
                array_push($fields, ...$provider->fields());
            }
        }

        return array_values(array_unique($fields));
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
