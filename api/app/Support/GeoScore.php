<?php

namespace App\Support;

use App\Support\Seo\ScoresChecks;

/**
 * How well a record is *placed* — the generative-engine score.
 *
 * `AeoScore` asks whether a page can be quoted; this asks whether an engine
 * can tell what it is quoting: which company, which brand and category, what
 * it relates to, who wrote it, and whether the company behind it is one
 * entity or forty strings. The relationships were always in MySQL; what a
 * page had never done was state them, and the `entity` block
 * (`EntityLinks`) is what this reads.
 *
 * Half the checks are about the site rather than the record — the
 * organisation being complete, its name, address and phone agreeing
 * everywhere, certifications on file — and they are scored on every record
 * deliberately: a company that has not said where it is drags every page
 * down together, which is the honest picture and the one fix that moves
 * every row.
 *
 * The applicability rules live here, never in the caller: a brand link is
 * asked of a product and not of a page, an author of a post and not of a
 * category. Same arithmetic as `SeoScore` (`ScoresChecks`).
 */
final class GeoScore
{
    use ScoresChecks;

    public const GROUPS = [
        'entity' => 'Entity',
        'authority' => 'Authority',
        'content' => 'Content',
    ];

    /** Short enough for a badge; the hint carries the explanation. */
    public const LABELS = [
        'organization' => 'Organisation incomplete',
        'brand_link' => 'No brand',
        'category_link' => 'No category',
        'solutions_link' => 'No solutions linked',
        'services_link' => 'No services linked',
        'industries_link' => 'No industries linked',
        'articles_link' => 'No supporting article',
        'first_hand' => 'No first-hand content',
        'author' => 'No author',
        'certifications' => 'No certifications',
        'definition' => 'No definition',
        'nap_consistent' => 'Contact details differ',
    ];

    /** Which kinds of record carry a brand. */
    private const BRANDED = ['product', 'store_product'];

    /** Which kinds of record sit in a category. */
    private const CATEGORISED = ['product', 'store_product', 'blog_post', 'knowledge_article'];

    /** Which kinds of record can be tied to solutions. */
    private const SOLVED = ['product', 'product_category', 'industry'];

    /** Which kinds of record can be tied to services. */
    private const SERVICED = ['store_product'];

    /** Which kinds of record can be tied to industries. */
    private const SECTORED = ['solution', 'case_study'];

    /** Which kinds of record have an author. */
    private const AUTHORED = ['blog_post'];

    /**
     * @param  array  $input  type: the SEO overview's record type key
     *                        entity: the `EntityLinks::for()` block
     *                        answer_blocks: the kinds present, as a list
     *                        author: whether the record names a person as its author
     *                        certifications: whether the company has a live, published certification (site-wide)
     *                        organization_complete: name, address, phone, email and logo all set (site-wide)
     *                        nap_consistent: the name, address and phone agree wherever they are stored (site-wide)
     */
    public static function for(array $input): array
    {
        $type = (string) ($input['type'] ?? '');
        $entity = (array) ($input['entity'] ?? []);
        $kinds = array_values(array_map('strval', (array) ($input['answer_blocks'] ?? [])));
        $has = fn (string $kind) => in_array($kind, $kinds, true);
        $linked = fn (string $key) => ($entity[$key] ?? []) !== [];

        $checks = [
            // ------------------------------------------------------- entity
            self::check('organization', 'entity', 12, true, (bool) ($input['organization_complete'] ?? false),
                'The organisation is incomplete: name, address, phone, email and logo all have to be set (Settings → General and Contact) before an engine can resolve this site to one company.'),

            self::check('nap_consistent', 'entity', 8, true, (bool) ($input['nap_consistent'] ?? false),
                'The company name, address or phone is missing, or the newsletter\'s postal address differs from the site\'s. Every mention has to agree, or an engine sees two businesses.'),

            self::check('brand_link', 'entity', 8, in_array($type, self::BRANDED, true), isset($entity['brand']),
                'No brand set. The manufacturer is the entity a product is most often asked about, and a product without one cannot be tied to it.'),

            self::check('category_link', 'entity', 8, in_array($type, self::CATEGORISED, true), isset($entity['category']),
                'No category. A record outside its taxonomy is one an engine cannot place among its neighbours.'),

            self::check('solutions_link', 'entity', 8, in_array($type, self::SOLVED, true), $linked('solutions'),
                'Not tied to any solution. The solutions are what this business is known for; a record that names none floats free of them.'),

            self::check('services_link', 'entity', 8, in_array($type, self::SERVICED, true), $linked('services'),
                'No services linked. "Do they install this?" is answered from the service pivot, and it is empty.'),

            self::check('industries_link', 'entity', 6, in_array($type, self::SECTORED, true), $linked('industries'),
                'No industry linked. "Do they work with X?" is answered from this, and it is empty.'),

            // ---------------------------------------------------- authority
            self::check('articles_link', 'authority', 8, true, $linked('articles'),
                'No published post or knowledge article links to this page. A page nothing on the site refers to is one an engine has no second source for.'),

            self::check('author', 'authority', 8, in_array($type, self::AUTHORED, true), (bool) ($input['author'] ?? false),
                'No named author. A person behind an article is the first thing an engine weighs when deciding whether to trust it.'),

            self::check('certifications', 'authority', 6, true, (bool) ($input['certifications'] ?? false),
                'No live certification on file (Company → Certifications). Credentials are how a claim of expertise is checked.'),

            // ------------------------------------------------------ content
            self::check('first_hand', 'content', 10, true, $has('why') || $has('who_for'),
                'No "Why is it needed?" or "Who is it for?" block. First-hand judgement — who this suits and why — is what separates a page written from experience from one assembled from a spec sheet.'),

            self::check('definition', 'content', 8, true, $has('definition'),
                'No "What is it?" block, so the entity this page is about is never stated in one sentence.'),
        ];

        return self::tally($checks);
    }

    /**
     * The published shape: without `issues`, which is a question only
     * `SeoScore` answers.
     *
     * @return array{value: int, band: string, passed: int, checked: int, failed: array<int, array{key: string, group: string, label: string, weight: int, hint: string}>}
     */
    public static function publish(array $score): array
    {
        unset($score['issues']);

        return $score;
    }
}
