<?php

namespace App\Support\Newsletter;

/**
 * Which folders a subscriber scan reads, and which it leaves alone.
 *
 * Read by **flag first, name second**. SPECIAL-USE flags (RFC 6154) are how
 * Gmail and Microsoft 365 say what a folder *is* whatever it is called —
 * Outlook localises "Sent Items" and "Deleted Items" into whatever language
 * the mailbox runs in. The name lists are for servers that set no flags.
 *
 * What is left out by default, and why:
 * - **virtual** folders — Gmail's `[Gmail]/All Mail`, Important, Starred —
 *   are every message again under another label; reading them doubles
 *   every count for nothing.
 * - **junk**: the recipients of spam are harvested or forged.
 * - **trash**: deleted on purpose.
 * - **drafts**: recipients nobody has actually written to, typos included.
 * - **system** (Microsoft 365's Calendar, Contacts, Tasks, Notes, Journal,
 *   Sync Issues…) hold no mail and are never included.
 * The first three come back with `include_junk`; the last two never do.
 */
final class FolderPolicy
{
    public const SKIP_NOSELECT = 'noselect';

    public const SKIP_VIRTUAL = 'virtual';

    public const SKIP_JUNK = 'junk';

    public const SKIP_TRASH = 'trash';

    public const SKIP_DRAFTS = 'drafts';

    public const SKIP_SYSTEM = 'system';

    /** @var array<string, list<string>> lower-cased last segments, by reason */
    private const NAMES = [
        self::SKIP_VIRTUAL => ['all mail', 'important', 'starred', 'flagged'],
        self::SKIP_JUNK => ['junk', 'spam', 'junk e-mail', 'junk email', 'bulk mail', 'bulk'],
        self::SKIP_TRASH => ['trash', 'bin', 'deleted', 'deleted items', 'deleted messages'],
        self::SKIP_DRAFTS => ['drafts', 'draft'],
        self::SKIP_SYSTEM => [
            'outbox', 'notes', 'calendar', 'contacts', 'tasks', 'journal', 'conversation history',
            'rss feeds', 'rss subscriptions', 'quick step settings', 'suggested contacts', 'yammer root', 'files',
            'conversation action settings', 'externalcontacts', 'recipient cache', 'gal contacts',
        ],
    ];

    /** @var array<string, string> SPECIAL-USE flag (lower-cased) => reason */
    private const FLAGS = [
        '\all' => self::SKIP_VIRTUAL,
        '\important' => self::SKIP_VIRTUAL,
        '\flagged' => self::SKIP_VIRTUAL,
        '\junk' => self::SKIP_JUNK,
        '\trash' => self::SKIP_TRASH,
        '\drafts' => self::SKIP_DRAFTS,
    ];

    /**
     * Why a folder is skipped, or null when it is read.
     *
     * @param  array{path: string, name: string, no_select: bool, flags: list<string>}  $folder
     */
    public static function classify(array $folder, bool $includeJunk): ?string
    {
        if ($folder['no_select']) {
            return self::SKIP_NOSELECT;
        }

        $reason = null;

        foreach ($folder['flags'] as $flag) {
            $reason = self::FLAGS[strtolower($flag)] ?? null;
            if ($reason !== null) {
                break;
            }
        }

        $reason ??= self::byName($folder);

        if ($reason === null) {
            return null;
        }

        if ($includeJunk && in_array($reason, [self::SKIP_JUNK, self::SKIP_TRASH, self::SKIP_DRAFTS], true)) {
            return null;
        }

        return $reason;
    }

    /**
     * The Sent folder, by flag or by name — only to count how often an
     * address was *written to* rather than merely copied on something.
     *
     * @param  array{path: string, name: string, flags: list<string>}  $folder
     */
    public static function isSent(array $folder): bool
    {
        foreach ($folder['flags'] as $flag) {
            if (strcasecmp($flag, '\Sent') === 0) {
                return true;
            }
        }

        $name = strtolower($folder['name']);
        $path = strtolower($folder['path']);

        return in_array($name, ['sent', 'sent items', 'sent messages', 'sent mail'], true)
            || str_ends_with($path, '/sent mail');
    }

    /** @param  array{path: string, name: string}  $folder */
    private static function byName(array $folder): ?string
    {
        $name = strtolower(trim($folder['name']));
        $path = strtolower(trim($folder['path']));

        foreach (self::NAMES as $reason => $names) {
            if (in_array($name, $names, true)) {
                return $reason;
            }
        }

        if (str_starts_with($name, 'sync issues')) {
            return self::SKIP_SYSTEM;
        }

        foreach (['[gmail]/all mail', '[google mail]/all mail', '[gmail]/important', '[gmail]/starred'] as $virtual) {
            if ($path === $virtual) {
                return self::SKIP_VIRTUAL;
            }
        }

        return null;
    }
}
