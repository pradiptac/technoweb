<?php

namespace App\Http\Resources\Concerns;

use App\Support\CustomFields\CustomFields;

/**
 * A record's custom fields, in the two shapes the two sides want.
 *
 * Both are keyed on the `customValues` relation being loaded, never on the
 * route — the `IncludesSeo` rule — so an index that did not load it carries
 * no key and a detail read that did carries `{}` or `[]` for a record with
 * nothing typed rather than an absent key the frontend has to guard for.
 * Objects are cast so an empty map is `{}` in the JSON and not `[]`.
 *
 * The admin shape is the stored values keyed by field key, the URL of any
 * picture or file (`custom_field_media`) and the definitions that apply
 * (`custom_field_groups`), so the edit form needs nothing else. The public
 * shape is `custom_fields` — the list the page draws — and `custom_data`,
 * every applicable value keyed, hidden groups included.
 */
trait IncludesCustomFields
{
    /** @return array<string, mixed> */
    protected function adminCustomFields(): array
    {
        $loaded = $this->resource->relationLoaded('customValues');

        return [
            'custom_fields' => $this->when($loaded, fn () => (object) CustomFields::adminValues($this->resource)),
            'custom_field_media' => $this->when($loaded, fn () => (object) CustomFields::adminMedia($this->resource)),
            'custom_field_groups' => $this->when($loaded, fn () => CustomFields::definitions(CustomFields::targetOf($this->resource))),
        ];
    }

    /** @return array<string, mixed> */
    protected function publicCustomFields(): array
    {
        $loaded = $this->resource->relationLoaded('customValues');

        return [
            'custom_fields' => $this->when($loaded, fn () => CustomFields::publicFields($this->resource)),
            'custom_data' => $this->when($loaded, fn () => (object) CustomFields::publicData($this->resource)),
        ];
    }
}
