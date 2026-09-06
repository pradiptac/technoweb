<?php

namespace Tests\Feature;

use App\Http\Resources\BrandResource;
use App\Models\Brand;
use App\Models\Media;
use Database\Seeders\CatalogueSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The manufacturer catalogue and the real logos it now carries.
 *
 * These were generated text tiles — "BRAND / Cisco" on a gradient — for every
 * brand this install has ever had, because nobody had drawn a real one yet.
 * `CatalogueSeeder::applyRealLogo()` replaces them with vendored, sanitised
 * copies of each manufacturer's actual mark, and adds eighteen brands that
 * never existed before at all.
 *
 * What these pin is the one rule that makes that safe to do more than once:
 * a stored path this seeder recognises as its own gets refreshed, and a path
 * that does not — an admin's own upload — never does.
 */
class BrandCatalogueTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Named `seedCatalogue`, not `seed` — `InteractsWithDatabase` already
     * declares a `seed($class = …)` helper, and a zero-argument override of
     * it here would recurse into itself the moment this method reached for
     * `$this->seed(CatalogueSeeder::class)`.
     */
    private function seedCatalogue(): void
    {
        Storage::fake('public');
        $this->seed(CatalogueSeeder::class);
    }

    public function test_it_seeds_twenty_six_brands(): void
    {
        $this->seedCatalogue();

        $this->assertSame(26, Brand::count());
    }

    /** The original eight keep the shelf; nothing added since is promoted onto it. */
    public function test_only_the_original_eight_are_featured(): void
    {
        $this->seedCatalogue();

        $this->assertSame(8, Brand::where('is_featured', true)->count());
        $this->assertTrue((bool) Brand::where('slug', 'cisco')->value('is_featured'));
        $this->assertFalse((bool) Brand::where('slug', 'vmware')->value('is_featured'));
    }

    /**
     * Every brand this project has a vendored logo for gets one — a real
     * file on disk, sanitised, and recorded in the media library exactly as
     * an editor's own upload would be.
     */
    public function test_every_brand_gets_its_real_logo(): void
    {
        $this->seedCatalogue();

        foreach (['cisco', 'fortinet', 'hpe-aruba', 'dell-emc', 'sophos', 'ubiquiti', 'synology', 'apc',
            'tp-link', 'vmware', 'red-hat'] as $slug) {
            $brand = Brand::where('slug', $slug)->firstOrFail();

            $this->assertSame("media/seed/brands/{$slug}.svg", $brand->logo_path);
            Storage::disk('public')->assertExists($brand->logo_path);

            $bytes = Storage::disk('public')->get($brand->logo_path);
            // Not the generated placeholder — that one draws a "BRAND" label
            // and a gradient rectangle, neither of which a real logo has.
            $this->assertStringNotContainsString('BRAND', $bytes);
            $this->assertStringContainsString('<path', $bytes);

            $this->assertTrue(Media::where('path', $brand->logo_path)->exists());
        }
    }

    /**
     * The sanitiser actually ran, not merely was available to.
     *
     * These logos were fetched from outside the codebase — one npm package,
     * one Wikimedia Commons — so this is not a theoretical check. It pins
     * that a script tag could not survive the trip from source file to public
     * disk even though every vendored file here is already clean.
     */
    public function test_a_hostile_vendored_file_is_still_sanitised(): void
    {
        $path = resource_path('brand-logos/cisco.svg');
        $original = file_get_contents($path);

        try {
            file_put_contents(
                $path,
                '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0h10v10H0z"/></svg>',
            );

            $this->seedCatalogue();

            $bytes = Storage::disk('public')->get('media/seed/brands/cisco.svg');
            $this->assertStringNotContainsString('<script', $bytes);
            $this->assertStringContainsString('<path', $bytes);
        } finally {
            file_put_contents($path, $original);
        }
    }

    /**
     * An admin's own upload is never overwritten by a reseed.
     *
     * The discriminator is the path, not a flag: this seeder's own writes
     * always land at `media/seed/brands/{slug}.svg`, and a real upload through
     * the media library always lands at a hashed filename somewhere else. A
     * stored path outside that convention is therefore never this seeder's to
     * touch again.
     */
    public function test_an_admins_own_logo_survives_a_reseed(): void
    {
        $this->seedCatalogue();

        $brand = Brand::where('slug', 'cisco')->firstOrFail();
        $brand->forceFill(['logo_path' => 'media/9f8e7d6c5b4a.svg'])->save();

        $this->seed(CatalogueSeeder::class);

        $this->assertSame('media/9f8e7d6c5b4a.svg', $brand->fresh()->logo_path);
    }

    /** Reseeding a brand that already carries the vendored logo writes nothing new. */
    public function test_reseeding_an_already_vendored_logo_changes_nothing(): void
    {
        $this->seedCatalogue();

        $before = Brand::where('slug', 'cisco')->value('updated_at');

        $this->travel(1)->hours();
        $this->seed(CatalogueSeeder::class);

        $this->assertTrue(Brand::where('slug', 'cisco')->value('updated_at')->equalTo($before));
    }

    /**
     * `?v=<updated_at>`, the rule `Admin\MediaResource` already follows.
     *
     * `logo_path` is edited in place — this catalogue swapping a placeholder
     * for a real logo is exactly that — so without a version a browser that
     * had already fetched the old bytes at that path goes on serving them.
     */
    public function test_the_public_resource_versions_the_logo_url(): void
    {
        $this->seedCatalogue();

        $brand = Brand::where('slug', 'cisco')->firstOrFail();
        $logo = (new BrandResource($brand))->toArray(request());

        $this->assertStringContainsString('?v='.$brand->updated_at->timestamp, $logo['logo']);
    }
}
