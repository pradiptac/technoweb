<?php

namespace App\Models;

use App\Support\Newsletter\CustomerGroupSync;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class NewsletterGroup extends Model
{
    protected $fillable = ['name', 'slug', 'description', 'source', 'is_active'];

    /**
     * A group whose membership is derived rather than curated.
     *
     * Only one exists today — the portal's customers — and it is identified by
     * this column rather than by its name or slug, both of which an editor may
     * change without meaning to change what the group *is*.
     */
    public function isManaged(): bool
    {
        return $this->source === CustomerGroupSync::SOURCE;
    }

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saving(function (self $group) {
            // Not `Sluggable`: a group has no public URL, so that trait's 301
            // would point one non-existent address at another — the same
            // reasoning `Slider` documents.
            if (blank($group->slug)) {
                $group->slug = static::uniqueSlug($group->name, $group->id);
            }
        });
    }

    private static function uniqueSlug(string $name, ?int $ignore): string
    {
        $base = Str::slug($name) ?: 'group';
        $slug = $base;
        $n = 2;

        while (static::where('slug', $slug)->when($ignore, fn ($q) => $q->whereKeyNot($ignore))->exists()) {
            $slug = $base.'-'.$n++;
        }

        return $slug;
    }

    public function subscribers(): BelongsToMany
    {
        return $this->belongsToMany(NewsletterSubscriber::class, 'newsletter_group_subscriber')
            ->withTimestamps();
    }
}
