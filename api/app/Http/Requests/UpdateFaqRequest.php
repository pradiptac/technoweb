<?php

namespace App\Http\Requests;

use App\Http\Controllers\Api\V1\Admin\FaqController;
use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateFaqRequest extends FormRequest
{
    use SanitisesRichText;

    /**
     * Answers render through Prose on the public FAQ list, so they are rich
     * text and must be sanitised like any other body.
     */
    protected function richTextFields(): array
    {
        return ['answer'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'question' => ['sometimes', 'required', 'string', 'max:255'],
            'answer' => ['sometimes', 'required', 'string', 'max:4000'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            // Moving an FAQ means sending both halves; sending neither leaves
            // it where it is.
            'owner_type' => ['sometimes', 'required_with:owner_id', 'string', Rule::in(array_keys(FaqController::OWNERS))],
            'owner_id' => ['sometimes', 'required_with:owner_type', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'question.required' => 'Give the FAQ a question.',
            'answer.required' => 'Give the FAQ an answer.',
            'owner_type.required' => 'Choose what this FAQ belongs to.',
            'owner_type.in' => 'That is not something an FAQ can attach to.',
            'owner_id.required' => 'Choose which record this FAQ belongs to.',
        ];
    }
}
