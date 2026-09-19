<?php

namespace App\Enums;

use App\Models\Setting;
use App\Support\OAuth\OAuthProvider;

/**
 * How the support mailbox is reached.
 *
 * The only list, the way `MailTransport` is for outgoing mail: the settings
 * panel builds its form from `fields()`, `InboundMail` builds the IMAP
 * connection from `imapHost()`, and the OAuth flow asks `oauthProvider()`.
 * Adding one is a case here rather than a change in four files that then have
 * to agree.
 *
 * All three end in IMAP. Google and Microsoft simply authenticate with an
 * OAuth access token instead of a password (XOAUTH2), which is the only way
 * either will let a third party read a mailbox any more.
 */
enum InboundMailProvider: string
{
    case Imap = 'imap';
    case Google = 'google';
    case Microsoft = 'microsoft';

    public function label(): string
    {
        return match ($this) {
            self::Imap => 'IMAP',
            self::Google => 'Gmail or Google Workspace',
            self::Microsoft => 'Microsoft 365 / Outlook',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Imap => 'Any mailbox with an IMAP server and a password — a hosting-provider mailbox, Zoho, Yahoo. Gmail and Microsoft 365 no longer accept a password over IMAP; use their own options.',
            self::Google => 'Connect a Google mailbox with its own consent screen. Needs an OAuth client in Google Cloud with this site\'s callback address registered; the same client as Outgoing mail will do if that address is added to it.',
            self::Microsoft => 'Connect a Microsoft 365 mailbox through an app registration in Entra ID with the IMAP.AccessAsUser.All, offline_access, openid and email delegated permissions, and IMAP switched on for the mailbox.',
        };
    }

    public function isOAuth(): bool
    {
        return $this !== self::Imap;
    }

    public function oauthProvider(): ?OAuthProvider
    {
        return match ($this) {
            self::Imap => null,
            self::Google => OAuthProvider::Google,
            self::Microsoft => OAuthProvider::Microsoft,
        };
    }

    /** The settings keys this provider reads, in the order the form shows them. */
    public function fields(): array
    {
        return match ($this) {
            self::Imap => ['inbound_imap_host', 'inbound_imap_port', 'inbound_imap_encryption', 'inbound_imap_username', 'inbound_imap_password'],
            self::Google => ['inbound_oauth_client_id', 'inbound_oauth_client_secret'],
            self::Microsoft => ['inbound_oauth_client_id', 'inbound_oauth_client_secret', 'inbound_oauth_tenant'],
        };
    }

    /** The IMAP host for the two fixed providers; null means "whatever was typed". */
    public function imapHost(): ?string
    {
        return match ($this) {
            self::Imap => null,
            self::Google => 'imap.gmail.com',
            self::Microsoft => 'outlook.office365.com',
        };
    }

    public function imapPort(): int
    {
        return 993;
    }

    /** Everything the settings panel needs to draw the option. */
    public function toOption(): array
    {
        return [
            'value' => $this->value,
            'label' => $this->label(),
            'blurb' => $this->blurb(),
            'fields' => $this->fields(),
            'is_oauth' => $this->isOAuth(),
            'imap_host' => $this->imapHost(),
        ];
    }

    /** What is stored, or null when nothing has been chosen. Unknown values read as nothing. */
    public static function current(): ?self
    {
        return self::tryFrom((string) Setting::get('inbound_mail_provider'));
    }
}
