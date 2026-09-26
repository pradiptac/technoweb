<?php

namespace App\Support;

use App\Enums\AnswerBlockKind;
use App\Enums\ProductCondition;
use App\Models\AnswerBlock;
use App\Models\BlogComment;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Faq;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Location;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Support\Store\Fulfilment;

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

    /**
     * The publisher node, reused by everything that has one.
     *
     * `@id` is the marketing layout's `Organization` node
     * (`lib/seo.tsx`, `{site}/#organization`), so every `publisher`,
     * `provider` and `parentOrganization` on a record's graph points at the
     * one entity the page already declares rather than restating it — one
     * thing named once, which is what lets a search engine or an assistant
     * resolve the company to an entity. The name and URL stay beside it for
     * a validator that reads the node alone.
     */
    private static function publisher(): array
    {
        return ['@type' => 'Organization', '@id' => self::url().'/#organization', 'name' => self::company(), 'url' => self::url()];
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
     * **There is no `offers` node at all, and that reverses an earlier call.**
     * The brief rules out carts, quotations and pricing, so there is no price
     * to state and an invented one would be the worst thing in the file. This
     * used to emit an `Offer` carrying a URL, a currency and sometimes an
     * availability — honest, and invalid: an `Offer` without a `price` is a
     * declared field with a missing required value, which Google reports as an
     * **error**. No offer at all is merely incomplete, which is a **warning**,
     * and is also the truthful description of a catalogue that does not sell.
     * The store's own products are the ones that carry a price; see
     * `storeProduct()` below.
     *
     * The cost is that `products.availability` no longer reaches the markup,
     * because schema.org has nowhere but an Offer to put it. It still reaches
     * the page, which is where a reader is.
     */
    public static function product(Product $product): array
    {
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
        ] + self::relationships(EntityLinks::for($product)));
    }

    /* ------------------------------------------------- store product */

    /**
     * A thing the shop actually sells, with the price it sells for.
     *
     * **Deliberately not folded into `product()` above.** That one is price-free
     * by design and its docblock is an argument for keeping it that way; merging
     * the two would put a `price` key behind a condition in the one method that
     * must never invent a number. They describe two different catalogues with
     * two different lifecycles, which is the whole shape of the store module.
     *
     * This is also the block Google Merchant Center reads to keep a listing's
     * price and availability current between feed fetches, so every claim in it
     * has to match what the page says and what the feed declares. Three places,
     * one set of facts: `Money::toRupeeString`, `availability()` and
     * `App\Support\Store\Fulfilment` are each read by all three.
     *
     * **`AggregateOffer` when there are variations.** A product with a 24-port
     * and a 48-port is not one offer, and picking either price would be wrong on
     * the page it is rendered on. The per-variation detail travels in the feed,
     * where each variant is its own item.
     */
    public static function storeProduct(StoreProduct $product): array
    {
        $url = self::url('/store/products/'.$product->slug);
        $identifiers = $product->identifiers();

        $variations = $product->relationLoaded('variations')
            ? $product->variations->where('is_active', true)
            : collect();

        $prices = $variations
            ->map(fn (StoreProductVariation $v) => $v->pricePaise())
            ->filter()
            ->values();

        $offer = $prices->count() > 1
            ? [
                '@type' => 'AggregateOffer',
                'lowPrice' => Money::toRupeeString((int) $prices->min()),
                'highPrice' => Money::toRupeeString((int) $prices->max()),
                'offerCount' => $prices->count(),
            ]
            : ['@type' => 'Offer', 'price' => Money::toRupeeString($product->price_paise)];

        return self::graph([
            '@type' => SchemaTypes::resolve('Product', $product->seo?->schema_type),
            'name' => $product->name,
            'description' => $product->short_description
                ?: (HtmlSanitiser::toText($product->description ?? '') ?: null),
            'url' => $url,
            'sku' => $product->sku ?: null,
            'gtin' => $identifiers['gtin'],
            'mpn' => $identifiers['mpn'],
            'image' => collect($product->images ?? [])
                ->map(fn ($p) => asset('storage/'.$p))->take(6)->values()->all(),
            'brand' => $product->brand
                ? ['@type' => 'Brand', 'name' => $product->brand->name]
                : null,
            /*
             * `Thing` rather than a bare string since 2026-09-21: a name alone
             * is a label, a `Thing` with a URL is an entity the page belongs
             * to. `additionalProperty` is the spec sheet, which is on the page
             * and so may be claimed; `isRelatedTo` the products the page lists
             * beside it. The warranty is a `WarrantyPromise` only when somebody
             * wrote one. Nothing here is invented.
             */
            'category' => $product->category
                ? ['@type' => 'Thing', 'name' => $product->category->name, 'url' => self::url($product->category->publicPath())]
                : null,
            'additionalProperty' => collect($product->specifications ?? [])
                ->filter(fn ($value, $name) => filled($value) && $name !== '')
                ->map(fn ($value, $name) => ['@type' => 'PropertyValue', 'name' => $name, 'value' => (string) $value])
                ->values()->all(),
            'isRelatedTo' => $product->relationLoaded('relatedProducts')
                ? $product->getRelation('relatedProducts')
                    ->map(fn (StoreProduct $p) => ['@type' => 'Product', 'name' => $p->name, 'url' => self::url($p->publicPath())])
                    ->values()->all()
                : null,
            'subjectOf' => self::productVideos($product),
            'offers' => $offer + [
                'url' => $url,
                'warranty' => filled($product->warranty)
                    ? ['@type' => 'WarrantyPromise', 'description' => $product->warranty]
                    : null,
                'priceCurrency' => 'INR',
                /*
                 * The machine-readable form of the sentence already printed
                 * under the price. India requires a tax-inclusive figure, and
                 * `Money` extracts the GST rather than adding it — so the
                 * number here is what is charged, and saying so removes the one
                 * ambiguity a crawler would otherwise have to guess at.
                 */
                'priceSpecification' => [
                    '@type' => 'PriceSpecification',
                    'priceCurrency' => 'INR',
                    'valueAddedTaxIncluded' => true,
                ],
                'availability' => 'https://schema.org/'.match ($product->availability()) {
                    'in_stock' => 'InStock',
                    'backorder' => 'BackOrder',
                    default => 'OutOfStock',
                },
                'itemCondition' => ($product->condition ?? ProductCondition::New)->schemaUrl(),
                'shippingDetails' => self::shippingDetails(),
                'hasMerchantReturnPolicy' => self::returnPolicy($product),
                'seller' => self::publisher(),
            ],
        ] + self::reviews($product) + self::relationships(EntityLinks::for($product)));
    }

    /**
     * `aggregateRating` and up to five `review` nodes, from published reviews
     * only — and nothing at all until there is one.
     *
     * They were absent from every graph by decision until the shop had
     * reviews of its own (2026-09-26): inventing them was out of the question
     * and still is. The average and count are the product's stored summary,
     * the same two numbers the page and the card print; the reviews are the
     * ones the page opens on, so the markup names what is on the page.
     *
     * @return array<string, mixed>
     */
    private static function reviews(StoreProduct $product): array
    {
        $count = (int) ($product->rating_count ?? 0);

        if ($count < 1 || $product->rating_average === null) {
            return [];
        }

        $reviews = $product->relationLoaded('schemaReviews')
            ? $product->getRelation('schemaReviews')
            : collect();

        return [
            'aggregateRating' => [
                '@type' => 'AggregateRating',
                'ratingValue' => (string) $product->rating_average,
                'reviewCount' => $count,
                'bestRating' => 5,
                'worstRating' => 1,
            ],
            'review' => $reviews->map(fn (ProductReview $r) => [
                '@type' => 'Review',
                'author' => ['@type' => 'Person', 'name' => $r->display_name],
                'datePublished' => $r->published_at?->toDateString(),
                'name' => $r->title ?: null,
                'reviewBody' => $r->body,
                'reviewRating' => [
                    '@type' => 'Rating',
                    'ratingValue' => (int) $r->rating,
                    'bestRating' => 5,
                    'worstRating' => 1,
                ],
            ])->values()->all() ?: null,
        ];
    }

    /**
     * The product's YouTube videos as `VideoObject`s (2026-09-26) — only
     * those for which every property Google requires can be filled honestly.
     *
     * Required are `name`, `thumbnailUrl` and `uploadDate`. The name is the
     * video's title, or the product's where none was written — it is the
     * product's video, on the product's page. **The thumbnail is the uploaded
     * poster and nothing else**: YouTube's own `i.ytimg.com` frame is never
     * requested by this site and must not be claimed as one, so a video with
     * no poster is left out of the graph rather than given an invented
     * picture. `uploadDate` is when the product — the page carrying the
     * video — was last changed; the video's own publication date is YouTube's
     * and not something this application knows. `embedUrl` is the player the
     * page mounts.
     *
     * Uploaded files are left out of the graph: they are drawn on the page
     * with the same poster, but a self-hosted file has no stable publication
     * record behind it, and the plan's line was YouTube only. See
     * `docs/store.md` "Product video and zoom".
     *
     * @return array<int, array<string, mixed>>|null
     */
    private static function productVideos(StoreProduct $product): ?array
    {
        $nodes = collect($product->videos ?? [])
            ->filter(fn ($v) => is_array($v)
                && ($v['kind'] ?? null) === 'youtube'
                && filled($v['youtube_id'] ?? null)
                && filled($v['poster_path'] ?? null))
            ->map(fn (array $v) => [
                '@type' => 'VideoObject',
                'name' => filled($v['title'] ?? null) ? $v['title'] : $product->name,
                'description' => filled($v['title'] ?? null) ? $v['title'].' — '.$product->name : $product->name,
                'thumbnailUrl' => asset('storage/'.$v['poster_path']),
                'uploadDate' => $product->updated_at?->toIso8601String(),
                'embedUrl' => 'https://www.youtube-nocookie.com/embed/'.$v['youtube_id'],
            ])
            ->filter(fn (array $node) => filled($node['uploadDate']))
            ->values()
            ->all();

        return $nodes === [] ? null : $nodes;
    }

    /**
     * What delivery costs and how long it takes, as an Offer says it.
     *
     * Built from settings rather than stated here, so the page, this block and
     * the feed cannot make three different promises — see
     * `App\Support\Store\Fulfilment`.
     */
    private static function shippingDetails(): array
    {
        return [
            '@type' => 'OfferShippingDetails',
            'shippingRate' => [
                '@type' => 'MonetaryAmount',
                'value' => Money::toRupeeString(Fulfilment::shippingPaise()),
                'currency' => 'INR',
            ],
            'shippingDestination' => [
                '@type' => 'DefinedRegion',
                'addressCountry' => Fulfilment::COUNTRY,
            ],
            'deliveryTime' => [
                '@type' => 'ShippingDeliveryTime',
                'handlingTime' => [
                    '@type' => 'QuantitativeValue',
                    'minValue' => 0,
                    'maxValue' => Fulfilment::handlingDays(),
                    'unitCode' => 'DAY',
                ],
            ],
        ];
    }

    /**
     * Whether this can be sent back, and by when.
     *
     * `returnable` is a term of the sale already shown on the page and frozen
     * onto the order item, so this reports it rather than deciding it. A
     * non-returnable product emits `MerchantReturnNotPermitted` — the honest
     * answer, and one Google accepts; omitting the node entirely would leave
     * the listing claiming nothing while the page claims something.
     */
    private static function returnPolicy(StoreProduct $product): array
    {
        $policy = [
            '@type' => 'MerchantReturnPolicy',
            'applicableCountry' => Fulfilment::COUNTRY,
        ];

        if (! $product->returnable) {
            return $policy + ['returnPolicyCategory' => 'https://schema.org/MerchantReturnNotPermitted'];
        }

        return $policy + [
            'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
            'merchantReturnDays' => Fulfilment::returnDays(),
            'returnMethod' => 'https://schema.org/ReturnByMail',
            'returnFees' => 'https://schema.org/FreeReturn',
        ];
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
            'speakable' => self::speakable(),
            'areaServed' => $record->relationLoaded('locations')
                ? $record->locations->map(fn (Location $l) => self::place($l))->values()->all()
                : null,
        ] + self::relationships(EntityLinks::for($record)));
    }

    /**
     * What an assistant may read aloud, or quote: the page's headline and its
     * lede — the one- or two-sentence answer every solution, service, post
     * and article opens with (`PageHero`'s `lede`, an article's excerpt).
     * Selectors rather than ids, so every theme's hero qualifies without
     * stamping anything: each renders the lede as `p.lede` and there is one
     * `h1`. `docs/seo-audit-2026-09-18.md`, §3b.3.
     */
    private static function speakable(): array
    {
        return ['@type' => 'SpeakableSpecification', 'cssSelector' => ['h1', '.lede']];
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
            'speakable' => self::speakable(),
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
        ] + self::relationships(EntityLinks::for($record)));
    }

    /* ---------------------------------------------------- custom content */

    /**
     * An entry of a custom content type: an `Article` or a `WebPage`, as the
     * type says (`content_types.schema_type`), refined by the entry's own SEO
     * override where `SchemaTypes` allows it — the rule `article()` follows.
     *
     * An Article carries its dates, the publisher as author and the image; a
     * WebPage carries its name, its description and when it last changed.
     * Nothing else is claimed: an entry has no author column, so naming a
     * person would be invented.
     */
    public static function entry(Entry $entry): array
    {
        $base = $entry->relationLoaded('contentType') && $entry->contentType
            && in_array($entry->contentType->schema_type, ['Article', 'WebPage'], true)
            ? $entry->contentType->schema_type
            : 'Article';

        $url = self::url($entry->publicPath());
        $description = $entry->summary ? HtmlSanitiser::toText($entry->summary) : null;
        $image = $entry->image_path ? asset('storage/'.$entry->image_path) : null;
        $type = SchemaTypes::resolve($base, $entry->seo?->schema_type);

        if ($base === 'WebPage') {
            return self::graph([
                '@type' => $type,
                'name' => $entry->title,
                'description' => $description,
                'url' => $url,
                'image' => $image,
                'dateModified' => $entry->updated_at?->toIso8601String(),
                'publisher' => self::publisher(),
                'speakable' => self::speakable(),
            ] + self::relationships(EntityLinks::for($entry)));
        }

        return self::graph([
            '@type' => $type,
            'headline' => $entry->title,
            'description' => $description,
            'image' => $image,
            'datePublished' => ($entry->published_at ?? $entry->created_at)?->toIso8601String(),
            'dateModified' => $entry->updated_at?->toIso8601String(),
            'author' => self::publisher(),
            'publisher' => self::publisher(),
            'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $url],
            'url' => $url,
            'speakable' => self::speakable(),
        ] + self::relationships(EntityLinks::for($entry)));
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

    /**
     * The FAQPage gate: the record's FAQs and its `question` answer blocks as
     * one list, or null under two entries.
     *
     * **Never an `FAQPage` over one question.** Google's guidance treats a
     * page with a single Q&A as not an FAQ page, and a `mainEntity` of one
     * is the shape a template produces. Two is the floor, counted across
     * both sources — one FAQ and one question block is a real pair. The
     * block's `detail` rides in the answer text after the direct answer,
     * because it is what the page shows under it.
     *
     * @param  iterable<int, Faq>  $faqs
     * @param  iterable<int, AnswerBlock>  $blocks
     */
    public static function answerFaqs(iterable $faqs, iterable $blocks): ?array
    {
        $entries = [];

        foreach ($faqs as $faq) {
            $entries[] = self::question($faq->question, HtmlSanitiser::toText($faq->answer));
        }

        foreach ($blocks as $block) {
            if ($block->kind !== AnswerBlockKind::Question || ! filled($block->question)) {
                continue;
            }

            $text = trim($block->answer.' '.HtmlSanitiser::toText($block->detail ?? ''));
            $entries[] = self::question((string) $block->question, $text);
        }

        return count($entries) < 2 ? null : self::graph([
            '@type' => 'FAQPage',
            'mainEntity' => $entries,
        ]);
    }

    private static function question(string $name, string $text): array
    {
        return [
            '@type' => 'Question',
            'name' => $name,
            'acceptedAnswer' => ['@type' => 'Answer', 'text' => $text],
        ];
    }

    /**
     * The `entity` block's relationships, as the graph states them.
     *
     * `about` is what the page is *about* — its category and the solutions it
     * belongs to; `mentions` is everything else it names. Both are `Thing`
     * stubs with a name and a URL rather than full nodes, because the full
     * node lives on that thing's own page and a stub is a pointer to it.
     * Built from `EntityLinks`, so the page's "Related" sections and the
     * markup cannot disagree about what is connected.
     *
     * @param  array{brand?: array{name: string, path: string}, category?: array{name: string, path: string}, solutions: array<int, array{name: string, path: string}>, services: array<int, array{name: string, path: string}>, industries: array<int, array{name: string, path: string}>, articles: array<int, array{name: string, path: string}>}  $entity
     * @return array{about: array<int, array<string, string>>, mentions: array<int, array<string, string>>}
     */
    private static function relationships(array $entity): array
    {
        $thing = fn (array $link, string $type = 'Thing') => [
            '@type' => $type,
            'name' => $link['name'],
            'url' => self::url($link['path']),
        ];

        $about = array_map($thing, array_merge(
            isset($entity['category']) ? [$entity['category']] : [],
            $entity['solutions'],
        ));

        $mentions = array_merge(
            isset($entity['brand']) ? [$thing($entity['brand'], 'Brand')] : [],
            array_map($thing, $entity['services']),
            array_map($thing, $entity['industries']),
            array_map(fn (array $link) => $thing($link, 'Article'), $entity['articles']),
        );

        return ['about' => $about, 'mentions' => $mentions];
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
            'isPartOf' => ['@type' => 'WebSite', '@id' => self::url().'/#website', 'name' => self::company(), 'url' => self::url()],
            'about' => $page->brand
                ? ['@type' => 'Brand', 'name' => $page->brand->name]
                : null,
        ]);
    }
}
