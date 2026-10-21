<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Who has an edit screen open (C2). A row unseen for 60 seconds is ignored. */
class EditPresence extends Model
{
    protected $table = 'edit_presence';

    public $timestamps = false;

    protected $fillable = ['user_id', 'subject_type', 'subject_id', 'dirty', 'opened_at', 'last_seen_at'];

    protected function casts(): array
    {
        return ['dirty' => 'boolean', 'opened_at' => 'datetime', 'last_seen_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
