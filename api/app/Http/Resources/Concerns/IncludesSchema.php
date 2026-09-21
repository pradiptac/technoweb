<?php

namespace App\Http\Resources\Concerns;

use App\Support\EntityLinks;
use App\Support\StructuredData;
use Illuminate\Http\Resources\MissingValue;

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
 *
 * Since 2026-09-21 the same flag gates two more things only the page carries:
 * the `entity` block (`EntityLinks`) and the `faq_schema` graph, an `FAQPage`
 * over the record's FAQs and question blocks that exists only when there are
 * at least two of them. A resource with no graph of its own — a page, a
 * category, an industry — still calls `withSchema()` from its detail read for
 * those two; the name is older than the second job, and "this resource is the
 * page" is what it has always meant.
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

    /**
     * The `FAQPage` graph, or nothing: absent when this is not the page,
     * **and absent under two entries** — `StructuredData::answerFaqs()` is
     * the gate, and it is the only one. Read from the loaded `faqs` and
     * `publishedAnswerBlocks`; a relation the controller did not load counts
     * as none, never as a lazy load.
     */
    protected function faqSchema(): mixed
    {
        if (! $this->includeSchema) {
            return new MissingValue;
        }

        $faqs = $this->resource->relationLoaded('faqs') ? $this->resource->getRelation('faqs') : [];
        $blocks = $this->resource->relationLoaded('publishedAnswerBlocks') ? $this->resource->getRelation('publishedAnswerBlocks') : [];

        // Absent rather than null under the gate: `when()` would keep the
        // key with a null in it, and a null graph is a block the frontend
        // has to guard for.
        return StructuredData::answerFaqs($faqs, $blocks) ?? new MissingValue;
    }

    /** The `entity` block — what this record is connected to — on the page only. */
    protected function entity(): mixed
    {
        return $this->when($this->includeSchema, fn () => EntityLinks::for($this->resource));
    }
}
