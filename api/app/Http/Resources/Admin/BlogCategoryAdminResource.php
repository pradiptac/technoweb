<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BlogCategoryAdminResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'sort_order' => (int) $this->sort_order,
            // Every post, not only the published ones: this is the console,
            // and "three drafts are filed here" is what somebody needs before
            // they delete it.
            'posts_count' => $this->whenCounted('posts'),
        ];
    }
}
