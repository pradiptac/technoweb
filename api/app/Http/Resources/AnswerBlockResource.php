<?php

namespace App\Http\Resources;

use App\Models\AnswerBlock;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One answer block as the public page draws it.
 *
 * `heading` travels with the block rather than being looked up from the
 * kind in TypeScript — the section titles are the API's, so a rename here
 * reaches the page without a second list on the far side of the wire. No
 * id and no status: the set is already the published one, in order.
 */
/** @mixin AnswerBlock */
class AnswerBlockResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'kind' => $this->kind->value,
            'question' => $this->question,
            'answer' => $this->answer,
            'detail' => $this->detail,
            'heading' => $this->kind->heading(),
        ];
    }
}
