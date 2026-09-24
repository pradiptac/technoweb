<?php

namespace App\Http\Controllers\Concerns;

use App\Enums\PublishStatus;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;

/**
 * The FAQs and the answer blocks an entity's form posts, written the same
 * way for every one of the eleven records that carry them.
 *
 * Its own trait rather than more of `WritesCmsEntities`, because a brand
 * has no SEO row and no publish date and still takes both of these — and a
 * trait is analysed in the context of every class using it, so a controller
 * that used the bigger one for two methods would report the other three's
 * findings as its own. Typed on the two contracts (`Faqable`, `Answerable`)
 * for the same reason: the analyser can see the relation on an interface
 * where it cannot on `Model`.
 */
trait WritesAnswerContent
{
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
    protected function saveFaqs(Faqable $model, ?array $faqs): void
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
     * Replaces an entity's answer blocks with what the form submitted — the
     * `saveFaqs()` contract exactly: null leaves them alone, `[]` clears
     * them, anything else is the whole new set in the submitted order.
     *
     * `status` defaults to published: a block somebody wrote and did not
     * mark as a draft is meant to be read. `question` is stored null where
     * blank, so a definition's row does not carry an empty string that
     * `filled()` and `?:` then have to agree about.
     */
    protected function saveAnswerBlocks(Answerable $model, ?array $blocks): void
    {
        if ($blocks === null) {
            return;
        }

        $model->answerBlocks()->delete();

        foreach (array_values($blocks) as $i => $block) {
            // create() through the relation so blockable_type comes from the
            // morph map — never set by hand.
            $model->answerBlocks()->create([
                'kind' => $block['kind'],
                'question' => filled($block['question'] ?? null) ? trim((string) $block['question']) : null,
                'answer' => trim((string) $block['answer']),
                'detail' => filled($block['detail'] ?? null) ? $block['detail'] : null,
                'status' => $block['status'] ?? PublishStatus::Published->value,
                'sort_order' => $i,
            ]);
        }
    }

    /**
     * The two keys every entity now accepts, lifted out of the validated
     * attributes before mass assignment. `preventSilentlyDiscardingAttributes`
     * is on, so leaving either in the array would throw on create/update.
     *
     * Returns each as null when the form did not send it — which
     * `saveFaqs()` and `saveAnswerBlocks()` read as "leave them alone".
     *
     * @return array{faqs: array|null, answer_blocks: array|null}
     */
    protected function pullAnswerContent(array &$attributes): array
    {
        $pulled = ['faqs' => null, 'answer_blocks' => null];

        foreach (array_keys($pulled) as $key) {
            if (array_key_exists($key, $attributes)) {
                $pulled[$key] = $attributes[$key];
                unset($attributes[$key]);
            }
        }

        return $pulled;
    }

    /** The write half of `pullAnswerContent()`. */
    protected function saveAnswerContent(Faqable&Answerable $model, array $content): void
    {
        $this->saveFaqs($model, $content['faqs'] ?? null);
        $this->saveAnswerBlocks($model, $content['answer_blocks'] ?? null);
    }
}
