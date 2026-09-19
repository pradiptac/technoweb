<?php

namespace App\Support\InboundMail;

/**
 * What must never become a ticket.
 *
 * Three families, in the order they are checked. Our own mail landing in
 * the box — the desk's "New ticket" notification when `support_email` is
 * the piped address, a copy, a bounce of our receipt: piped, it opens a
 * ticket about a ticket, once a minute, for ever. Mail a machine sent and
 * a machine should not answer — out-of-office replies, list traffic,
 * delivery reports: answering one with an acknowledgement is how two
 * auto-responders write to each other all weekend. And mail from a staff
 * member, who is forwarding a customer's complaint rather than making one,
 * and must not become a portal customer for it.
 *
 * Each rule is a data-provider row in InboundMailTest; the reason string is
 * what the ledger records after `skipped:`.
 */
final class MailFilter
{
    /**
     * Local parts that are never a person. Public because the newsletter's
     * mailbox scan classifies the same addresses (`AddressKinds`).
     *
     * @var list<string>
     */
    public const ROBOT_SENDERS = [
        'mailer-daemon', 'postmaster', 'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply',
        'bounce', 'bounces', 'notifications', 'notification',
    ];

    /**
     * @param  list<string>  $ownAddresses  lower-cased
     * @param  list<string>  $staffAddresses  lower-cased
     */
    public static function reason(IncomingMessage $m, array $ownAddresses, array $staffAddresses): ?string
    {
        $from = strtolower(trim($m->fromEmail));

        if ($from === '' || ! filter_var($from, FILTER_VALIDATE_EMAIL)) {
            return 'no_sender';
        }

        if (in_array($from, $ownAddresses, true)) {
            return 'own_address';
        }

        if (in_array($from, $staffAddresses, true)) {
            return 'staff_sender';
        }

        $auto = strtolower((string) $m->header('Auto-Submitted'));
        if ($auto !== '' && $auto !== 'no') {
            return 'auto_submitted';
        }

        if ($m->header('X-Auto-Response-Suppress') !== null) {
            return 'auto_response_suppress';
        }

        $precedence = strtolower((string) $m->header('Precedence'));
        if (in_array($precedence, ['bulk', 'junk', 'list', 'auto_reply', 'auto-reply'], true)) {
            return 'precedence';
        }

        if ($m->header('List-Id') !== null || $m->header('List-Unsubscribe') !== null) {
            return 'list';
        }

        foreach (['X-Autoreply', 'X-Autorespond', 'X-Auto-Reply', 'X-Autoresponder'] as $header) {
            if ($m->header($header) !== null) {
                return 'auto_reply_header';
            }
        }

        $returnPath = trim((string) $m->returnPath);
        if ($returnPath === '<>' || in_array($m->fromLocalPart(), self::ROBOT_SENDERS, true)
            || str_starts_with(strtolower((string) $m->contentType), 'multipart/report')) {
            return 'bounce';
        }

        return null;
    }
}
