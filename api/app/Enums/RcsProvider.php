<?php

namespace App\Enums;

use App\Support\Messaging\ProviderOption;
use App\Support\Messaging\Providers\ChannelProvider;
use App\Support\Messaging\Providers\GoogleRbm;
use App\Support\Messaging\Providers\GupshupRcs;

/**
 * Who carries RCS for this install. Google's RCS Business Messaging
 * directly, on a service account through `GoogleServiceAccount` (the one
 * token exchange Search Console and GA4 already share), or Gupshup.
 */
enum RcsProvider: string implements ProviderOption
{
    case GoogleRbm = 'google_rbm';
    case Gupshup = 'gupshup';

    public function id(): string
    {
        return $this->value;
    }

    public function label(): string
    {
        return match ($this) {
            self::GoogleRbm => 'Google RCS Business Messaging',
            self::Gupshup => 'Gupshup',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::GoogleRbm => 'Your launched agent\'s id and the JSON key of a service account with the RBM API enabled. The client token is the one you set on the agent\'s webhook; Google signs every callback with it.',
            self::Gupshup => 'The enterprise user id and password Gupshup issued with the RCS account, and the bot id. Templates are approved on Gupshup\'s dashboard; give each one its template code here. The webhook is verified by the shared secret below, on the end of the callback URL.',
        };
    }

    public function fields(): array
    {
        return match ($this) {
            self::GoogleRbm => ['rcs_rbm_agent_id', 'rcs_rbm_service_account', 'rcs_rbm_client_token'],
            self::Gupshup => ['rcs_gupshup_userid', 'rcs_gupshup_password', 'rcs_gupshup_bot_id', 'messaging_webhook_secret'],
        };
    }

    /** A service account signs its own JWT, which needs OpenSSL. */
    public function isAvailable(): bool
    {
        return $this !== self::GoogleRbm || function_exists('openssl_sign');
    }

    public function client(): ChannelProvider
    {
        return match ($this) {
            self::GoogleRbm => new GoogleRbm,
            self::Gupshup => new GupshupRcs,
        };
    }
}
