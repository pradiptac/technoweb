<?php

namespace App\Http\Resources;

use App\Models\BlogCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A blog category, as a badge or a sidebar row.
 *
 * `posts_count` is present only when the query counted it — `whenCounted`, so
 * a badge on a card does not carry a number nobody renders, and the sidebar
 * gets one from the query that was built to produce it.
 */
/** @mixin BlogCategory */
class BlogCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'posts_count' => $this->whenCounted('publishedPosts'),
        ];
    }
}
