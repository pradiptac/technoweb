<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Models\Concerns\HasSeo;
use Illuminate\Support\Str;
use ReflectionClassConstant;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * Every model carrying `HasSeo` is on the SEO overview, and nothing else is.
 *
 * `SeoController::ENTITIES` is a hand-written list of the record types the
 * overview scores, and it had drifted three times before anybody noticed —
 * `JobOpening` and `StoreProduct` carried the trait for months with no
 * score, no duplicate-title check and no Recheck button, and `StoreCategory`
 * after them (`API.md`, "Twelve record types now, not nine"). A type missing
 * from the list is a family of indexable pages nobody audits, and nothing
 * reports the difference.
 *
 * Same shape as `MorphMapCoverageTest`: read what the code actually declares
 * rather than a second list, so the commit that adds the trait to a model is
 * the commit this fails on.
 */
class SeoEntityCoverageTest extends TestCase
{
    /** @return list<class-string> */
    private function modelsWithSeo(): array
    {
        $classes = [];

        foreach (Finder::create()->files()->in(app_path('Models'))->depth(0)->name('*.php') as $file) {
            $class = 'App\\Models\\'.Str::before($file->getFilename(), '.php');

            if (class_exists($class) && in_array(HasSeo::class, class_uses_recursive($class), true)) {
                $classes[] = $class;
            }
        }

        sort($classes);

        return $classes;
    }

    /** @return list<class-string> */
    private function listedClasses(): array
    {
        $entities = (new ReflectionClassConstant(SeoController::class, 'ENTITIES'))->getValue();
        $classes = array_map(fn (array $row) => $row[0], $entities);
        sort($classes);

        return array_values($classes);
    }

    public function test_every_model_with_seo_is_on_the_overview(): void
    {
        $missing = array_diff($this->modelsWithSeo(), $this->listedClasses());

        $this->assertSame([], array_values($missing), 'Carries HasSeo and is absent from SeoController::ENTITIES: '.implode(', ', $missing));
    }

    public function test_the_overview_lists_nothing_without_seo(): void
    {
        $extra = array_diff($this->listedClasses(), $this->modelsWithSeo());

        $this->assertSame([], array_values($extra), 'On SeoController::ENTITIES without HasSeo: '.implode(', ', $extra));
    }

    public function test_the_list_is_not_empty(): void
    {
        $this->assertGreaterThanOrEqual(13, count($this->listedClasses()));
    }
}
