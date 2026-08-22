<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRedirectRequest extends FormRequest
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
            'to_path' => $this->normalise($this->input('to_path')),
        ], fn ($v) => $v !== null));
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
                'sometimes', 'required', 'string', 'max:255', 'starts_with:/',
                Rule::unique('redirects', 'from_path')->ignore($this->route('redirect')),
            ],
            'to_path' => ['sometimes', 'required', 'string', 'max:255', 'different:from_path'],
            // 308 and 307 preserve the request method; 302 and 307 are
            // temporary. Anything else is not a redirect a browser will follow
            // the way an editor expects.
            'status_code' => ['sometimes', 'nullable', Rule::in([301, 302, 307, 308])],
            'is_active' => ['sometimes', 'boolean'],
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
            'status_code.in' => 'Use 301 (permanent), 308, 302 or 307.',
        ];
    }
}
