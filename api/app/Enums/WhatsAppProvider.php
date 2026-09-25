<?php

namespace App\Enums;

use App\Support\Messaging\ProviderOption;
use App\Support\Messaging\Providers\ChannelProvider;
use App\Support\Messaging\Providers\GupshupWhatsApp;
use App\Support\Messaging\Providers\MetaCloudWhatsApp;
use App\Support\Messaging\Providers\TwilioWhatsApp;

/**
 * Who carries WhatsApp for this install — pluggable per channel, the
 * client's decision of 2026-09-24. `MailTransport`'s shape: label, blurb,
 * the settings each reads, and the client that drives it. Laravel's HTTP
 * client throughout; no vendor SDK.
 */
enum WhatsAppProvider: string implements ProviderOption
{
    case MetaCloud = 'meta_cloud';
    case Gupshup = 'gupshup';
    case Twilio = 'twilio';

    public function id(): string
    {
        return $this->value;
    }

    public function label(): string
    {
        return match ($this) {
            self::MetaCloud => 'Meta WhatsApp Cloud API',
            self::Gupshup => 'Gupshup',
            self::Twilio => 'Twilio',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::MetaCloud => 'Straight to Meta. The phone number id and the WhatsApp Business account id are on the API Setup page; use a system user\'s permanent token, not the 24-hour one. The app secret signs the webhook.',
            self::Gupshup => 'Your Gupshup app\'s API key, app name and id, and the sender number. The webhook is verified by the shared secret below, which goes on the end of the callback URL.',
            self::Twilio => 'Account SID, auth token and the WhatsApp sender number. Templates are Twilio Content with a WhatsApp approval request; the auth token also signs the webhook.',
        };
    }

    public function fields(): array
    {
        return match ($this) {
            self::MetaCloud => ['whatsapp_meta_phone_number_id', 'whatsapp_meta_business_account_id', 'whatsapp_meta_access_token', 'whatsapp_meta_app_secret', 'whatsapp_meta_verify_token'],
            self::Gupshup => ['whatsapp_gupshup_api_key', 'whatsapp_gupshup_app_name', 'whatsapp_gupshup_app_id', 'whatsapp_gupshup_source', 'messaging_webhook_secret'],
            self::Twilio => ['whatsapp_twilio_account_sid', 'whatsapp_twilio_auth_token', 'whatsapp_twilio_from'],
        };
    }

    public function isAvailable(): bool
    {
        return true;
    }

    public function client(): ChannelProvider
    {
        return match ($this) {
            self::MetaCloud => new MetaCloudWhatsApp,
            self::Gupshup => new GupshupWhatsApp,
            self::Twilio => new TwilioWhatsApp,
        };
    }
}
