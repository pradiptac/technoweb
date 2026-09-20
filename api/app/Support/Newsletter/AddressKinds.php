<?php

namespace App\Support\Newsletter;

use App\Support\InboundMail\MailFilter;

/**
 * What kind of address something is, for a mailbox scan's review screen.
 *
 * Every list here is a heuristic, and each one becomes a *row the reviewer
 * can see and override* rather than a silent drop: a role address is counted
 * and offered behind a checkbox; a machine or own domain is listed with its
 * count and unticked by default. The lists are deliberately short and
 * deliberately not clever — `info@`, `sales@` and `support@` are not here,
 * because on the list a hardware reseller keeps those *are* the customer.
 */
final class AddressKinds
{
    /**
     * Local parts that are never a person. `MailFilter::ROBOT_SENDERS` is the
     * ticket piper's list of the same thing; this adds the ones a mailbox's
     * To/Cc lines collect rather than its From lines.
     *
     * @var list<string>
     */
    public const ROLE_LOCAL_PARTS = [
        ...MailFilter::ROBOT_SENDERS,
        'abuse', 'alerts', 'alert', 'automated', 'autoreply', 'auto-reply', 'daemon', 'hostmaster',
        'mailer', 'robot', 'root', 'system', 'unsubscribe', 'calendar-notification', 'security',
    ];

    /**
     * Domain prefixes and suffixes that belong to sending infrastructure
     * rather than to a company anybody writes to.
     *
     * @var list<string>
     */
    public const MACHINE_DOMAIN_PREFIXES = [
        'bounce.', 'bounces.', 'em.', 'email.', 'mail.', 'mailer.', 'mailing.', 'news.', 'noreply.',
        'no-reply.', 'notifications.', 'notification.', 'reply.', 'mg.', 'e.', 'go.', 'info.',
    ];

    /** @var list<string> */
    public const MACHINE_DOMAIN_SUFFIXES = [
        'amazonses.com', 'sendgrid.net', 'mailgun.org', 'mailgun.net', 'mcsv.net', 'rsgsv.net',
        'mailchimpapp.net', 'sendpulse.com', 'calendar.google.com', 'docs.google.com', 'drive-shares.google.com',
        'linkedin.com', 'facebookmail.com', 'accounts.google.com', 'microsoftonline.com', 'sharepointonline.com',
        'zendesk.com', 'freshdesk.com', 'atlassian.net', 'github.com', 'slack.com',
    ];

    /**
     * Freemail providers. Excluded from *own-domain* detection only: the
     * account being scanned may well be a Gmail address, and reading
     * `gmail.com` as "our domain" would untick every Gmail contact.
     *
     * @var list<string>
     */
    public const FREEMAIL = [
        'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
        'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rediffmail.com', 'rediff.com',
        'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'zohomail.in',
    ];

    public static function isRole(string $email): bool
    {
        $local = strtolower((string) strstr($email, '@', true));

        return $local !== '' && in_array($local, self::ROLE_LOCAL_PARTS, true);
    }

    public static function domain(string $email): string
    {
        $at = strrpos($email, '@');

        return $at === false ? '' : strtolower(substr($email, $at + 1));
    }

    public static function isFreemail(string $domain): bool
    {
        return in_array(strtolower($domain), self::FREEMAIL, true);
    }

    /**
     * Why a domain is unticked by default on the review, or null when it is
     * an ordinary domain that is ticked.
     *
     * @param  list<string>  $ownDomains  lower-cased
     * @return 'own'|'machine'|null
     */
    public static function domainKind(string $domain, array $ownDomains): ?string
    {
        $domain = strtolower($domain);

        if ($domain === '') {
            return null;
        }

        foreach ($ownDomains as $own) {
            if ($domain === $own || str_ends_with($domain, '.'.$own)) {
                return 'own';
            }
        }

        foreach (self::MACHINE_DOMAIN_SUFFIXES as $suffix) {
            if ($domain === $suffix || str_ends_with($domain, '.'.$suffix)) {
                return 'machine';
            }
        }

        foreach (self::MACHINE_DOMAIN_PREFIXES as $prefix) {
            if (str_starts_with($domain, $prefix) && substr_count($domain, '.') >= 2) {
                return 'machine';
            }
        }

        return null;
    }

    /**
     * A display name into a first and a last name.
     *
     * `Priya Nair` → Priya / Nair; `Nair, Priya` (Outlook's "Last, First")
     * → Priya / Nair; quotes and the address itself come off; a name that is
     * just the address, or empty, is no name at all. The paste importer and
     * the mailbox scan share this so the two cannot split a name two ways.
     *
     * @return array{?string, ?string}
     */
    public static function nameSplit(?string $display, ?string $email = null): array
    {
        $name = trim((string) $display, " \t\r\n\"'");

        if ($name === '' || ($email !== null && strcasecmp($name, $email) === 0) || str_contains($name, '@')) {
            return [null, null];
        }

        if (str_contains($name, ',')) {
            [$last, $first] = array_map('trim', explode(',', $name, 2));

            if ($first !== '' && $last !== '') {
                return [$first, $last];
            }
        }

        $parts = preg_split('/\s+/', $name, 2) ?: [$name];

        return [$parts[0], $parts[1] ?? null];
    }
}
