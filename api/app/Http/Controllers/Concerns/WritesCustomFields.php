<?php

namespace App\Http\Controllers\Concerns;

use App\Support\CustomFields\CustomFields;
use Illuminate\Database\Eloquent\Model;

/**
 * The `custom_fields` object a form posts, lifted out of the validated
 * attributes before mass assignment and written after the record exists.
 *
 * Lifted rather than left in: `preventSilentlyDiscardingAttributes` is on, so
 * the key in `create()`/`update()` would throw. Null — the request did not
 * carry the key — is "leave every value alone", which `CustomFields::save()`
 * honours.
 */
trait WritesCustomFields
{
    protected function pullCustomFields(array &$attributes): ?array
    {
        if (! array_key_exists('custom_fields', $attributes)) {
            return null;
        }

        $input = $attributes['custom_fields'];
        unset($attributes['custom_fields']);

        return is_array($input) ? $input : null;
    }

    protected function saveCustomFields(Model $model, ?array $input): void
    {
        CustomFields::save($model, $input);
    }
}
