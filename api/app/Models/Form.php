<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A form an editor assembled, addressed by slug from a shortcode.
 *
 * Like Slider, it deliberately avoids the Sluggable trait: a form has no URL
 * of its own, so the 301 that trait writes on a slug change would point at two
 * pages that do not exist.
 */
class Form extends Model
{
    protected $fillable = ['name', 'slug', 'status', 'submit_label', 'success_message', 'notify_email'];

    protected function casts(): array
    {
        return ['status' => PublishStatus::class];
    }

    protected static function booted(): void
    {
        static::creating(function (self $form) {
            if (blank($form->slug)) {
                $form->slug = $form->uniqueSlug($form->name);
            }
        });
    }

    public function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'form';
        $slug = $base;

        for ($n = 2; self::where('slug', $slug)->whereKeyNot($this->getKey())->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }

    public function fields(): HasMany
    {
        return $this->hasMany(FormField::class)->orderBy('sort_order')->orderBy('id');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(FormSubmission::class);
    }

    public function scopePublished(Builder $query): void
    {
        $query->where('status', PublishStatus::Published);
    }
}
