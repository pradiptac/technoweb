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

        /*
         * A sender the receiving mailbox has already caught lying.
         *
         * Everything below decides on the `From` header, and `From` is
         * whatever the sender typed: the security review of 2026-09-20
         * rated "reply to somebody else's ticket by forging their address"
         * the one real finding in the module. The mailbox provider has
         * usually done the work by the time we read the message — Gmail and
         * Microsoft 365 both stamp `Authentication-Results` with the SPF,
         * DKIM and DMARC verdicts — so this reads that verdict rather than
         * repeating it: a DMARC failure, Microsoft's composite failure, or an
         * SPF failure with no DKIM pass to redeem it, and the message is
         * skipped as `spoofed` for the ledger to show. A bare IMAP server
         * that stamps nothing is unchanged, which `docs/tickets.md` already
         * records as the remaining gap.
         */
        if (self::failsAuthentication((string) $m->header('Authentication-Results'))) {
            return 'spoofed';
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

    /** Whether the provider's own verdict says the sender is not who the `From` claims. */
    public static function failsAuthentication(string $results): bool
    {
        $r = strtolower($results);
        if ($r === '') {
            return false;
        }

        if (preg_match('/\b(dmarc|compauth)=fail\b/', $r) === 1) {
            return true;
        }

        return preg_match('/\bspf=fail\b/', $r) === 1 && preg_match('/\bdkim=pass\b/', $r) !== 1;
    }
}
