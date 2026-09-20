<?php

namespace Tests\Feature;

use App\Models\Coupon;
use App\Models\MediaVersion;
use Illuminate\Database\ClassMorphViolationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every model an admin route binds must have a morph key.
 *
 * `ActivityLogger` records **every DELETE and every creation** under the admin
 * group, by rule rather than by a list of routes. It resolves the subject with
 * `getMorphClass()`, and `enforceMorphMap` throws for a model the map does not
 * know. The logger catches that and degrades to a null subject — so the row
 * survives and no longer says *what* was deleted, which is most of what it is
 * for. Nothing fails, nothing is logged, and the gap is invisible until
 * somebody reads the trail looking for the deletion they are investigating.
 *
 * `CLAUDE.md` states the rule — "Anything bindable in an admin route belongs in
 * this list" — and a rule stated in prose is one three models had already
 * drifted from: `BlogCategory` and `Gallery` were recent, and `Coupon` had been
 * missing since the store shipped.
 *
 * So this reads the real route table rather than a list somebody maintains. A
 * model added to a new admin route fails here on the commit that adds it, which
 * is the only moment the fix is cheap.
 */
class MorphMapCoverageTest extends TestCase
{
    /**
     * Every model class route-model-bound anywhere under the admin group.
     *
     * Taken from the route's own binding fields where Laravel has resolved them
     * and from the parameter name otherwise, then confirmed against the
     * controller's type hints — which is the part that actually knows, because
     * a parameter called `{medium}` is a `Media` and `{storeProduct}` is a
     * `StoreProduct`, and neither is derivable from the string.
     *
     * @return array<string, string> [parameter => model class]
     */
    private function boundModels(): array
    {
        $models = [];

        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/admin/')) {
                continue;
            }

            $action = $route->getAction('uses');

            if (! is_string($action) || ! str_contains($action, '@')) {
                continue;
            }

            [$controller, $method] = explode('@', $action, 2);

            if (! class_exists($controller) || ! method_exists($controller, $method)) {
                continue;
            }

            foreach ((new \ReflectionMethod($controller, $method))->getParameters() as $parameter) {
                $type = $parameter->getType();

                if (! $type instanceof \ReflectionNamedType || $type->isBuiltin()) {
                    continue;
                }

                $class = $type->getName();

                if (is_subclass_of($class, Model::class)) {
                    $models[$class] = $class;
                }
            }
        }

        return $models;
    }

    public function test_every_model_bound_in_an_admin_route_has_a_morph_key(): void
    {
        $map = array_flip(Relation::morphMap());
        $missing = [];

        foreach ($this->boundModels() as $class) {
            if (! isset($map[$class])) {
                $missing[] = class_basename($class);
            }
        }

        sort($missing);

        $this->assertSame(
            [],
            $missing,
            'These models are bound in an admin route but carry no morph key, so the activity '
            .'log records a deletion of them with no subject: '.implode(', ', $missing)
            .'. Add them to Relation::enforceMorphMap() in AppServiceProvider.'
        );
    }

    /**
     * The control the finding was proved with.
     *
     * A test that only asserts the absence of a problem passes just as happily
     * when it has stopped looking — so this pins that the mechanism it relies
     * on is real: an unmapped model throws, a mapped one does not.
     */
    public function test_an_unmapped_model_would_throw(): void
    {
        $this->assertSame('coupon', (new Coupon)->getMorphClass());

        // `MediaVersion` is deliberately absent from the map: nothing binds it
        // in a route, so it can never reach the logger. It is the honest
        // negative case for the check above.
        $this->expectException(ClassMorphViolationException::class);
        (new MediaVersion)->getMorphClass();
    }
}
