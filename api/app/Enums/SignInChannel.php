<?php

namespace App\Enums;

use App\Support\SignInChannels\EmailSignInChannel;
use App\Support\SignInChannels\SignInCodeChannel;
use App\Support\SignInChannels\SmsSignInChannel;

/**
 * How a sign-in code is delivered.
 *
 * Shaped after `MailTransport` on purpose, and for the same reason: the enum
 * is the only list. It owns each channel's label, whether this server can
 * actually use it, and which class does the work — so adding one is a case
 * here rather than a change in four files that then have to agree with each
 * other.
 *
 * SMS is offered and unavailable, exactly as Amazon SES is on the mail screen.
 * What it needs is a gateway, a DLT-registered template and somewhere to keep
 * a phone number, none of which is code. Saying so before anything is pressed
 * beats a class-not-found the next time somebody tries to sign in.
 */
enum SignInChannel: string
{
    case Email = 'email';
    case Sms = 'sms';

    public function label(): string
    {
        return match ($this) {
            self::Email => 'Email',
            self::Sms => 'SMS',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Email => 'Sent through whichever transport is configured under Outgoing mail. The address is already proven — a customer confirms it before the account is approved.',
            self::Sms => 'Needs an SMS gateway and, in India, a DLT-registered sender and template. Staff accounts have no phone number recorded, so this cannot be the default for the console.',
        };
    }

    /**
     * Whether this server can actually deliver on this channel.
     *
     * A live check rather than a constant, the same way `MailTransport` asks
     * whether a composer package is present: what is true of this deployment
     * is not a property of this file.
     */
    public function isAvailable(): bool
    {
        return match ($this) {
            self::Email => true,
            self::Sms => false,
        };
    }

    /** What it would take to turn this on, for the screen that offers it. */
    public function requires(): ?string
    {
        return match ($this) {
            self::Email => null,
            self::Sms => 'An SMS gateway, a DLT-registered template, and a phone number on every account.',
        };
    }

    public function deliverer(): SignInCodeChannel
    {
        return match ($this) {
            self::Email => new EmailSignInChannel,
            self::Sms => new SmsSignInChannel,
        };
    }

    /** The channel in use, falling back rather than failing on a bad value. */
    public static function active(): self
    {
        return self::Email;
    }
}
