<?php

namespace App\Http\Resources\Admin;

use App\Models\ContentBlock;
use App\Support\Blocks\BlockPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A content block as the console edits it: `data` exactly as stored — paths,
 * brand ids and all — plus `media`, a URL for every stored path so the image
 * fields can show what they hold (a `CoverField` needs the URL, not only the
 * path), and `preview`, the public shape the Preview dialog renders.
 *
 * @mixin ContentBlock
 */
class ContentBlockAdminResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $data = $this->data ?? [];

        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'layout' => $this->layout,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status->value,
            'is_default' => $this->is_default,
            'shortcode' => '['.$this->type->value.' slug="'.$this->slug.'"]',
            // `content`, not `data`: a resource array holding a `data` key is
            // not wrapped, which would break the `{data: …}` every read has.
            'content' => $data,
            'media' => self::mediaUrls($data),
            'preview' => BlockPresenter::data($this->resource),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Every `*_path` value anywhere in `data`, mapped to its public URL.
     *
     * @param  array<mixed>  $data
     * @return array<string, string>
     */
    private static function mediaUrls(array $data): array
    {
        $urls = [];
        array_walk_recursive($data, function ($value, $key) use (&$urls) {
            if (is_string($key) && str_ends_with($key, '_path') && is_string($value) && $value !== '') {
                $urls[$value] = asset('storage/'.$value);
            }
        });

        return $urls;
    }
}
