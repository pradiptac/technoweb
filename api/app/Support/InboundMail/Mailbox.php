<?php

namespace App\Support\InboundMail;

/**
 * What the piper needs from a mailbox, and nothing else.
 *
 * One real implementation (`ImapMailbox`) and one fake for the tests. The
 * IMAP session itself cannot be exercised in a test — the same standing the
 * Google consent handshake has — so everything that *can* be tested sits on
 * the other side of this line, in `TicketPiper`, and is driven by messages
 * built by hand.
 *
 * Bound in the container by `AppServiceProvider` to whatever the settings
 * describe; a test binds `FakeMailbox` in its place.
 */
interface Mailbox
{
    /**
     * Messages waiting to be piped, oldest first, at most $limit.
     *
     * "Waiting" depends on the after-processing mode: unread ones in `seen`
     * mode, everything in the folder in `move` mode (the ledger dedupes).
     *
     * @return iterable<IncomingMessage>
     *
     * @throws \RuntimeException with the server's own words when it refuses us
     */
    public function unseen(int $limit): iterable;

    /** Flag or move the message so the next run does not offer it again. */
    public function markProcessed(IncomingMessage $message): void;

    /**
     * Connect, select the folder, count — the Check connection button.
     *
     * @return array{account: string, folder: string, unseen: int}
     *
     * @throws \RuntimeException with the server's own words when it refuses us
     */
    public function probe(): array;
}
