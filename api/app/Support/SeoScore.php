<?php

namespace App\Support;

/**
 * A per-record SEO score, and the checks it is made of.
 *
 * The screen this feeds already reported *whether* a record had a problem. A
 * score answers the next question — which of two hundred records to open first
 * — and the list of failed checks answers the one after that, which is what to
 * do once it is open. A number on its own is not advice.
 *
 * Three rules the design turns on:
 *
 * **Score over what applies, never over everything.** An industry has no body
 * column, so it can never earn the content checks; scoring it out of the full
 * set would park every industry in the fifties with nothing an editor could do
 * about it, and a score you cannot move is one nobody looks at twice. Each
 * check declares whether it applies to the record in front of it, and the
 * divisor is the applicable weight.
 *
 * **Every check is measurable from what is stored.** Nothing here fetches the
 * rendered page. Crawling the front end from an admin request would put an
 * uncontrolled network call on that request — this project has already
 * measured what one of those costs, at 12.5s for a single unreachable host —
 * and it would report nothing at all for a draft that has never been
 * published. The trade is real and worth stating: this cannot see rendered
 * Core Web Vitals, a broken outbound link, or anything the frontend does with
 * the data after it arrives. It sees everything an editor can fix from the
 * CMS, which is who the screen is for.
 *
 * **Setting a focus keyword can lower the score, and that is correct.** Four
 * keyword checks apply only once one is set, so naming a keyword trades one
 * easy check for five harder ones. The alternative is a score that quietly
 * rewards leaving the field empty.
 */
final class SeoScore
{
    public const GROUPS = [
        'metadata' => 'Title & description',
        'content' => 'Content',
        'keyword' => 'Focus keyword',
        'technical' => 'Technical',
    ];

    /** Google truncates around here. Guidance, not validation. */
    public const TITLE_MIN = 30;

    public const TITLE_MAX = 60;

    public const DESCRIPTION_MIN = 70;

    public const DESCRIPTION_MAX = 160;

    /**
     * A failed check says the record could be better. An *issue* says
     * something is wrong with it, and the two are not the same list.
     *
     * Which is why each check carries the distinction rather than a constant
     * naming the keys that count. Scoring a title under 30 characters is
     * right — the space is free and unused — but calling it an issue took the
     * overview's headline from 23 records to 48 out of 54, and a figure that
     * flags nearly everything has stopped pointing anywhere. The score is the
     * new question; "with issues" is an old one and goes on meaning what it
     * meant, which is the five conditions this screen has always flagged.
     */
    private const ALWAYS_AN_ISSUE = ['title_present', 'description_present', 'description_length', 'indexable'];

    /** Short enough for a badge; the hint carries the explanation. */
    public const LABELS = [
        'title_present' => 'No title',
        'title_length' => 'Title length',
        'title_unique' => 'Duplicate title',
        'description_present' => 'No description',
        'description_length' => 'Description length',
        'description_unique' => 'Duplicate description',
        'content_depth' => 'Thin content',
        'headings' => 'No subheadings',
        'internal_links' => 'No internal links',
        'image_alt' => 'Image missing alt text',
        'keyword_set' => 'No focus keyword',
        'keyword_in_title' => 'Keyword not in title',
        'keyword_in_description' => 'Keyword not in description',
        'keyword_in_slug' => 'Keyword not in URL',
        'keyword_in_body' => 'Keyword not in body',
        'indexable' => 'Set to noindex',
        'in_sitemap' => 'Excluded from sitemap',
        'slug_clean' => 'Untidy URL slug',
        'share_image' => 'No share image',
    ];

    /**
     * @param  array  $input  resolved: the record's resolvedSeo() array
     *                        slug: its URL slug
     *                        body: its content as stored, HTML included; '' when it has none
     *                        has_body: whether the entity has a content field at all
     *                        depth_target: words a full entry of this kind is expected to run to
     *                        duplicate_title / duplicate_description: shared with another record
     */
    public static function for(array $input): array
    {
        $resolved = $input['resolved'];
        $title = trim((string) ($resolved['title'] ?? ''));
        $description = trim((string) ($resolved['description'] ?? ''));
        $slug = (string) ($input['slug'] ?? '');
        $body = (string) ($input['body'] ?? '');
        $hasBody = (bool) ($input['has_body'] ?? false);
        $target = (int) ($input['depth_target'] ?? 150);
        $keyword = trim((string) ($resolved['focus_keyword'] ?? ''));

        // toText, not strip_tags: the latter runs the end of one block into
        // the start of the next, which would both undercount words and make
        // "supportWhen" a word this has to pretend it understands.
        $text = HtmlSanitiser::toText($body);
        $words = $text === '' ? 0 : count(preg_split('/\s+/u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: []);
        $images = preg_match_all('/<img\b[^>]*>/i', $body, $found) ? $found[0] : [];

        $lowerKeyword = mb_strtolower($keyword);
        $hasKeyword = $keyword !== '';

        $checks = [
            // ---------------------------------------------------- metadata
            self::check('title_present', 'metadata', 15, true, $title !== '',
                'There is no title at all. A search engine will write one from the page, and it will not be the one you would have chosen.'),

            // Over the maximum is an issue; under the minimum is only ever a
            // missed opportunity, and the two do not belong in one count.
            self::check('title_length', 'metadata', 10, $title !== '',
                mb_strlen($title) >= self::TITLE_MIN && mb_strlen($title) <= self::TITLE_MAX,
                self::lengthHint('Title', mb_strlen($title), self::TITLE_MIN, self::TITLE_MAX),
                mb_strlen($title) > self::TITLE_MAX),

            self::check('title_unique', 'metadata', 8, $title !== '',
                ! ($input['duplicate_title'] ?? false),
                'Another record publishes this exact title. Two pages competing over one title is two pages ranking worse than either would alone.'),

            self::check('description_present', 'metadata', 12, true, $description !== '',
                'No description, so Google writes the snippet itself out of whatever text it happens to find first.'),

            self::check('description_length', 'metadata', 10, $description !== '',
                mb_strlen($description) >= self::DESCRIPTION_MIN && mb_strlen($description) <= self::DESCRIPTION_MAX,
                self::lengthHint('Description', mb_strlen($description), self::DESCRIPTION_MIN, self::DESCRIPTION_MAX)),

            self::check('description_unique', 'metadata', 8, $description !== '',
                ! ($input['duplicate_description'] ?? false),
                'Another record publishes this exact description. Duplicate snippets are the plainest signal that a site was filled in from a template.'),

            // ----------------------------------------------------- content
            self::check('content_depth', 'content', 10, $hasBody, $words >= $target,
                $words === 0
                    ? 'There is no body content — the page is a heading and its metadata.'
                    : "Around {$words} words against the {$target} a full entry of this kind wants. Thin pages rank thinly."),

            // Only once a page is long enough to need signposting. Demanding a
            // subheading on a short page is asking for one that says nothing.
            self::check('headings', 'content', 5, $hasBody && $words >= $target,
                (bool) preg_match('/<h[23]\b/i', $body),
                'No subheadings. Past a few hundred words they are how a reader and a crawler both find the shape of the page.'),

            self::check('internal_links', 'content', 4, $hasBody && $words > 0,
                (bool) preg_match('#<a\b[^>]*href=["\']/(?!/)#i', $body),
                'Nothing here links to another page on the site. Internal links are how ranking moves around a site, and a page with none is where it stops.'),

            self::check('image_alt', 'content', 4, $images !== [],
                ! self::anyImageMissingAlt($images),
                'An image in the body has no alt text: unreadable to a screen reader, and invisible to image search.'),

            // ----------------------------------------------------- keyword
            self::check('keyword_set', 'keyword', 4, true, $hasKeyword,
                'No focus keyword, so nothing below can be checked against the phrase you actually want this page to win.'),

            self::check('keyword_in_title', 'keyword', 6, $hasKeyword,
                $hasKeyword && str_contains(mb_strtolower($title), $lowerKeyword),
                "The title does not contain \"{$keyword}\". Of everywhere the phrase could appear, this is the one that counts most."),

            self::check('keyword_in_description', 'keyword', 4, $hasKeyword,
                $hasKeyword && str_contains(mb_strtolower($description), $lowerKeyword),
                "The description does not contain \"{$keyword}\". Google bolds the match in the snippet, which earns the click more than the ranking."),

            self::check('keyword_in_slug', 'keyword', 3, $hasKeyword,
                $hasKeyword && str_contains($slug, str_replace(' ', '-', $lowerKeyword)),
                "The URL does not contain \"{$keyword}\". Worth fixing on a new record; on an established one, weigh it against the redirect it costs."),

            self::check('keyword_in_body', 'keyword', 3, $hasKeyword && $hasBody && $words > 0,
                $hasKeyword && str_contains(mb_strtolower($text), $lowerKeyword),
                'The phrase never appears in the body. A page that does not say what it is about is being sold entirely by its title.'),

            // --------------------------------------------------- technical
            self::check('indexable', 'technical', 10, true,
                ! str_contains((string) ($resolved['robots'] ?? ''), 'noindex'),
                'Set to noindex, which makes the rest of this moot — the page is asking not to be listed.'),

            self::check('in_sitemap', 'technical', 5, true,
                (bool) ($resolved['sitemap_include'] ?? true),
                'Excluded from sitemap.xml. Deliberate on some pages; on most it only makes the page slower to be found.'),

            self::check('slug_clean', 'technical', 4, $slug !== '',
                (bool) preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug) && mb_strlen($slug) <= 75,
                'The slug carries capitals, underscores or runs past 75 characters. Changing it writes a redirect, so this is cheap to fix early and expensive to fix late.'),

            self::check('share_image', 'technical', 6, true,
                filled($resolved['og_image'] ?? null),
                'No share image of its own, so a link to this page falls back to the site-wide card. It will look shared rather than broken, but it will not look like this page.'),
        ];

        return self::tally($checks);
    }

    public static function band(int $value): string
    {
        return match (true) {
            $value >= 80 => 'good',
            $value >= 50 => 'fair',
            default => 'poor',
        };
    }

    /** @param  array<int, string>  $images */
    private static function anyImageMissingAlt(array $images): bool
    {
        foreach ($images as $tag) {
            if (! preg_match('/\balt=["\']([^"\']*)["\']/i', $tag, $m) || trim($m[1]) === '') {
                return true;
            }
        }

        return false;
    }

    private static function lengthHint(string $what, int $length, int $min, int $max): string
    {
        return $length < $min
            ? "{$what} is {$length} characters, under {$min}. There is room to say more and the space is free."
            : "{$what} is {$length} characters, over {$max}. Google will cut it off, and it chooses where.";
    }

    private static function check(
        string $key, string $group, int $weight, bool $applicable, bool $passed, string $hint, ?bool $issue = null,
    ): array {
        $issue ??= in_array($key, self::ALWAYS_AN_ISSUE, true);

        return compact('key', 'group', 'weight', 'applicable', 'passed', 'hint', 'issue');
    }

    /**
     * Earned weight over applicable weight.
     *
     * A record with nothing applicable cannot arise — several checks always
     * apply — but the guard is here rather than a division by zero waiting for
     * the entity that manages it.
     */
    private static function tally(array $checks): array
    {
        $applicable = array_values(array_filter($checks, fn ($c) => $c['applicable']));
        $possible = array_sum(array_column($applicable, 'weight'));
        $earned = array_sum(array_map(fn ($c) => $c['passed'] ? $c['weight'] : 0, $applicable));

        $value = $possible > 0 ? (int) round(100 * $earned / $possible) : 100;
        $failed = array_values(array_filter($applicable, fn ($c) => ! $c['passed']));

        return [
            'value' => $value,
            'band' => self::band($value),
            'passed' => count($applicable) - count($failed),
            'checked' => count($applicable),
            'failed' => array_map(fn ($c) => [
                'key' => $c['key'],
                'group' => $c['group'],
                'label' => self::LABELS[$c['key']],
                'weight' => $c['weight'],
                'hint' => $c['hint'],
            ], $failed),
            'issues' => array_values(array_map(
                fn ($c) => self::LABELS[$c['key']],
                array_filter($failed, fn ($c) => $c['issue']),
            )),
        ];
    }
}
