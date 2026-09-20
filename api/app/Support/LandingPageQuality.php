<?php

namespace App\Support;

use App\Enums\LandingPageKind;
use App\Enums\PublishStatus;
use App\Models\LandingPage;
use App\Models\Product;
use App\Models\Setting;

/**
 * What a generated page has to be before it is allowed to exist publicly.
 *
 * This is a **gate, not a score**. `SeoScore` grades a record an editor has
 * already decided to publish and hands them a list of improvements; this
 * refuses to publish at all. The difference is deliberate and it is the whole
 * reason the module is safe to build: a warning in a console is something a
 * person clicks past on a Friday, and the failure mode here is not one weak
 * page — it is two hundred of them, which is a manual action against the whole
 * domain rather than a poor ranking on one URL.
 *
 * Five things have to be true, and they were chosen because each one blocks a
 * *different* way of arriving at a doorway page:
 *
 * 1. **Evidence.** The combination has to be one the data already supports —
 *    three published products in that exact brand-and-category intersection,
 *    or a location the company can say something concrete about. This stops
 *    the cross product at source: pages are earned by inventory, never
 *    enumerated from a grid.
 *
 * 2. **A written intro of real length.** A generated page arrives with none,
 *    so it cannot publish until a person has written one.
 *
 * 3. **That intro is not a near-duplicate of another one.** The check that
 *    matters most, because it is the only one a determined template survives.
 *    Everything else passes for a page that is another page with the city name
 *    changed: it has evidence, it has four hundred words, it has a unique
 *    title. `TextSimilarity` is what notices they are the same page.
 *
 * 4. **A distinct title and description.** Two pages competing for one query
 *    is the self-inflicted half of this problem.
 *
 * 5. **A ceiling on how many may be published at once.** The one check that is
 *    about the set rather than the page. Volume is itself the risk signal, and
 *    a number an administrator has to raise deliberately is a speed bump in
 *    front of the mistake this module exists to prevent.
 *
 * Nothing here fetches a rendered page — the same rule and the same reason as
 * `SeoScore`: every check reads what is stored, so a draft that has never been
 * published can be judged, and an uncontrolled network call on an admin
 * request has already cost this project 12.5 seconds once.
 */
class LandingPageQuality
{
    /**
     * Published products required behind a catalogue page.
     *
     * Three, because two is a list and one is a redirect. A page about a brand
     * that has a single switch in a category should be that switch's page.
     */
    public const MIN_PRODUCTS = 3;

    /**
     * Words of written introduction.
     *
     * Not a word count for its own sake — it is the smallest amount of text in
     * which somebody must say something true and specific about this
     * particular combination. Forty is roughly three sentences.
     */
    public const MIN_INTRO_WORDS = 40;

    /**
     * The line above which two intros are the same page.
     *
     * Measured rather than picked: on realistic copy, a paragraph with the city
     * name substituted scores 0.67, one with the city and a clause changed
     * scores 0.55, and two intros about the same subject written separately
     * score 0.00. There is nothing at all between 0.01 and 0.54, so this sits
     * in an empty band rather than at the edge of either side, and neither a
     * cautious writer nor a lazy one lands near it by accident.
     * `tests/Unit/TextSimilarityTest.php` pins both ends.
     */
    public const MAX_SIMILARITY = 0.35;

    /** Fallback ceiling when the setting is absent — see `publishedCap()`. */
    public const DEFAULT_CAP = 40;

    /**
     * Judge one page.
     *
     * `$others` is every other landing page with an intro, which the caller
     * supplies rather than this class querying for it: the admin index judges
     * a whole list at once and one shared fetch is the difference between one
     * query and fifty.
     *
     * @param  iterable<int, LandingPage>  $others
     * @return array{publishable: bool, failures: array<int, array{key: string, label: string, detail: string}>, checks: array<int, array<string, mixed>>}
     */
    public static function gate(LandingPage $page, iterable $others = []): array
    {
        $checks = [
            self::evidence($page),
            self::introLength($page),
            self::introUnique($page, $others),
            self::titleUnique($page, $others),
            self::metadata($page),
            self::cap($page),
        ];

        $failures = array_values(array_map(
            fn (array $c) => ['key' => $c['key'], 'label' => $c['label'], 'detail' => $c['detail']],
            array_filter($checks, fn (array $c) => ! $c['passed']),
        ));

        return [
            'publishable' => $failures === [],
            'failures' => $failures,
            'checks' => $checks,
        ];
    }

    /** Convenience for the form request, which only needs the sentences. */
    public static function reasons(LandingPage $page, iterable $others = []): array
    {
        return array_map(
            fn (array $f) => "{$f['label']}: {$f['detail']}",
            self::gate($page, $others)['failures'],
        );
    }

    /* --------------------------------------------------------- the checks */

    /**
     * Is there anything here that a general page does not already cover?
     *
     * The catalogue family counts products in the exact intersection, which is
     * the number that makes the page worth having. The location family cannot
     * count anything — there is no such thing as "products in Kolkata" — so it
     * asks the only question that means anything instead: has a person written
     * down something true about working in this place. A location page with
     * neither an address, nor a response time, nor a paragraph is a template
     * with a name substituted into it, and that is the thing this module was
     * commissioned to avoid rather than to industrialise.
     */
    private static function evidence(LandingPage $page): array
    {
        $kind = self::kind($page);

        if (! $kind) {
            return self::check('evidence', 'Evidence', false, 'This page has no kind, so nothing can be counted for it.');
        }

        foreach ($kind->requires() as $column) {
            if (blank($page->{$column})) {
                return self::check('evidence', 'Evidence', false, "A {$kind->label()} page needs its ".str_replace('_id', '', $column).' set.');
            }
        }

        if ($kind->isLocal()) {
            $location = $page->location;

            if (! $location || ! $location->is_active) {
                return self::check('evidence', 'Evidence', false, 'The location is not marked as one you work in.');
            }

            /*
             * The place has to have something of its own to say — and it has to
             * say it itself. Nothing is inherited from a parent or a child here:
             * a state page borrowing Kolkata's response time is a state page
             * saying nothing about the state, which moves the template problem
             * up a level rather than solving it.
             */
            if (! $location->hasLocalSubstance()) {
                return self::check(
                    'evidence', 'Evidence', false,
                    "Nothing is recorded about working in {$location->name} — add an office address, a response time or a summary to the location before publishing pages about it.",
                );
            }

            /*
             * And for a service or solution page, somebody has to have said the
             * work is done there.
             *
             * This replaced a heuristic, and the change is the difference
             * between a tool and a doorway-page mill. The generator used to
             * pair every place with the first two published services, so an
             * editor was handed an arbitrary combination and asked to write an
             * introduction for it — which is the shortest path there is to a
             * template with a noun substituted in. Now the pairing is a fact
             * somebody entered, and a page for one nobody entered cannot be
             * published at all.
             */
            if ($kind === LandingPageKind::ServiceLocation) {
                $offered = $location->services()->whereKey($page->service_id)->exists();
                $name = $page->service?->title ?? 'That service';

                return self::check(
                    'evidence', 'Evidence', $offered,
                    $offered
                        ? "{$name} is marked as something you do in {$location->name}."
                        : "{$name} is not on the list of work you do in {$location->name}. Tick it on the place before publishing a page that says otherwise.",
                );
            }

            if ($kind === LandingPageKind::SolutionLocation) {
                $offered = $location->solutions()->whereKey($page->solution_id)->exists();
                $name = $page->solution?->title ?? 'That solution';

                return self::check(
                    'evidence', 'Evidence', $offered,
                    $offered
                        ? "{$name} is marked as something you deliver in {$location->name}."
                        : "{$name} is not on the list of work you do in {$location->name}. Tick it on the place before publishing a page that says otherwise.",
                );
            }

            return self::check('evidence', 'Evidence', true, "{$location->name} carries local detail of its own.");
        }

        $count = self::productCount($page);

        return self::check(
            'evidence', 'Evidence',
            $count >= self::MIN_PRODUCTS,
            $count >= self::MIN_PRODUCTS
                ? "{$count} published products stand behind this page."
                : "Only {$count} published ".($count === 1 ? 'product' : 'products').' match this combination; '.self::MIN_PRODUCTS.' are needed for it to say more than the category page already does.',
            ['products' => $count],
        );
    }

    /** Published products in this page's exact intersection. */
    public static function productCount(LandingPage $page): int
    {
        $kind = self::kind($page);

        if (! $kind || ! $kind->isCatalogue() || ! $page->brand_id) {
            return 0;
        }

        $query = Product::query()->published()->where('brand_id', $page->brand_id);

        if ($kind === LandingPageKind::BrandCategory) {
            $query->where('product_category_id', $page->product_category_id);
        }

        if ($kind === LandingPageKind::BrandSolution) {
            $query->whereHas('solutions', fn ($q) => $q->whereKey($page->solution_id));
        }

        return $query->count();
    }

    private static function introLength(LandingPage $page): array
    {
        $words = TextSimilarity::wordCount($page->intro);

        return self::check(
            'intro_length', 'Introduction',
            $words >= self::MIN_INTRO_WORDS,
            $words >= self::MIN_INTRO_WORDS
                ? "{$words} words written."
                : ($words === 0
                    ? 'Nothing has been written yet. A generated page is a starting point, not a page.'
                    : "{$words} words; ".self::MIN_INTRO_WORDS.' is the floor for something worth indexing.'),
            ['words' => $words],
        );
    }

    /**
     * Is this the same page as one that already exists?
     *
     * The check the whole module rests on. Everything else here passes for a
     * page that is another page with one noun changed — it has evidence, it
     * has length, it has its own title — and a hundred of those is the pattern
     * Google names as doorway pages. This is the only thing that can tell.
     *
     * Compared against every other landing page rather than only the published
     * ones, because two drafts written from the same template are the problem
     * caught early rather than a different problem.
     */
    private static function introUnique(LandingPage $page, iterable $others): array
    {
        $worst = 0.0;
        $against = null;

        foreach ($others as $other) {
            if ($other->id === $page->id || blank($other->intro)) {
                continue;
            }

            $score = TextSimilarity::score($page->intro, $other->intro);

            if ($score > $worst) {
                $worst = $score;
                $against = $other;
            }
        }

        $pct = (int) round($worst * 100);

        return self::check(
            'intro_unique', 'Written separately',
            $worst < self::MAX_SIMILARITY,
            $worst < self::MAX_SIMILARITY
                ? ($against ? "Closest other page shares {$pct}% of its phrasing." : 'Nothing else to compare against yet.')
                : "This reads as {$pct}% the same as “{$against?->title}”. Two pages that differ by a substituted word are one page with two URLs, which is the thing search engines penalise a whole domain for.",
            ['similarity' => round($worst, 3), 'closest' => $against?->title],
        );
    }

    private static function titleUnique(LandingPage $page, iterable $others): array
    {
        $mine = mb_strtolower(trim((string) $page->title));

        foreach ($others as $other) {
            if ($other->id !== $page->id && mb_strtolower(trim((string) $other->title)) === $mine) {
                return self::check('title_unique', 'Distinct title', false, "“{$other->title}” already uses this title. Two pages competing for one query cost both of them.");
            }
        }

        return self::check('title_unique', 'Distinct title', true, 'No other landing page uses this title.');
    }

    /**
     * Title and description within the lengths a search result actually shows.
     *
     * The same numbers as `SeoScore`, read from that class rather than copied,
     * because two sets of bounds that must agree are two sets of bounds that
     * will not.
     */
    private static function metadata(LandingPage $page): array
    {
        $seo = $page->resolvedSeo();
        $title = (string) ($seo['title'] ?? '');
        $description = (string) ($seo['description'] ?? '');

        $tLen = mb_strlen($title);
        $dLen = mb_strlen($description);

        if ($tLen === 0 || $tLen > SeoScore::TITLE_MAX) {
            return self::check('metadata', 'Metadata', false, $tLen === 0
                ? 'There is no title.'
                : "The title is {$tLen} characters; over ".SeoScore::TITLE_MAX.' is cut off in a search result.');
        }

        if ($dLen < SeoScore::DESCRIPTION_MIN || $dLen > SeoScore::DESCRIPTION_MAX) {
            return self::check('metadata', 'Metadata', false, $dLen === 0
                ? 'There is no description, and none can be derived because the introduction is empty.'
                : "The description is {$dLen} characters; ".SeoScore::DESCRIPTION_MIN.'–'.SeoScore::DESCRIPTION_MAX.' is what gets displayed.');
        }

        return self::check('metadata', 'Metadata', true, "Title {$tLen} characters, description {$dLen}.");
    }

    /**
     * How many of these may be live at once.
     *
     * The only check about the set rather than the page, and the one that
     * answers the actual brief. Every other rule here can be satisfied two
     * hundred times by somebody sufficiently determined; a ceiling cannot,
     * because raising it is a deliberate act performed by an administrator on
     * a settings screen that says what it is for.
     */
    private static function cap(LandingPage $page): array
    {
        // An already-published page is not asking for a new slot, so republishing
        // an edit must not be refused by a cap it is already inside.
        if ($page->exists && $page->getOriginal('status') === PublishStatus::Published->value) {
            return self::check('cap', 'Within the limit', true, 'Already published.');
        }

        $cap = self::publishedCap();
        $live = LandingPage::query()->published()->whereKeyNot($page->id ?? 0)->count();

        return self::check(
            'cap', 'Within the limit',
            $live < $cap,
            $live < $cap
                ? ($live + 1)." of {$cap} published."
                : "{$live} landing pages are already published and the limit is {$cap}. Raise it in Settings if that is a deliberate decision — volume is the part of this that carries risk.",
            ['published' => $live, 'cap' => $cap],
        );
    }

    public static function publishedCap(): int
    {
        $value = Setting::get('landing_page_cap');

        return is_numeric($value) && (int) $value > 0 ? (int) $value : self::DEFAULT_CAP;
    }

    /* -------------------------------------------------------------- plumbing */

    private static function kind(LandingPage $page): ?LandingPageKind
    {
        return $page->kind instanceof LandingPageKind
            ? $page->kind
            : LandingPageKind::tryFrom((string) $page->kind);
    }

    private static function check(string $key, string $label, bool $passed, string $detail, array $meta = []): array
    {
        return compact('key', 'label', 'passed', 'detail') + ['meta' => $meta];
    }
}
