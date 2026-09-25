<?php

namespace App\Http\Resources;

use App\Models\ContentBlock;
use App\Support\Blocks\BlockPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A content block as the public site reads it — `data` through
 * `BlockPresenter`, so paths are URLs, a gated download's file is absent and
 * a stack's brands carry their own logos. No status, no default flag: the
 * site asks for published blocks only, and whether one is the default is a
 * question the endpoint answered.
 *
 * @mixin ContentBlock
 */
class ContentBlockResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'layout' => $this->layout,
            'name' => $this->name,
            'slug' => $this->slug,
            // `content`, not `data`: a resource array holding a `data` key is
            // not wrapped, and every read here is `{data: …}`.
            'content' => BlockPresenter::data($this->resource),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
