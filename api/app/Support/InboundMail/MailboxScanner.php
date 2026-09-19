<?php

namespace App\Support\InboundMail;

use Carbon\CarbonImmutable;

/**
 * Reading a whole mailbox's headers, folder by folder — the newsletter's
 * subscriber scan.
 *
 * A second, narrower contract beside `Mailbox` rather than an extension of
 * it: the ticket piper reads one folder's bodies and moves what it has
 * handled; the scan reads every folder's headers and changes nothing. The
 * same `ImapMailbox` implements both, and a test binds a fake in the
 * container for this one exactly as it does for the other.
 */
interface MailboxScanner
{
    /** The login this session authenticates as, so its own address is never harvested. */
    public function account(): string;

    /**
     * Every folder the server lists, flat, with the raw LIST flags — the
     * policy of what to read decides, not the adapter. `messages` is the
     * folder's message count from STATUS, or -1 when the server would not say.
     *
     * @return list<array{path: string, name: string, messages: int, no_select: bool, flags: list<string>}>
     *
     * @throws \RuntimeException with the server's own words
     */
    public function folders(): array;

    /**
     * Headers only, UID ascending, from UID > $afterUid, $chunk UIDs a fetch,
     * narrowed to the date range where one is given.
     *
     * `$each(HeaderRow $row): bool` — return false to stop early (a time
     * budget); the caller resumes from the last UID it was given.
     *
     * @throws \RuntimeException with the server's own words
     */
    public function scanHeaders(
        string $folderPath,
        int $afterUid,
        int $chunk,
        ?CarbonImmutable $since,
        ?CarbonImmutable $until,
        callable $each,
    ): void;
}
