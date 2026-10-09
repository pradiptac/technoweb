<?php

namespace App\Http\Requests;

/**
 * The bulk body for a list whose records have no publish status — brands,
 * industries, the four kinds of category. The only action is `delete`;
 * `publish` is a 422 on `action`, as it would be for any unknown word.
 */
class BulkDeleteRequest extends BulkActionRequest
{
    public function actions(): array
    {
        return ['delete'];
    }
}
