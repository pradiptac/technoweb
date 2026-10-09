<?php

namespace App\Http\Requests;

use App\Support\LinkPattern;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

class StoreRedirectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Both paths are normalised to a leading slash and no trailing one, so
     * `/old/`, `old` and `/old` cannot become three rows that disagree — the
     * middleware looks the path up by exact match.
     */
    protected function prepareForValidation(): void
    {
        $this->merge(array_filter([
            'from_path' => $this->normalise($this->input('from_path')),
            'to_path' => $this->normaliseTarget($this->input('to_path')),
        ], fn ($v) => $v !== null));
    }

    /**
     * The destination, normalised only when it is a path.
     *
     * `normalise()` runs a value through `parse_url(PATH)`, which turns
     * `//evil.test` into `/evil.test` and `javascript:alert(1)` into
     * `/alert(1)` — both then pass the destination rule, having been quietly
     * rewritten into something harmless-looking. A protocol-relative address, a
     * backslash form or a scheme other than http(s) is left exactly as typed so
     * `LinkPattern` refuses it, rather than being repaired into a different
     * redirect than the one that was asked for.
     */
    private function normaliseTarget(mixed $path): ?string
    {
        if (is_string($path) && preg_match('#^\s*(?:[/\\\\]{2}|\\\\|(?!https?:)[a-z][a-z0-9+.\-]*:)#i', $path) === 1) {
            return trim($path);
        }

        return $this->normalise($path);
    }

    /** The uniqueness check on the source path; the update request tells it which row to ignore. */
    protected function uniqueFrom(): Unique
    {
        return Rule::unique('redirects', 'from_path');
    }

    private function normalise(mixed $path): ?string
    {
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $path = trim($path);

        // An absolute URL to another site is a legitimate target, so leave it
        // alone; only site-relative paths get normalised.
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        return '/'.trim(parse_url($path, PHP_URL_PATH) ?? $path, '/');
    }

    public function rules(): array
    {
        return [
            'from_path' => [
                'required', 'string', 'max:255', 'starts_with:/',
                $this->uniqueFrom(),
            ],
            /*
             * A path on this site or an http(s) URL, and nothing else. This was
             * never checked: the value becomes a `Location` header, so
             * `javascript:` or `//host` saved happily. The same rule a form's
             * `redirect_url` is held to.
             */
            'to_path' => ['required', 'string', 'max:255', 'different:from_path', LinkPattern::PAGE_RULE],
            // 308 and 307 preserve the request method; 302 and 307 are
            // temporary. Anything else is not a redirect a browser will follow
            // the way an editor expects.
            'status_code' => ['nullable', Rule::in([301, 302, 307, 308])],
            'is_active' => ['boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'from_path.required' => 'Give the path that should redirect.',
            'from_path.starts_with' => 'The path to redirect must start with a slash.',
            'from_path.unique' => 'Something already redirects from that path.',
            'to_path.required' => 'Give the destination.',
            'to_path.different' => 'A path cannot redirect to itself.',
            'to_path.regex' => 'Use a path on this site, starting with one slash, or a full http(s) address.',
            'status_code.in' => 'Use 301 (permanent), 308, 302 or 307.',
        ];
    }
}
