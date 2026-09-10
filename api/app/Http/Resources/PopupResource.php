<?php

namespace App\Http\Resources;

use App\Models\Media;
use App\Models\Popup;
use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A popup, as the public site needs it.
 *
 * **`image_path` never appears here, and `sections` never does either.**
 *
 * The path is what a record stores and the browser has no use for it; the URL
 * is what renders. And the sections are resolved to path *patterns* by the
 * model, which is what keeps `App\Support\SiteSection` out of the browser
 * entirely — the frontend receives strings and matches strings, and never
 * learns that a section key exists. A second copy of that allowlist in
 * TypeScript is exactly the drift nothing type-checks across the wire, which
 * this project has already been caught by with `admin_path` and
 * `schema_type_options`.
 *
 * @mixin Popup
 */
class PopupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $dimensions = $this->dimensions();

        return [
            'id' => $this->id,
            'image' => filled($this->image_path) ? asset('storage/'.$this->image_path) : null,
            /*
             * Alt text lives with the file, resolved by path — the rule every
             * CMS image here follows. A popup is a picture carrying the whole
             * message, so an empty alt is the one that fails somebody: the
             * fallback is the popup's own name rather than "", because an
             * editor who has not written alt text has at least named the thing.
             */
            'image_alt' => MediaAlt::for($this->image_path) ?: $this->name,
            /*
             * The natural size, so the browser can reserve the box before the
             * bytes land. Absent rather than zero when the library has no row
             * for the path — the same triple, and the same reasoning, as the
             * logo on the public `/settings`.
             */
            'image_width' => $dimensions?->width,
            'image_height' => $dimensions?->height,

            'link_url' => $this->link_url,
            'link_new_tab' => (bool) $this->link_new_tab,

            // Patterns, never section keys. See the class note.
            'paths' => $this->matchPatterns(),

            'size' => $this->size?->value,
            'width' => $this->size?->width(),
            'frequency' => $this->frequency?->value,
            'delay_ms' => (int) $this->delay_ms,
        ];
    }

    /**
     * The media row behind the stored path, if the library has one.
     *
     * `withTrashed`, because deleting a media row fills the bin and keeps the
     * bytes: the path still serves, so the image still renders and its
     * dimensions are still the truth about it.
     */
    private function dimensions(): ?Media
    {
        if (blank($this->image_path)) {
            return null;
        }

        return Media::withTrashed()
            ->where('path', $this->image_path)
            ->first(['path', 'width', 'height']);
    }
}
