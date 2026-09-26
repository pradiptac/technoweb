<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line in a visit request's trail — the ticket events shape, with a note.
 *
 * Append-only: nothing updates a row here, which is why there is no
 * `updated_at`. `user_id` is null for something the customer did (or the
 * system), and the console says "Customer" rather than a name for it.
 */
class VisitEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['visit_request_id', 'user_id', 'type', 'from_value', 'to_value', 'note'];

    /** @return BelongsTo<VisitRequest, $this> */
    public function visitRequest(): BelongsTo
    {
        return $this->belongsTo(VisitRequest::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
