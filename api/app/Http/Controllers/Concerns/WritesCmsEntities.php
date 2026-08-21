<?php

namespace App\Http\Controllers\Concerns;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared write mechanics for CMS entities. Every one of them carries a
 * publish status and an optional SEO override, and both need handling that is
 * easy to get subtly wrong.
 */
trait WritesCmsEntities
{
    /**
     * Model attributes and the nested SEO override are validated together but
     * must be written separately: preventSilentlyDiscardingAttributes is on,
     * so passing `seo` to update() would throw rather than be ignored.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>|null}
     */
    protected function splitSeo(array $validated): array
    {
        $seo = $validated['seo'] ?? null;
        unset($validated['seo']);

        return [$validated, $seo];
    }

    /** Writes the override row only when there is something to write. */
    protected function saveSeo(Model $model, ?array $seo): void
    {
        if ($seo !== null) {
            // updateOrCreate through the relation, never a hand-set
            // seoable_type — the morph map stores "blog_post", not the FQCN.
            $model->seo()->updateOrCreate([], $seo);
        }
    }

    /**
     * Replaces an entity's FAQ set with what the form submitted.
     *
     * Replace rather than diff: the form has no stable identity for a row —
     * an editor reorders, retypes and deletes freely — so trying to match
     * submitted rows to existing ids would guess wrong. The set is small and
     * owned entirely by its parent, so replacing it is both simpler and
     * correct. sort_order comes from the submitted order.
     *
     * Null means "the form did not include FAQs at all", which must leave
     * them alone; an empty array means "the editor removed them all".
     */
    protected function saveFaqs(Model $model, ?array $faqs): void
    {
        if ($faqs === null) {
            return;
        }

        $model->faqs()->delete();

        foreach (array_values($faqs) as $i => $faq) {
            // create() through the relation so faqable_type comes from the
            // morph map — never set by hand.
            $model->faqs()->create([
                'question' => $faq['question'],
                'answer' => $faq['answer'],
                'sort_order' => $i,
            ]);
        }
    }

    /**
     * Publishing without naming a date means "now".
     *
     * Without this an editor hits Publish, the record is status=published with
     * a null published_at, and scopePublished filters it straight back out —
     * publishing looks like it silently failed. Only applies to entities that
     * actually have a published_at column.
     */
    protected function withPublishedAt(array $attributes, ?Model $existing = null): array
    {
        $status = $attributes['status'] ?? $existing?->status?->value;

        $becomingPublished = $status instanceof PublishStatus
            ? $status === PublishStatus::Published
            : $status === PublishStatus::Published->value;

        if ($becomingPublished
            && empty($attributes['published_at'])
            && $existing?->published_at === null) {
            $attributes['published_at'] = now();
        }

        return $attributes;
    }
}
