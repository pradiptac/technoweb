<?php

namespace App\Http\Resources\Concerns;

/**
 * Emit JSON-LD for this record, but only when it is the page.
 *
 * **Not `routeIs('*.show')`, and that is the whole reason this exists.** A
 * nested resource inherits its parent's route name, so twenty products rendered
 * inside `/solutions/networking` all believe they are a detail view — each one
 * then builds a Product graph, which touches `brand` and `category`, and with
 * `preventLazyLoading` on the endpoint 500s. `ProductResource` already carries a
 * comment about this exact trap for its `seo` key; the first cut of the schema
 * work walked straight into it anyway, which is a fair argument that the
 * comment was never going to be enough on its own.
 *
 * So the caller says. A controller rendering one record calls `withSchema()`;
 * anything nested does not, and gets nothing. There is no condition to evaluate
 * and no route name to be wrong about.
 */
trait IncludesSchema
{
    private bool $includeSchema = false;

    /** Mark this resource as the page, so it carries its structured data. */
    public function withSchema(): static
    {
        $this->includeSchema = true;

        return $this;
    }

    /**
     * The graph, or `MissingValue` so the key is absent rather than null.
     *
     * @param  callable(): (array|null)  $build
     */
    protected function schema(callable $build): mixed
    {
        return $this->when($this->includeSchema, $build);
    }
}
