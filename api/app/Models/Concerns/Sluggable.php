<?php

namespace App\Models\Concerns;

use App\Models\Redirect;
use Illuminate\Support\Str;

trait Sluggable
{
    public static function bootSluggable(): void
    {
        static::creating(function ($model) {
            if (blank($model->slug)) {
                $model->slug = $model->generateUniqueSlug($model->{$model->slugSource()});
            }
        });

        // A published record that changes slug leaves a 301 behind, so links
        // and rankings on the old URL are not lost.
        static::updating(function ($model) {
            if ($model->isDirty('slug') && filled($model->getOriginal('slug'))) {
                $base = $model->urlPrefix();

                Redirect::updateOrCreate(
                    ['from_path' => $base.'/'.$model->getOriginal('slug')],
                    [
                        'to_path' => $base.'/'.$model->slug,
                        'status_code' => 301,
                        'is_active' => true,
                        'created_automatically' => true,
                    ]
                );
            }
        });
    }

    public function generateUniqueSlug(string $source): string
    {
        $slug = Str::slug($source);
        $candidate = $slug;
        $i = 2;

        // On insert getKey() is null, and `id != null` matches no rows — which
        // would make every uniqueness check pass. Only exclude self on update.
        while (
            static::query()
                ->where('slug', $candidate)
                ->when($this->exists, fn ($q) => $q->whereKeyNot($this->getKey()))
                ->exists()
        ) {
            $candidate = $slug.'-'.$i++;
        }

        return $candidate;
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /** Column the slug is derived from. */
    protected function slugSource(): string
    {
        return 'title';
    }

    /** URL segment this model lives under, for redirect generation. */
    abstract public function urlPrefix(): string;
}
