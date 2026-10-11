<?php

namespace App\Http\Requests;

use App\Support\DetailTemplates;
use App\Support\PageSections\SectionRules;
use Illuminate\Validation\Rule;

/**
 * The template screen's unsaved preview (`POST /admin/detail-templates/preview`):
 * the blocks as typed, checked by exactly the rules a save runs, around one
 * chosen record — and nothing written.
 */
class PreviewDetailTemplateRequest extends DetailTemplateRequest
{
    public function rules(): array
    {
        return [
            ...$this->sectionRules(),
            'type' => ['required', 'string', Rule::in(DetailTemplates::aliases())],
            'record_id' => ['required', 'integer', 'min:1'],
            'blocks' => ['required', 'array', 'min:1', 'max:'.SectionRules::MAX_SECTIONS],
        ];
    }

    public function templateType(): ?string
    {
        $type = $this->input('type');

        return is_string($type) && DetailTemplates::knows($type) ? $type : null;
    }

    protected function guardsCustomCode(): bool
    {
        return false;
    }
}
