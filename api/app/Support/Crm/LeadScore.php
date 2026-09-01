<?php

namespace App\Support\Crm;

/**
 * How promising a lead looks, and — the part that matters — why.
 *
 * ### Scored out of what applies, never out of everything
 *
 * The shape `App\Support\SeoScore` already uses: each check declares whether it
 * *applies* before it declares whether it *passed*, and the total divides by the
 * applicable weight. A form that never asked for a message cannot earn the two
 * message checks, and scoring it against them would park every submission from
 * that form in the forties with nothing anybody could do — a score you cannot
 * move is one nobody looks at twice.
 *
 * ### Every rule is a sentence somebody can disagree with
 *
 * There is no model here and there should not be. These are seven observations
 * a salesperson makes in the first ten seconds of reading an enquiry, written
 * down so the list can be sorted by them. Each carries its own label and hint,
 * and the reasons are stored on the lead beside the number, so a figure never
 * appears without its working. A score that cannot be argued with is one that
 * gets ignored the first time it is wrong.
 *
 * ### What it deliberately does not do
 *
 * **Nothing here files anything as spam.** A junk-looking enquiry scores low and
 * stays in the queue. Auto-filing would eventually hide a real customer whose
 * message was three words, and nobody would ever know — the failure is silent
 * and permanent, which is the worst combination there is.
 *
 * **Nothing here makes a network call.** No email verification, no domain
 * lookup, no enrichment service. This runs on the request path of a public
 * form, and an uncontrolled network call there has already cost this project
 * 12.5 seconds once. It is also why `email:dns` is banned on these forms.
 */
class LeadScore
{
    /**
     * Mailbox providers anybody can sign up to in a minute.
     *
     * Not a judgement about the person — it is a signal about the *purchase*.
     * This business sells network hardware to organisations, and an enquiry
     * from a domain the company owns is a materially better prospect than one
     * from a free address. Consumer-facing businesses would want this rule
     * inverted or deleted, which is the argument for it being one named check
     * rather than arithmetic buried in a sum.
     */
    private const FREE_DOMAINS = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in',
        'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
        'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'gmx.com',
        'rediffmail.com', 'zoho.com', 'yandex.com', 'mail.com', 'ymail.com',
    ];

    /**
     * Words that mean somebody is buying rather than browsing.
     *
     * Crude, and crude is the point: a keyword list is inspectable and
     * correctable by whoever runs the desk, which no learned classifier on a
     * corpus of a few hundred enquiries would be. Indian procurement
     * vocabulary is in here deliberately — "tender", "PO", "AMC" and "quotation"
     * are what this market actually writes, and a list built from generic
     * English would miss the most commercial enquiries the site receives.
     */
    private const INTENT_WORDS = [
        'quote', 'quotation', 'quotes', 'price', 'pricing', 'cost', 'budget',
        'purchase', 'buy', 'order', 'tender', 'rfq', 'rfp', 'proposal',
        'amc', 'contract', 'renew', 'renewal', 'upgrade', 'migrate', 'migration',
        'install', 'installation', 'deploy', 'deployment', 'site visit', 'survey',
        'requirement', 'requirements', 'urgent', 'asap', 'immediately',
        'how much', 'lead time', 'delivery', 'stock', 'availability',
    ];

    /** A message shorter than this is a greeting, not a brief. */
    private const SUBSTANTIAL = 120;

    /**
     * Score a lead from the facts it arrived with.
     *
     * @param  array{email?:?string,phone?:?string,company?:?string,message?:?string,source_path?:?string,returning?:bool}  $lead
     * @return array{score:int,band:string,reasons:array<int,array<string,mixed>>}
     */
    public static function for(array $lead): array
    {
        $email = trim((string) ($lead['email'] ?? ''));
        $message = trim((string) ($lead['message'] ?? ''));
        $path = trim((string) ($lead['source_path'] ?? ''));

        $checks = [
            self::check(
                'business_email', 'Business email address', 20,
                applies: $email !== '',
                passed: $email !== '' && ! self::isFreeMailbox($email),
                hint: 'A free mailbox rather than a company domain.',
            ),
            self::check(
                'intent', 'Asks about buying', 20,
                applies: $message !== '',
                passed: $message !== '' && self::mentionsIntent($message),
                hint: 'Nothing in the message about price, timing or a requirement.',
            ),
            self::check(
                'phone', 'Phone number given', 15,
                applies: true,
                passed: trim((string) ($lead['phone'] ?? '')) !== '',
                hint: 'Email only, so the first reply cannot be a call.',
            ),
            self::check(
                'company', 'Company named', 15,
                applies: true,
                passed: trim((string) ($lead['company'] ?? '')) !== '',
                hint: 'No organisation given.',
            ),
            self::check(
                'substantial', 'Describes what they need', 15,
                applies: $message !== '',
                passed: mb_strlen($message) >= self::SUBSTANTIAL,
                hint: 'Under '.self::SUBSTANTIAL.' characters — too little to answer properly.',
            ),
            self::check(
                'specific_page', 'Came from a specific page', 10,
                applies: $path !== '',
                passed: $path !== '' && self::isSpecificPage($path),
                hint: 'Sent from a general page, so what they want has to be asked.',
            ),
            self::check(
                'clean_message', 'Message is not a link dump', 10,
                applies: $message !== '',
                passed: $message !== '' && ! self::isLinkDump($message),
                hint: 'Mostly links — usually an advertisement rather than an enquiry.',
            ),
            self::check(
                'returning', 'Has enquired before', 5,
                applies: true,
                passed: (bool) ($lead['returning'] ?? false),
                hint: 'First time this address has been in touch.',
            ),
        ];

        $applicable = array_sum(array_map(fn ($c) => $c['applies'] ? $c['weight'] : 0, $checks));
        $earned = array_sum(array_map(fn ($c) => $c['applies'] && $c['passed'] ? $c['weight'] : 0, $checks));

        // Nothing applied at all — a form asking for a name and nothing else.
        // Zero would read as "we looked and it is worthless"; the band says
        // "unscored" instead, and the console renders that as a dash.
        $score = $applicable > 0 ? (int) round($earned / $applicable * 100) : 0;

        return [
            'score' => $score,
            'band' => $applicable > 0 ? self::band($score) : 'unscored',
            'reasons' => $checks,
        ];
    }

    /** Hot / warm / cold, on the same shape `SeoScore` bands its number. */
    public static function band(int $score): string
    {
        return match (true) {
            $score >= 70 => 'hot',
            $score >= 40 => 'warm',
            default => 'cold',
        };
    }

    private static function check(string $key, string $label, int $weight, bool $applies, bool $passed, string $hint): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'weight' => $weight,
            'applies' => $applies,
            'passed' => $applies && $passed,
            // Only carried on a failure: a hint beside a passing check is noise
            // in a list somebody reads to find what to fix.
            'hint' => $applies && ! $passed ? $hint : null,
        ];
    }

    private static function isFreeMailbox(string $email): bool
    {
        $domain = mb_strtolower(trim(substr(strrchr($email, '@') ?: '', 1)));

        return $domain === '' || in_array($domain, self::FREE_DOMAINS, true);
    }

    private static function mentionsIntent(string $message): bool
    {
        $haystack = mb_strtolower($message);

        foreach (self::INTENT_WORDS as $word) {
            /*
             * Word boundaries, not `str_contains`, and inflections on stems
             * long enough to have them.
             *
             * The two failure directions pull against each other. "PO" inside
             * "port" is a false positive on the most common noun in this
             * catalogue; "buy" inside "buying" is a false negative on the most
             * obvious signal there is. `\b` alone fixes the first and leaves the
             * second — which is what shipped, and what the boundary test caught:
             * a trailing `s?` covers a plural and does nothing for "-ing".
             *
             * So the suffix set is explicit, and it applies only from three
             * characters. An abbreviation has no inflections, and appending one
             * to a two-letter stem does not produce a form of the same word — it
             * produces a different word, which is exactly how "po" would start
             * matching "pod".
             */
            $suffix = mb_strlen($word) >= 3 ? '(?:s|es|ing|ed|d)?' : '';

            // A multi-word phrase still works: the boundaries sit at each end
            // of the phrase, and the suffix lands on its last word.
            if (preg_match('/\b'.preg_quote($word, '/').$suffix.'\b/u', $haystack) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * A page about one thing, rather than the front door.
     *
     * Somebody who pressed Enquire on the Cisco switch page has already said
     * what they want; somebody who used the contact page has not. That is worth
     * points, and it is the whole reason the source page is captured.
     */
    private static function isSpecificPage(string $path): bool
    {
        foreach (['/products/', '/solutions/', '/services/', '/industries/', '/brands/', '/locations/', '/case-studies/'] as $prefix) {
            // A prefix match alone is true for the index page as well, and an
            // index is exactly as general as /contact. The trailing segment is
            // what makes it about one thing.
            if (str_starts_with($path, $prefix) && mb_strlen($path) > mb_strlen($prefix)) {
                return true;
            }
        }

        return false;
    }

    private static function isLinkDump(string $message): bool
    {
        preg_match_all('~https?://~i', $message, $matches);
        $links = count($matches[0]);

        // Two thresholds, because either alone is wrong. A long, genuine
        // message may reasonably cite three pages; a two-line message that is
        // nothing but one URL is an advertisement. So: several links, or links
        // with almost no words around them.
        return $links >= 3 || ($links >= 1 && str_word_count($message) < 25);
    }
}
