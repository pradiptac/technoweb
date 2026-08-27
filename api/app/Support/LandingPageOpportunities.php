<?php

namespace App\Support;

use App\Enums\LandingPageKind;
use App\Models\Brand;
use App\Models\LandingPage;
use App\Models\Location;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use Illuminate\Support\Facades\DB;

/**
 * Which combinations the data already justifies a page for.
 *
 * The important word is *already*. This does not enumerate brands against
 * categories and hand back the grid — it asks the catalogue which
 * intersections actually hold stock, and only those come back. The difference
 * is the difference between a useful module and a doorway-page generator, and
 * it is worth stating as a measured number rather than as a principle: against
 * the seeded catalogue — 8 brands, 10 categories, 9 solutions — the grid holds
 * **160 combinations and this returns 2**. The other 158 are pages about
 * hardware nobody stocks, which is precisely the set that gets a domain a
 * manual action.
 *
 * **Location combinations are proposed on a shorter leash than catalogue ones.**
 * A brand-and-category page is wrong when it is thin; a service-and-city page
 * is wrong when it is thin *and* is a claim about where the company sends
 * engineers. So a location is only offered at all once somebody has recorded
 * something concrete about working there, and the products of that set are
 * capped hard — see `locationCandidates()`.
 *
 * Nothing here writes. It reports, and `technoware:landing-pages --create`
 * turns a report into drafts.
 */
class LandingPageOpportunities
{
    /**
     * Service and solution pages offered per place, per run.
     *
     * The cross product is the entire risk in this feature and a long list is
     * an invitation to take all of it: shown twenty pairings, somebody creates
     * twenty drafts and then writes twenty introductions that are each other
     * with a noun changed. Four at a time means the fifth is a decision taken
     * on purpose rather than a checkbox ticked without noticing, and the
     * remainder is reported rather than hidden -- a cap nobody is told about is
     * indistinguishable from a bug.
     *
     * Raised from two now that the pairings come from `location_service` and
     * `location_solution` rather than from "the first two published services".
     * A pairing on this list is one somebody stated, so offering more of them
     * is offering more of somebody else's decisions rather than more guesses.
     */
    public const LOCATION_SUGGESTIONS = 4;

    /**
     * Pairings a run did not offer, by place.
     *
     * Reported because a cap nobody is told about is indistinguishable from a
     * bug -- the same rule this module follows everywhere else: say what was
     * dropped rather than let a shortened list read as a complete one.
     *
     * @var array<string, int>
     */
    private static array $heldBack = [];

    /** @return array<string, int> */
    public static function heldBack(): array
    {
        return self::$heldBack;
    }

    /**
     * Every candidate, newest evidence first, excluding pairs already covered.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function find(?LandingPageKind $only = null): array
    {
        $taken = self::existingKeys();

        $candidates = array_merge(
            self::brandCandidates(),
            self::brandCategoryCandidates(),
            self::brandSolutionCandidates(),
            self::locationCandidates(),
        );

        $candidates = array_values(array_filter(
            $candidates,
            fn (array $c) => ! isset($taken[$c['key']]) && ($only === null || $c['kind'] === $only->value),
        ));

        // Strongest evidence first: the pages most worth having should be the
        // ones somebody sees before they get bored of the list.
        usort($candidates, fn ($a, $b) => ($b['evidence']['products'] ?? 0) <=> ($a['evidence']['products'] ?? 0));

        return $candidates;
    }

    /**
     * Pairs that already have a page, so nothing is proposed twice.
     *
     * Keyed on the combination rather than on the path, because a page whose
     * brand has since been renamed has a different path and is still the same
     * page about the same two things.
     *
     * @return array<string, true>
     */
    private static function existingKeys(): array
    {
        return LandingPage::query()
            ->get(['kind', 'brand_id', 'product_category_id', 'solution_id', 'service_id', 'location_id'])
            ->mapWithKeys(fn (LandingPage $p) => [self::key(
                $p->kind?->value ?? '',
                $p->brand_id, $p->product_category_id, $p->solution_id, $p->service_id, $p->location_id,
            ) => true])
            ->all();
    }

    private static function key(string $kind, ?int ...$ids): string
    {
        return $kind.':'.implode(',', array_map(fn ($i) => $i ?? '-', $ids));
    }

    /* ------------------------------------------------------- the catalogue */

    private static function brandCandidates(): array
    {
        $rows = Product::query()->published()
            ->whereNotNull('brand_id')
            ->select('brand_id', DB::raw('count(*) as total'))
            ->groupBy('brand_id')
            ->having('total', '>=', LandingPageQuality::MIN_PRODUCTS)
            ->get();

        $brands = Brand::query()->whereIn('id', $rows->pluck('brand_id'))->get()->keyBy('id');

        return $rows->map(function ($row) use ($brands) {
            $brand = $brands[$row->brand_id] ?? null;
            if (! $brand) {
                return null;
            }

            return [
                'kind' => LandingPageKind::Brand->value,
                'key' => self::key(LandingPageKind::Brand->value, $brand->id, null, null, null, null),
                'title' => "{$brand->name} Networking Hardware",
                'heading' => "{$brand->name} hardware we supply and support",
                'path' => "/brands/{$brand->slug}",
                'brand_id' => $brand->id,
                'evidence' => ['products' => (int) $row->total, 'brand' => $brand->name],
            ];
        })->filter()->values()->all();
    }

    private static function brandCategoryCandidates(): array
    {
        $rows = Product::query()->published()
            ->whereNotNull('brand_id')->whereNotNull('product_category_id')
            ->select('brand_id', 'product_category_id', DB::raw('count(*) as total'))
            ->groupBy('brand_id', 'product_category_id')
            ->having('total', '>=', LandingPageQuality::MIN_PRODUCTS)
            ->get();

        $brands = Brand::query()->whereIn('id', $rows->pluck('brand_id'))->get()->keyBy('id');
        $categories = ProductCategory::query()->whereIn('id', $rows->pluck('product_category_id'))->get()->keyBy('id');

        return $rows->map(function ($row) use ($brands, $categories) {
            $brand = $brands[$row->brand_id] ?? null;
            $category = $categories[$row->product_category_id] ?? null;
            if (! $brand || ! $category) {
                return null;
            }

            return [
                'kind' => LandingPageKind::BrandCategory->value,
                'key' => self::key(LandingPageKind::BrandCategory->value, $brand->id, $category->id, null, null, null),
                'title' => "{$brand->name} {$category->name}",
                'heading' => "{$brand->name} {$category->name}",
                'path' => "/brands/{$brand->slug}/{$category->slug}",
                'brand_id' => $brand->id,
                'product_category_id' => $category->id,
                'evidence' => ['products' => (int) $row->total, 'brand' => $brand->name, 'category' => $category->name],
            ];
        })->filter()->values()->all();
    }

    private static function brandSolutionCandidates(): array
    {
        $rows = DB::table('product_solution')
            ->join('products', 'products.id', '=', 'product_solution.product_id')
            ->whereNull('products.deleted_at')
            ->where('products.status', 'published')
            ->whereNotNull('products.brand_id')
            ->select('products.brand_id', 'product_solution.solution_id', DB::raw('count(*) as total'))
            ->groupBy('products.brand_id', 'product_solution.solution_id')
            ->having('total', '>=', LandingPageQuality::MIN_PRODUCTS)
            ->get();

        $brands = Brand::query()->whereIn('id', $rows->pluck('brand_id'))->get()->keyBy('id');
        $solutions = Solution::query()->whereIn('id', $rows->pluck('solution_id'))->get()->keyBy('id');

        return $rows->map(function ($row) use ($brands, $solutions) {
            $brand = $brands[$row->brand_id] ?? null;
            $solution = $solutions[$row->solution_id] ?? null;
            if (! $brand || ! $solution) {
                return null;
            }

            return [
                'kind' => LandingPageKind::BrandSolution->value,
                'key' => self::key(LandingPageKind::BrandSolution->value, $brand->id, null, $solution->id, null, null),
                'title' => "{$brand->name} for {$solution->title}",
                'heading' => "{$brand->name} hardware for {$solution->title}",
                'path' => "/brands/{$brand->slug}/{$solution->slug}",
                'brand_id' => $brand->id,
                'solution_id' => $solution->id,
                'evidence' => ['products' => (int) $row->total, 'brand' => $brand->name, 'solution' => $solution->title],
            ];
        })->filter()->values()->all();
    }

    /* -------------------------------------------------------- the places */

    /**
     * What could be said about the places the company works in.
     *
     * Guarded three ways, because this is the half of the feature that goes
     * wrong: only active locations, only locations somebody has written
     * something concrete about, and only `LOCATION_SUGGESTIONS` service or
     * solution pages each. The location's own page is always offered — it is
     * the one page per city that is unambiguously worth having, and offering it
     * first is a nudge towards one good page rather than six thin ones.
     */
    private static function locationCandidates(): array
    {
        $locations = Location::query()->active()
            ->with(['services', 'solutions'])
            ->orderBy('sort_order')->orderBy('name')->get()
            ->filter(fn (Location $l) => $l->hasLocalSubstance());

        self::$heldBack = [];

        if ($locations->isEmpty()) {
            return [];
        }

        $out = [];

        foreach ($locations as $location) {
            $out[] = [
                'kind' => LandingPageKind::Location->value,
                'key' => self::key(LandingPageKind::Location->value, null, null, null, null, $location->id),
                'title' => "IT Infrastructure Support in {$location->name}",
                'heading' => "What we do in {$location->name}",
                'path' => "/locations/{$location->slug}",
                'location_id' => $location->id,
                'evidence' => ['products' => 0, 'location' => $location->fullName()],
            ];

            /*
             * Only pairings somebody stated.
             *
             * This is the change that turns the location half of the feature
             * from a guess into a fact. It used to pair every place with the
             * first two published services, which handed an editor an arbitrary
             * combination and asked them to write an introduction for it -- the
             * shortest path there is to a template with a noun substituted in.
             * `location_service` and `location_solution` hold an editorial
             * decision, so what comes back here answers "do we do this there"
             * rather than "what could we say".
             */
            $pairs = [];

            foreach ($location->services as $service) {
                $pairs[] = [
                    'kind' => LandingPageKind::ServiceLocation->value,
                    'key' => self::key(LandingPageKind::ServiceLocation->value, null, null, null, $service->id, $location->id),
                    'title' => "{$service->title} in {$location->name}",
                    'heading' => "{$service->title} in {$location->name}",
                    'path' => "/locations/{$location->slug}/{$service->slug}",
                    'location_id' => $location->id,
                    'service_id' => $service->id,
                    'evidence' => ['products' => 0, 'location' => $location->fullName(), 'service' => $service->title],
                ];
            }

            foreach ($location->solutions as $solution) {
                $pairs[] = [
                    'kind' => LandingPageKind::SolutionLocation->value,
                    'key' => self::key(LandingPageKind::SolutionLocation->value, null, null, $solution->id, null, $location->id),
                    'title' => "{$solution->title} in {$location->name}",
                    'heading' => "{$solution->title} in {$location->name}",
                    'path' => "/locations/{$location->slug}/{$solution->slug}",
                    'location_id' => $location->id,
                    'solution_id' => $solution->id,
                    'evidence' => ['products' => 0, 'location' => $location->fullName(), 'solution' => $solution->title],
                ];
            }

            if (count($pairs) > self::LOCATION_SUGGESTIONS) {
                self::$heldBack[$location->name] = count($pairs) - self::LOCATION_SUGGESTIONS;
            }

            array_push($out, ...array_slice($pairs, 0, self::LOCATION_SUGGESTIONS));
        }

        return $out;
    }

    /**
     * Why a location was passed over.
     *
     * Reported rather than left silent, because "no opportunities found" from a
     * screen with three cities in it reads as a broken feature. The answer is
     * almost always that nobody has written the local detail yet, and saying so
     * is the difference between a dead end and a next step.
     *
     * @return array<int, string>
     */
    public static function skippedLocations(): array
    {
        return Location::query()->orderBy('name')->get()
            ->reject(fn (Location $l) => $l->is_active && $l->hasLocalSubstance())
            ->map(fn (Location $l) => $l->is_active
                ? "{$l->name}: nothing recorded about working there — add an office address, a response time or a summary."
                : "{$l->name}: not marked as a place you work in.")
            ->values()->all();
    }
}
