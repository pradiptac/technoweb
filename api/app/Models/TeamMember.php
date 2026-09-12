<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A person on the team, as the public site introduces them.
 *
 * Not a `User`: staff accounts are who may sign in to the console, and this
 * is who the company chooses to show. The two overlap and are not the same
 * list — a director with no console login is on the team page, a contractor
 * with one is not.
 *
 * No slug, no detail page. `department` is free text offered back through a
 * datalist of the values in use, and there is deliberately no phone column.
 */
class TeamMember extends Model
{
    protected $fillable = [
        'name', 'designation', 'department', 'photo_path', 'bio',
        'email', 'linkedin_url', 'status', 'sort_order',
    ];

    protected $attributes = [
        'status' => 'draft',
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'sort_order' => 'integer',
        ];
    }

    public function certifications(): HasMany
    {
        return $this->hasMany(TeamMemberCertification::class)->orderBy('sort_order')->orderBy('id');
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /**
     * The departments in use, for the console's datalist — so "Support" and
     * "support" do not become two groups on the team page.
     *
     * @return list<string>
     */
    public static function departments(): array
    {
        return static::query()
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->distinct()
            ->orderBy('department')
            ->pluck('department')
            ->all();
    }
}
