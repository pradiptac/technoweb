<?php

namespace App\Support;

/**
 * Which schema.org types a record may legitimately declare itself to be.
 *
 * **Why this is a short list and not schema.org's.** The `schema_type`
 * override existed for a long time as a free-text field that nothing read:
 * `StructuredData` decides `@type` from the model, so an editor could type
 * `Recipe` on a network switch and the markup would not change. Turning it
 * into a dropdown made that worse rather than better — a text box invites a
 * guess, but a dropdown of thirteen options is a promise that the thing you
 * pick will happen.
 *
 * So it happens now, and the price of that is that the options have to be
 * ones the graph can actually support. Every alternative below is a
 * **drop-in** for its base: same required properties, no new mandatory ones.
 * Swapping `Article` for `BlogPosting` is a refinement a search engine
 * understands. Swapping `Product` for `Recipe` produces a block that validates
 * as neither — a claim about the page that the page does not support, which is
 * the one thing this project's structured data has never done.
 *
 * A base with a single entry is not an oversight. There is no safe alternative
 * to `Product`, and offering `IndividualProduct` or a `LocalBusiness` subtype
 * would be inviting an editor to make a claim about stock or trade category
 * that nothing on the record backs up. The console renders those disabled with
 * the reason, the same way it disables SES with the command that installs it.
 */
class SchemaTypes
{
    /**
     * Base type => what it may be narrowed to, the base itself first.
     *
     * @var array<string, array<int, string>>
     */
    public const ALTERNATIVES = [
        // Article and its news/blog refinements. All three take `headline`,
        // `datePublished` and `author` and require nothing further.
        'Article' => ['Article', 'BlogPosting', 'NewsArticle'],

        // A knowledge-base entry is a TechArticle; plain Article is the
        // sensible fallback for one that is not really technical.
        'TechArticle' => ['TechArticle', 'Article'],

        // A CMS page is whatever it is about. These four are the WebPage
        // subtypes with no extra required properties — `FAQPage` is
        // deliberately absent, because it requires `mainEntity` and a page
        // that declares itself one without questions in it is marked up as
        // something it is not. FAQs already emit their own block when a record
        // actually has them.
        'WebPage' => ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'],

        // A listing. `ItemList` is absent for the same reason as `FAQPage`:
        // it requires `itemListElement`.
        'CollectionPage' => ['CollectionPage', 'WebPage'],

        'Service' => ['Service', 'ProfessionalService'],

        // No safe alternative — see the class docblock.
        'Product' => ['Product'],
        'LocalBusiness' => ['LocalBusiness'],
        'JobPosting' => ['JobPosting'],
    ];

    /**
     * The options a record with this derived type may choose between.
     *
     * An unknown base returns itself, so a model that grows a new derived type
     * degrades to "no alternatives" rather than to an empty dropdown.
     *
     * @return array<int, string>
     */
    public static function for(?string $base): array
    {
        if (! $base) {
            return [];
        }

        return self::ALTERNATIVES[$base] ?? [$base];
    }

    /**
     * Every type any record may declare, flattened.
     *
     * What validation checks, because `SeoRules::rules()` is static and has no
     * record to ask. That is not the hole it looks like: `resolve()` narrows
     * per record on the way *out*, so a `BlogPosting` stored against a product
     * is refused a place in the graph even though the rule let it into the
     * column. The rule's job is to keep `Recipe` out entirely.
     *
     * @return array<int, string>
     */
    public static function all(): array
    {
        return array_values(array_unique(array_merge(...array_values(self::ALTERNATIVES))));
    }

    /**
     * The type to emit: the override when it is one this record may be, and
     * the derived type otherwise.
     *
     * **Validated here as well as in the request**, and not because the
     * request is untrusted twice. A stored value outlives the rule that
     * accepted it: narrowing this list later would leave rows holding a type
     * no longer allowed, and the graph is the wrong place to discover that. It
     * falls back rather than throwing, because a page rendering with a
     * slightly less specific `@type` is a much better failure than a page that
     * does not render.
     */
    public static function resolve(?string $base, ?string $override): ?string
    {
        if (! $base) {
            return null;
        }

        return $override && in_array($override, self::for($base), true) ? $override : $base;
    }
}
