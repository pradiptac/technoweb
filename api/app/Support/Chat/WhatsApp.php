<?php

namespace App\Support\Chat;

use App\Models\ChatConversation;

/**
 * Carrying a conversation on somewhere a person answers.
 *
 * One builder, because the link is offered from two places and they must not
 * drift: the panel's header, where it is a standing offer, and the reply to a
 * question the website could not answer, where it is the only way through.
 * Two copies of "compose a `wa.me` URL out of what intake collected" is the
 * duplication this codebase has been caught by from `admin_path` to the
 * newsletter's two definitions of "delivered".
 *
 * **The number is normalised to digits here rather than at either call site.**
 * A `wa.me` URL carrying a `+` or a space does not fail — it opens WhatsApp on
 * a search for a contact nobody has, which looks like the business having
 * published a wrong number. `ChatSettings::whatsappNumber()` does the
 * stripping and returns an empty string for anything too short to dial, so a
 * half-typed number produces no link at all rather than a dead one.
 *
 * **Nothing is invented to fill the message.** With intake switched off, or
 * every step declined, it is a plain opener — still better than an empty box,
 * and it never claims a name nobody gave.
 */
class WhatsApp
{
    /**
     * The hand-off, or null when no usable number is configured.
     *
     * @param  string|null  $question  What the assistant could not answer. Passed
     *                                 only from the unanswered path, where it is
     *                                 the whole point of the message — the person
     *                                 on the other end should open a chat that
     *                                 already says what was asked, rather than
     *                                 one that makes somebody type it a second
     *                                 time to a business that has just failed to
     *                                 answer it once.
     * @return array{url: string, label: string}|null
     */
    public static function link(ChatConversation $conversation, ?string $question = null): ?array
    {
        $number = ChatSettings::whatsappNumber();

        if ($number === '') {
            return null;
        }

        $contact = Intake::contact($conversation);

        $lines = ['Hello, I was on your website.'];

        if (filled($contact['name'] ?? null)) {
            $lines[] = 'My name is '.$contact['name'].'.';
        }

        if (filled($contact['company'] ?? null)) {
            $lines[] = 'I am with '.$contact['company'].'.';
        }

        /*
         * The question wins over the stored requirement when there is one.
         *
         * Both answer "what do they want", and sending both makes the opener
         * contradict itself — the requirement is what they said at intake and
         * the question is what they are asking *now*, which is the more recent
         * and the more specific of the two.
         */
        if (filled($question)) {
            $lines[] = 'I asked your website assistant: '.trim($question);
        } elseif (filled($contact['requirement'] ?? null)) {
            $lines[] = 'I am looking for: '.$contact['requirement'];
        }

        if (filled($conversation->source_path)) {
            $lines[] = '(from '.$conversation->source_path.')';
        }

        return [
            'url' => 'https://wa.me/'.$number.'?text='.rawurlencode(implode(' ', $lines)),
            'label' => 'Continue on WhatsApp',
        ];
    }
}
