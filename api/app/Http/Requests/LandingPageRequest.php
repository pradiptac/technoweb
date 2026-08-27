<?php

namespace App\Http\Requests;

use App\Enums\LandingPageKind;
use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\LandingPage;
use App\Models\SeoMetadata;
use App\Support\LandingPageQuality;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Writing a landing page, and the one rule that makes this module safe.
 *
 * Store and update share a class because they share the gate and the gate is
 * most of the file — the only difference is which fields are `sometimes`, and
 * that is a method rather than a second copy of everything.
 *
 * **The publish check is here rather than in the controller or the model.**
 * The controller would work and would be one route away from being forgotten,
 * which is the argument that put `staff` on the whole admin group. A model
 * event would fire for every write including the seeder's and the console
 * command's, and can only throw — where what a person needs is the list of
 * reasons, in the 422 shape the admin forms already know how to render against
 * their own fields. `withValidator` gives exactly that.
 *
 * A page may always be saved as a draft. Nothing here obstructs work in
 * progress; it obstructs *publishing* work in progress.
 */
class LandingPageRequest extends FormRequest
{
    use SanitisesRichText;

    protected function richTextFields(): array
    {
        return ['intro', 'body'];
    }

    public function authorize(): bool
    {
        // The real gate is role:seo_manager on the route group. This mirrors
        // every other request in the project.
        return $this->user() !== null;
    }

    private function isCreate(): bool
    {
        return $this->route('landing_page') === null;
    }

    public function rules(): array
    {
        $sometimes = $this->isCreate() ? 'required' : 'sometimes';

        return [
            'kind' => [$sometimes, Rule::in(LandingPageKind::values())],
            'brand_id' => ['nullable', 'integer', Rule::exists('brands', 'id')],
            'product_category_id' => ['nullable', 'integer', Rule::exists('product_categories', 'id')],
            'solution_id' => ['nullable', 'integer', Rule::exists('solutions', 'id')],
            'service_id' => ['nullable', 'integer', Rule::exists('services', 'id')],
            'location_id' => ['nullable', 'integer', Rule::exists('locations', 'id')],

            'title' => [$sometimes, 'string', 'max:160'],
            'heading' => [$sometimes, 'string', 'max:200'],
            'intro' => ['nullable', 'string', 'max:20000'],
            'body' => ['nullable', 'string', 'max:200000'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],

            'seo' => ['sometimes', 'array'],
            'seo.title' => ['nullable', 'string', 'max:160'],
            'seo.description' => ['nullable', 'string', 'max:320'],
            'seo.canonical_url' => ['nullable', 'url', 'max:300'],
            'seo.og_image_path' => ['nullable', 'string', 'max:300'],
            'seo.robots' => ['nullable', 'string', 'max:80'],
            'seo.sitemap_include' => ['nullable', 'boolean'],

            'faqs' => ['sometimes', 'array'],
            'faqs.*.question' => ['required', 'string', 'max:300'],
            'faqs.*.answer' => ['required', 'string', 'max:5000'],
        ];
    }

    /**
     * Refuse to publish a page that has not earned it.
     *
     * The reasons are attached to `status`, because that is the field being
     * refused and `buildFormTabs` charges an error to the tab owning the key it
     * arrives under — an error keyed on something invisible would badge the
     * wrong tab or, worse, none of them.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;   // Say the obvious things first.
            }

            $status = $this->input('status', $this->existing()?->status?->value);

            if ($status !== PublishStatus::Published->value) {
                return;
            }

            $page = $this->candidate();
            $others = LandingPage::query()->whereKeyNot($page->id ?? 0)
                ->whereNotNull('intro')->get(['id', 'title', 'intro']);

            foreach (LandingPageQuality::reasons($page, $others) as $reason) {
                $validator->errors()->add('status', $reason);
            }
        });
    }

    /**
     * The page as it *would be* after this request, judged before it is saved.
     *
     * Filling an unsaved copy rather than judging the stored row is the whole
     * point: an editor who has just pasted an introduction is asking whether
     * *this* passes, and grading what is still in the database would answer a
     * question nobody asked — and would let a page be published on the strength
     * of text that the same request is about to overwrite.
     */
    private function candidate(): LandingPage
    {
        $page = $this->existing() ?? new LandingPage;
        $page = $page->replicate()->setRawAttributes(array_merge(
            $page->getAttributes(),
            array_intersect_key($this->validated(), array_flip([
                'kind', 'brand_id', 'product_category_id', 'solution_id', 'service_id',
                'location_id', 'title', 'heading', 'intro', 'body', 'status',
            ])),
        ));

        // `exists` and the id carry over so the cap check can tell an edit of a
        // live page from a request for a new slot, and so the uniqueness checks
        // do not compare the page against itself.
        if ($stored = $this->existing()) {
            $page->exists = true;
            $page->id = $stored->id;
            $page->setRelations($stored->getRelations());
        }

        // An override typed in this request beats the stored one when the gate
        // measures the metadata, for the same reason as the intro.
        if ($this->has('seo')) {
            $page->setRelation('seo', $this->mergedSeo($stored ?? null));
        }

        return $page;
    }

    private function mergedSeo(?LandingPage $stored): SeoMetadata
    {
        $seo = $stored?->seo ?? new SeoMetadata;
        $seo->fill(array_filter(
            (array) $this->input('seo', []),
            fn ($v, $k) => in_array($k, ['title', 'description', 'canonical_url', 'og_image_path', 'robots', 'sitemap_include'], true),
            ARRAY_FILTER_USE_BOTH,
        ));

        return $seo;
    }

    private function existing(): ?LandingPage
    {
        $route = $this->route('landing_page');

        return $route instanceof LandingPage ? $route->loadMissing(['seo', 'location']) : null;
    }
}
