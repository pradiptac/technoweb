<?php

namespace App\Support\InboundMail;

use Illuminate\Notifications\Messages\MailMessage;
use Symfony\Component\Mime\Email;

/**
 * The two things a ticket notification carries because a mailbox may be
 * reading the replies.
 *
 * `Auto-Submitted` (RFC 3834) tells every well-behaved auto-responder — an
 * out-of-office, a ticketing system on the other end, our own piper — that
 * this message was sent by a machine and must not be answered by one. It
 * goes on every ticket notification whether or not piping is on, because
 * it costs nothing and the alternative is two auto-responders writing to
 * each other all weekend. `X-Auto-Response-Suppress` is the same statement
 * in the dialect Exchange listens to.
 *
 * The Reply-To is set only while the mailbox is being read: pointing a
 * customer's reply at an address nothing reads is worse than leaving the
 * sender's address on it.
 *
 * Both survive `Templates::apply()`, which replaces only the subject and
 * the view.
 */
final class MailHeaders
{
    /** A receipt or a reply notification: an answer to something a person did. */
    public const REPLIED = 'auto-replied';

    /** A notification nobody wrote to us to get. */
    public const GENERATED = 'auto-generated';

    public static function machine(MailMessage $message, string $kind): MailMessage
    {
        return $message->withSymfonyMessage(function (Email $email) use ($kind) {
            $headers = $email->getHeaders();

            if (! $headers->has('Auto-Submitted')) {
                $headers->addTextHeader('Auto-Submitted', $kind);
            }

            if (! $headers->has('X-Auto-Response-Suppress')) {
                $headers->addTextHeader('X-Auto-Response-Suppress', 'All');
            }
        });
    }

    /** Point a customer's reply at the mailbox that will read it, when one will. */
    public static function replyToMailbox(MailMessage $message): MailMessage
    {
        $address = InboundMail::replyTo();

        return $address !== null ? $message->replyTo($address, 'Technoware Support') : $message;
    }

    /** The closing line of the acknowledgement, true in both modes. */
    public static function replyAdvice(string $reference): string
    {
        return InboundMail::enabled()
            ? "Reply to this email, or use the portal — either way it stays on ticket {$reference}."
            : 'Replying to this email will not reach us — use the portal so the conversation stays on the ticket.';
    }
}
