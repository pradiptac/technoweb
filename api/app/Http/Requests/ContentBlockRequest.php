<?php

namespace App\Http\Requests;

use App\Enums\ContentBlockType;
use App\Enums\PublishStatus;
use App\Models\ContentBlock;
use App\Support\Blocks\BlockRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Creating and editing a content block — one class for POST and PATCH, the
 * `PopupRequest` shape.
 *
 * The type is fixed once a block exists: a CTA does not become a pricing
 * table, because every shortcode embedding it names the type
 * (`[cta slug="…"]`). The layout may change within the type, and when it
 * does the `content` has to be sent with it and is checked against the new
 * layout's rules — the only rules that mean anything are the layout's own.
 */
class ContentBlockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    private function existing(): ?ContentBlock
    {
        $block = $this->route('content_block');

        return $block instanceof ContentBlock ? $block : null;
    }

    public function blockType(): ?ContentBlockType
    {
        return $this->existing()->type ?? ContentBlockType::tryFrom((string) $this->input('type'));
    }

    public function blockLayout(): ?string
    {
        $layout = $this->input('layout', $this->existing()?->layout);

        return is_string($layout) ? $layout : null;
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $type = $this->blockType();
        $block = $this->existing();

        $rules = [
            'type' => $creating ? ['required', Rule::enum(ContentBlockType::class)] : ['prohibited'],
            'layout' => [$creating ? 'required' : 'sometimes', 'string', Rule::in($type?->layoutValues() ?? [])],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:150'],
            'slug' => [
                'nullable', 'string', 'max:160', 'alpha_dash',
                Rule::unique('content_blocks', 'slug')->ignore($block?->getKey()),
            ],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'is_default' => ['sometimes', 'boolean'],
        ];

        // The content is checked whenever it is sent, and must be sent with a
        // new layout — against the layout the block will have after the save.
        $layout = $this->blockLayout();
        if ($type && $layout && in_array($layout, $type->layoutValues(), true)
            && ($creating || $this->has('content') || $this->has('layout'))) {
            $rules += BlockRules::for($type, $layout);
        }

        return $rules;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $type = $this->blockType();
            $layout = $this->blockLayout();

            if ($this->boolean('is_default') && $type !== ContentBlockType::Cta) {
                $v->errors()->add('is_default', 'Only a CTA banner can be the site default.');
            }
            if ($this->boolean('is_default') && $this->input('status', $this->existing()?->status?->value) !== PublishStatus::Published->value) {
                $v->errors()->add('is_default', 'Publish the banner to make it the site default — a draft cannot stand at the foot of every page.');
            }

            if ($type && $layout && is_array($this->input('content'))) {
                BlockRules::after($v, $type, $layout, $this->input('content'));
            }
        });
    }
}
