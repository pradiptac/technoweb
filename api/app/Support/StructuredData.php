<?php

namespace App\Support;

use App\Models\BlogComment;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Faq;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Location;
use App\Models\Product;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;

/**
 * Every JSON-LD block this site emits, built where the data is.
 *
 * It used to be built where the data was *rendered*: six helpers in
 * `lib/seo.tsx` and five hand-rolled blocks inline in page components, which is
 * eleven files that all had to agree about what an Article is. They did not.
 * The blog and the case study each declared `dateModified: published_at`, so an
 * article edited two years after publication still told Google it had never
 * changed — and both named the Organization as `author` while the record has
 * had an `author_id` the whole time.
 *
 * That is the argument for moving it here rather than tidying it there. A
 * `sku` is on the product row, `dateModified` is `updated_at`, and which places
 * a service is offered in is a pivot table — the frontend was reconstructing
 * from what a resource happened to expose, and could only emit what somebody
 * had remembered to send.
 *
 * **The escaping stays at the sink.** This returns arrays; `JsonLd` in the
 * frontend serialises them and escapes `<` to `<`. That boundary is not
 * moving: `JSON.stringify` does not escape `<`, so a CMS field containing
 * `</script>` closes the block and everything after it becomes live markup.
 * Escaping here as well would double-encode, and escaping *only* here would put
 * the guarantee on the wrong side of the wire.
 *
 * **Nothing is invented.** A field that would have to be guessed at is omitted
 * — `availability` when the editor has not said, `price` at all, because the
 * brief rules out anything transactional and a made-up price is worse than no
 * offer. Structured data is a set of claims a search engine acts on; a
 * plausible guess in one is a lie with a schema attached.
 */
class StructuredData
{
    /** Absolute, and from the production domain — canonicals must not be relative. */
    private static function url(string $path = ''): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$path;
    }

    private static function company(): string
    {
        return (string) (Setting::get('company_name') ?: 'Technoware');
    }

    /** The publisher node, reused by everything that has one. */
    private static function publisher(): array
    {
        return ['@type' => 'Organization', 'name' => self::company(), 'url' => self::url()];
    }

    /**
     * Drops nulls and empty values at every depth, so an absent fact is an
     * absent key.
     *
     * **Recursive, and it has to be.** A top-level filter leaves
     * `offers.availability: null` and `address.addressRegion: null` sitting in
     * the output, which is worse than it looks: a null in JSON-LD is not read
     * as "unknown", it is a malformed value for a field that was declared, and
     * Search Console reports it as an error on a page that simply had nothing
     * to say. `false` and `0` survive — they are answers.
     */
    private static function graph(array $node): array
    {
        return self::prune(['@context' => 'https://schema.org'] + $node);
    }

    private static function prune(array $node): array
    {
        $out = [];

        foreach ($node as $key => $value) {
            if (is_array($value)) {
                $value = self::prune($value);
            }

            if ($value === null || $value === [] || $value === '') {
                continue;
            }

            $out[$key] = $value;
        }

        return $out;
    }

    /* ------------------------------------------------------------- product */

    /**
     * A product, with the identifiers a search engine can actually match on.
     *
     * `sku` and `brand` are what let Google tie this page to the same part
     * listed elsewhere, and they were both sitting on the row unused — the
     * frontend helper took a name, a description, a slug and a brand name.
     *
     * **`offers` carries no price, deliberately.** The brief rules out carts,
     * quotations and pricing, so there is no price to state; an invented one is
     * the worst possible thing to put in structured data. What is left is
     * honest and still useful: a URL, a currency and — only when an editor has
     * said so — availability. Google will report a missing price for this
     * product type, and that is the correct outcome for a catalogue that does
     * not sell online.
     */
    public static function product(Product $product): array
    {
        $availability = $product->availability;

        return self::graph([
            // Resolved rather than literal for uniformity; `Product` has no
            // safe alternative, so this is always `Product` today.
            '@type' => SchemaTypes::resolve('Product', $product->seo?->schema_type),
            'name' => $product->name,
            'description' => $product->short_description ?: null,
            'url' => self::url('/products/'.$product->slug),
            'sku' => $product->sku ?: null,
            'image' => collect($product->images ?? [])
                ->map(fn ($p) => asset('storage/'.$p))->take(6)->values()->all(),
            'brand' => $product->brand
                ? ['@type' => 'Brand', 'name' => $product->brand->name]
                : null,
            'category' => $product->category?->name,
            'offers' => [
                '@type' => 'Offer',
                'url' => self::url('/products/'.$product->slug),
                'priceCurrency' => 'INR',
                // ->value, not the enum: string concatenation on a backed enum
                // is a fatal error, and the cast means this is an enum now.
                'availability' => $availability ? 'https://schema.org/'.$availability->value : null,
                'seller' => self::publisher(),
            ],
        ]);
    }

    /* ------------------------------------------------------------- service */

    /**
     * A service or a solution, and where it is actually offered.
     *
     * `areaServed` is the reason this is worth doing rather than something the
     * frontend could keep guessing at. It comes from `location_service` — the
     * places somebody ticked — so it is a list of real coverage rather than a
     * repetition of the company address. A service nobody has assigned a place
     * to simply omits the key, which is the honest answer and also the one that
     * keeps a national claim from appearing by accident.
     */
    public static function service(Service|Solution $record): array
    {
        $isSolution = $record instanceof Solution;
        $prefix = $isSolution ? '/solutions/' : '/services/';

        return self::graph([
            '@type' => SchemaTypes::resolve('Service', $record->seo?->schema_type),
            'name' => $record->title,
            'description' => $record->summary
                ? HtmlSanitiser::toText($record->summary)
                : null,
            'url' => self::url($prefix.$record->slug),
            'provider' => self::publisher(),
            'serviceType' => $record->title,
            'areaServed' => $record->relationLoaded('locations')
                ? $record->locations->map(fn (Location $l) => self::place($l))->values()->all()
                : null,
        ]);
    }

    /** A place, as `areaServed` or as an address. */
    private static function place(Location $location): array
    {
        return array_filter([
            '@type' => 'Place',
            'name' => $location->name,
            'address' => array_filter([
                '@type' => 'PostalAddress',
                'addressLocality' => $location->name,
                'addressRegion' => $location->stateAncestor()?->name,
                'addressCountry' => $location->country,
            ]),
        ]);
    }

    /* ------------------------------------------------------------ articles */

    /**
     * Anything that is written and dated.
     *
     * `dateModified` is `updated_at`, which is the fix this class exists for as
     * much as any: both article blocks used to send `published_at` for both
     * dates, so an article revised two years later still reported that it had
     * never changed. Freshness is one of the few things structured data
     * genuinely moves.
     *
     * The author is the real one where the record has one. Naming the
     * Organization was not wrong — a company can author an article — but a blog
     * post carries `author_id` and using it costs nothing.
     */
    public static function article(BlogPost|CaseStudy|KnowledgeArticle $record): array
    {
        [$type, $prefix] = match (true) {
            $record instanceof KnowledgeArticle => ['TechArticle', '/knowledge-base/'],
            $record instanceof CaseStudy => ['Article', '/case-studies/'],
            default => ['Article', '/blog/'],
        };

        $url = self::url($prefix.$record->slug);
        $published = $record->published_at ?? $record->created_at;

        $author = $record instanceof BlogPost && $record->relationLoaded('author') && $record->author
            ? ['@type' => 'Person', 'name' => $record->author->name]
            : self::publisher();

        return self::graph([
            // The editor's refinement when they picked one — `BlogPosting`
            // rather than `Article` — and the derived type otherwise.
            // `SchemaTypes` decides which swaps are safe.
            '@type' => SchemaTypes::resolve($type, $record->seo?->schema_type),
            'headline' => $record->title,
            'description' => $record->excerpt ? HtmlSanitiser::toText($record->excerpt) : null,
            'image' => $record->cover_image_path ? asset('storage/'.$record->cover_image_path) : null,
            'datePublished' => $published?->toIso8601String(),
            // The one that was wrong everywhere.
            'dateModified' => $record->updated_at?->toIso8601String(),
            'author' => $author,
            'publisher' => self::publisher(),
            'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $url],
            'url' => $url,
            /*
             * Approved comments only, and the count rather than the comments.
             *
             * `commentCount` is a fact a search engine reads as engagement.
             * Emitting the comments themselves would put every reader's words
             * and name into the markup of a page they did not write — and
             * `graph()` prunes nulls, so a post with none carries nothing at
             * all rather than a zero, which is the same call `availability`
             * makes: nothing here is guessed and nothing is claimed.
             */
            'commentCount' => $record instanceof BlogPost
                ? (BlogComment::approved()->where('blog_post_id', $record->id)->count() ?: null)
                : null,
        ]);
    }

    /* ---------------------------------------------------------------- FAQ */

    /**
     * @param  iterable<int, Faq>  $faqs
     */
    public static function faqPage(iterable $faqs): ?array
    {
        $entries = [];

        foreach ($faqs as $faq) {
            $entries[] = [
                '@type' => 'Question',
                'name' => $faq->question,
                'acceptedAnswer' => ['@type' => 'Answer', 'text' => HtmlSanitiser::toText($faq->answer)],
            ];
        }

        // An FAQPage with no questions is a claim with nothing behind it, and
        // Google treats an empty mainEntity as an error rather than as absence.
        return $entries === [] ? null : self::graph([
            '@type' => 'FAQPage',
            'mainEntity' => $entries,
        ]);
    }

    /* ------------------------------------------------------- the business */

    /**
     * `LocalBusiness` for a place, `Organization` for the company as a whole.
     *
     * The distinction matters and is the reason this takes an argument.
     * `LocalBusiness` asserts a physical presence somewhere, so it is emitted
     * only for a location page — and only for a location the company has said
     * something concrete about, which is the same bar `LandingPageQuality`
     * applies before such a page may exist at all. Putting `LocalBusiness` on
     * every page of a site with one office is a claim to serve everywhere from
     * nowhere.
     */
    public static function localBusiness(Location $location): array
    {
        $area = $location->selfAndDescendants()
            ->filter(fn (Location $l) => $l->is_active)
            ->map(fn (Location $l) => self::place($l))
            ->values()->all();

        return self::graph([
            '@type' => 'LocalBusiness',
            'name' => self::company().' — '.$location->name,
            'description' => $location->summary ?: null,
            'url' => self::url('/locations/'.$location->slug),
            'parentOrganization' => self::publisher(),
            'address' => array_filter([
                '@type' => 'PostalAddress',
                'streetAddress' => $location->office_address ?: null,
                'addressLocality' => $location->name,
                'addressRegion' => $location->stateAncestor()?->name,
                'addressCountry' => $location->country,
            ]),
            'areaServed' => $area,
            'telephone' => Setting::get('phone') ?: null,
            'email' => Setting::get('support_email') ?: null,
        ]);
    }

    /**
     * What a landing page is, which depends on what it is about.
     *
     * A catalogue page is a `CollectionPage` and not a `Product`, however
     * tempting: it lists hardware rather than being one item, and marking a
     * listing up as a single product is the structured-data equivalent of the
     * thin page this whole module exists to prevent — a claim about the page
     * that the page does not support.
     */
    public static function landingPage(LandingPage $page): ?array
    {
        $kind = $page->kind;

        if ($kind?->isLocal() && $page->location) {
            return self::localBusiness($page->location);
        }

        return self::graph([
            '@type' => 'CollectionPage',
            'name' => $page->title,
            'url' => self::url($page->path),
            'isPartOf' => ['@type' => 'WebSite', 'name' => self::company(), 'url' => self::url()],
            'about' => $page->brand
                ? ['@type' => 'Brand', 'name' => $page->brand->name]
                : null,
        ]);
    }
}
