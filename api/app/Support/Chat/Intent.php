<?php

namespace App\Support\Chat;

/**
 * What the visitor is trying to do.
 *
 * Rule-based and deliberately small. §9 of the specification lists ten intents
 * and says the visitor must never have to choose one; what it does not say —
 * and what matters here — is that an intent is only worth detecting if
 * something *changes* because of it. Three do: support puts the portal in front
 * of somebody, sales puts the contact form there, and everything else gets the
 * answer and its links. A classifier that produced ten labels and acted on
 * three would be eight labels of decoration.
 *
 * No model call. This runs before retrieval on every message, and paying a
 * provider to label a question before paying it to answer one is twice the
 * latency for a decision a word list makes correctly — "my firewall is not
 * working" is not a subtle sentence.
 */
class Intent
{
    public const SUPPORT = 'support';

    public const SALES = 'sales';

    public const GENERAL = 'general';

    /**
     * Something is broken, or somebody wants the people who fix things.
     *
     * Weighted towards catching it: offering the support portal to somebody
     * asking a product question is a wasted button, and missing it for
     * somebody whose network is down is the failure that matters.
     */
    private const SUPPORT_WORDS = [
        /*
         * **"support" on its own is not a support request.** "What brands do
         * you support?" and "do you support VLAN tagging?" are a catalogue
         * question and a specification question, and routing either to the
         * help desk puts the wrong screen in front of somebody who was
         * shopping. So the word only counts inside a phrase that means asking
         * for help — measured: the bare word sent "what brands do you support"
         * to the support desk.
         */
        'need support', 'technical support', 'contact support', 'customer support',
        'support team', 'support desk', 'get support', 'want support', 'support request',
        'helpdesk', 'help desk', 'ticket', 'complaint', 'engineer',
        'not working', 'stopped working', 'no longer works', 'does not work', "doesn't work",
        'problem', 'issue', 'fault', 'faulty', 'broken', 'down', 'outage', 'error',
        'troubleshoot', 'fix', 'repair', 'slow', 'crash', 'failed', 'failing',
        'cannot connect', "can't connect", 'unable to', 'reset my', 'my password',
    ];

    /** Somebody is buying, or wants to be telephoned about buying. */
    private const SALES_WORDS = [
        'quote', 'quotation', 'callback', 'call me', 'contact me', 'get in touch',
        'consultation', 'speak to', 'talk to someone', 'sales', 'proposal',
        'how much', 'pricing', 'cost of', 'budget', 'discount', 'offer for',
        'i want to buy', 'i need to buy', 'purchase', 'order for',
    ];

    public static function detect(string $question): string
    {
        $text = mb_strtolower(' '.trim($question).' ');

        /*
         * Support wins a tie, and the tie is real: "my firewall is broken, how
         * much is a new one" is both. Somebody whose kit has stopped working
         * wants the desk before they want a price, and the sales route is
         * still one message away.
         */
        if (self::mentions($text, self::SUPPORT_WORDS)) {
            return self::SUPPORT;
        }

        if (self::mentions($text, self::SALES_WORDS)) {
            return self::SALES;
        }

        return self::GENERAL;
    }

    /**
     * @param  array<int, string>  $words
     */
    private static function mentions(string $text, array $words): bool
    {
        foreach ($words as $word) {
            /*
             * Bounded on both sides, because a substring match here is how
             * "support" finds "supported" — fine — and how "down" finds
             * "download", which is not: half this catalogue's knowledge base is
             * about downloading firmware, and every one of those questions
             * would have been routed to the support desk.
             */
            if (str_contains($text, ' '.$word.' ')
                || preg_match('/\b'.preg_quote($word, '/').'\b/u', $text) === 1
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * What to put in front of somebody, given what they are trying to do.
     *
     * §14 and §41: the assistant does not diagnose and does not touch a ticket.
     * It gets the right screen in front of the right person — and which screen
     * depends on whether they have an account, because sending a signed-in
     * customer to a login page is the small rudeness that makes a thing feel
     * automated.
     *
     * @return array<int, array{label: string, url: string, primary?: bool}>
     */
    public static function actions(string $intent, bool $signedIn): array
    {
        return match ($intent) {
            self::SUPPORT => $signedIn
                ? [
                    ['label' => 'Raise a support ticket', 'url' => '/portal/tickets/new', 'primary' => true],
                    ['label' => 'Your tickets', 'url' => '/portal/tickets'],
                ]
                : [
                    // Sign-in first for an existing customer, and a way through
                    // for somebody who is not one — an unanswerable choice
                    // between two doors is worse than one door and a hint.
                    ['label' => 'Sign in to support', 'url' => '/portal/login', 'primary' => true],
                    ['label' => 'Contact support', 'url' => '/support'],
                ],

            self::SALES => [
                ['label' => 'Ask us to call you', 'url' => '/contact', 'primary' => true],
            ],

            default => [],
        };
    }
}
