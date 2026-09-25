<?php

namespace App\Enums;

use App\Support\Messaging\ProviderOption;
use App\Support\Messaging\Providers\ChannelProvider;
use App\Support\Messaging\Providers\Fcm;

/**
 * Who carries browser push. Firebase Cloud Messaging's HTTP v1 API is the
 * one case, on a service account through `GoogleServiceAccount`. The web
 * half of Firebase — the config the bell and the service worker need — is
 * the public `push` settings group, because a browser cannot subscribe
 * without it and none of it is a secret.
 */
enum PushProvider: string implements ProviderOption
{
    case Fcm = 'fcm';

    public function id(): string
    {
        return $this->value;
    }

    public function label(): string
    {
        return 'Firebase Cloud Messaging';
    }

    public function blurb(): string
    {
        return 'The JSON key of a service account in your Firebase project (Project settings → Service accounts → Generate new private key). The browser half — API key, project id, sender id, app id and the Web Push certificate key — goes in the Browser push tab.';
    }

    public function fields(): array
    {
        return ['push_fcm_service_account'];
    }

    public function isAvailable(): bool
    {
        return function_exists('openssl_sign');
    }

    public function client(): ChannelProvider
    {
        return new Fcm;
    }
}
