<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** Reference data: the degrees and diplomas a role will accept. */
class JobQualification extends Model
{
    protected $fillable = ['name', 'sort_order'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function jobs(): BelongsToMany
    {
        return $this->belongsToMany(JobOpening::class);
    }
}
