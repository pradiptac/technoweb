<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Reference data: "Fresher", "2-4 years", "Senior". Editable, not an enum. */
class JobExperienceLevel extends Model
{
    protected $fillable = ['name', 'min_years', 'max_years', 'sort_order'];

    protected function casts(): array
    {
        return ['min_years' => 'integer', 'max_years' => 'integer', 'sort_order' => 'integer'];
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(JobOpening::class, 'job_experience_level_id');
    }

    /** "2-4 years", or "5+ years" when there is no upper bound. */
    public function range(): string
    {
        if ($this->max_years === null) {
            return $this->min_years > 0 ? "{$this->min_years}+ years" : 'Any';
        }

        return "{$this->min_years}-{$this->max_years} years";
    }
}
