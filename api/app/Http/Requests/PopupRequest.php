<?php

namespace App\Http\Requests;

use App\Enums\PopupFrequency;
use App\Enums\PopupSize;
use App\Enums\PopupTrigger;
use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Support\SiteSection;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * One request for creating and updating, because a popup has no field that
 * means something different on the second write — unlike a slug, which is why
 * the CMS entities split theirs.
 *
 * The authorisation is the route's `role:content_manager`, not a check here.
 */
class PopupRequest extends FormRequest
{
    /*
     * The trait's `prepareForValidation` would be shadowed by this class's own,
     * so it is aliased and called from it — otherwise `body` would reach the
     * database unsanitised while the `use` line read as though it were covered.
     */
    use SanitisesRichText {
        prepareForValidation as sanitiseRichText;
    }

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],

            /*
             * A picture, a message, or both. Neither alone is required here:
             * "at least one of the two" is decided in `withValidator`, from the
             * request where it settles the question and from the record where
             * it does not. `body` renders through Prose on every page the popup
             * targets, so it is declared in `richTextFields()` and sanitised
             * before it reaches validation, like every other body.
             */
            'image_path' => ['nullable', 'string', 'max:255'],
            'body' => ['nullable', 'string', 'max:20000'],

            /*
             * The same shape a menu's custom link is held to, and for the same
             * reason: it becomes an `href` on a live page. A path, an absolute
             * http(s) URL, a mailto or a tel — and nothing else, so a
             * `javascript:` URL cannot be stored.
             */
            'link_url' => ['nullable', 'string', 'max:2048', 'regex:#^(/[^\s]*|https?://[^\s]+|mailto:[^\s]+|tel:[^\s]+)$#i'],
            'link_new_tab' => ['sometimes', 'boolean'],

            /*
             * Validated against the allowlist rather than accepted as text. A
             * key the site does not know would be a popup targeting a page that
             * does not exist — stored happily, shown never, with nothing saying
             * why. The rule `MenuItemType::Section` already follows.
             */
            'sections' => ['sometimes', 'array'],
            'sections.*' => ['string', Rule::in(SiteSection::keys())],

            /*
             * A path or a wildcard. Checked for *shape* only — an editor
             * targeting a page they have not published yet is a legitimate
             * thing to do, so this cannot check that the route resolves.
             */
            'paths' => ['sometimes', 'array'],
            'paths.*' => ['string', 'max:300', 'regex:#^(\*|/[A-Za-z0-9\-._~/]*(\*)?)$#'],

            'size' => ['sometimes', Rule::enum(PopupSize::class)],
            'frequency' => ['sometimes', Rule::enum(PopupFrequency::class)],
            'trigger' => ['sometimes', Rule::enum(PopupTrigger::class)],

            // Floored at nothing and capped at a minute. A popup that waits
            // longer than that opens over whatever somebody moved on to.
            'delay_ms' => ['sometimes', 'integer', 'min:0', 'max:60000'],

            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],

            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $data = $v->getData();

            /*
             * Something to show. A popup with neither a picture nor a message
             * is a dialog with nothing in it, which is not a draft of anything
             * — refused on create, and on any PATCH that would clear the last
             * of the two. A PATCH mentioning neither is editing something else
             * and reads both from the record, the targeting gate's rule.
             */
            $mentionsContent = array_key_exists('image_path', $data) || array_key_exists('body', $data);

            if ($this->isMethod('POST') || $mentionsContent) {
                $image = array_key_exists('image_path', $data) ? $data['image_path'] : $this->route('popup')?->image_path;
                $body = array_key_exists('body', $data) ? $data['body'] : $this->route('popup')?->body;

                if (blank($image) && blank($body)) {
                    $v->errors()->add('body', 'Add a picture or write a message, or there is nothing to show.');
                }
            }

            /*
             * A window that ends before it begins shows the popup never, and
             * looks exactly like one that is simply not working. Compared here
             * rather than with `after:starts_at`, because that rule passes
             * silently when the field it names is absent — which on a PATCH
             * that sends only `ends_at` is every time.
             */
            $starts = $data['starts_at'] ?? $this->route('popup')?->starts_at;
            $ends = $data['ends_at'] ?? $this->route('popup')?->ends_at;

            if (filled($starts) && filled($ends) && strtotime((string) $starts) > strtotime((string) $ends)) {
                $v->errors()->add('ends_at', 'The end is before the start, so this would never show.');
            }

            /*
             * Somewhere to appear. Refused rather than saved as a popup that
             * targets nothing: it would sit in the list looking published and
             * appear on no page at all, which is the failure somebody spends an
             * afternoon on before checking the form.
             *
             * Only when the request is settling the question — a PATCH that
             * mentions neither key is editing something else.
             */
            $mentionsTargeting = array_key_exists('sections', $data) || array_key_exists('paths', $data);

            if (! $mentionsTargeting) {
                return;
            }

            $sections = $data['sections'] ?? $this->route('popup')?->sections ?? [];
            $paths = $data['paths'] ?? $this->route('popup')?->paths ?? [];

            if (count(array_filter((array) $sections)) === 0 && count(array_filter((array) $paths)) === 0) {
                $v->errors()->add('sections', 'Tick at least one section, or add a path, or this appears nowhere.');
            }
        });
    }

    /** The trait's default is `['body']`, which is the column; stated so the coverage is visible. */
    protected function richTextFields(): array
    {
        return ['body'];
    }

    /**
     * Absent arrays mean "leave them alone" on a PATCH and "none" on a POST,
     * which is the same rule every repeating field here follows. Normalising
     * them to a list also drops the string keys a checkbox grid posts.
     */
    protected function prepareForValidation(): void
    {
        $this->sanitiseRichText();

        foreach (['sections', 'paths'] as $key) {
            if ($this->has($key) && is_array($this->input($key))) {
                $this->merge([$key => array_values(array_filter(
                    array_map(fn ($v) => is_string($v) ? trim($v) : $v, $this->input($key)),
                    fn ($v) => $v !== '' && $v !== null,
                ))]);
            }
        }
    }
}
