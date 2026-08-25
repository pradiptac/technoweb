<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FormFieldResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'name' => $this->name,
            'label' => $this->label,
            'placeholder' => $this->placeholder,
            'help' => $this->help,
            'required' => (bool) $this->required,
            'options' => $this->options ?? [],
            'width' => $this->width,
        ];
    }
}
