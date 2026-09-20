<?php

namespace App\Http\Resources\Concerns;

use App\Http\Resources\SeoResource;

/**
 * The record's resolved SEO block, present only when the relation was
 * eager-loaded.
 *
 * Deliberately not keyed on the route: a nested resource inherits the
 * parent's route name, so an industry rendered inside `/solutions/{slug}`
 * used to think it was a detail view and lazy-load its own SEO row — the
 * same trap `IncludesSchema` exists for. And `relationLoaded`, not
 * `whenLoaded`: `whenLoaded` short-circuits to null when the relation is
 * loaded but empty, and most records have no override row — the derived
 * defaults are still wanted for those, which is what `resolvedSeo()` gives.
 *
 * Twelve public resources carried this expression under this comment
 * (2026-09-18); the expression is here once and the comment with it.
 */
trait IncludesSeo
{
    /** `seo` when the relation is loaded, `MissingValue` otherwise so the key is absent. */
    protected function seo(): mixed
    {
        return $this->when(
            $this->resource->relationLoaded('seo'),
            fn () => new SeoResource($this->resolvedSeo())
        );
    }
}
