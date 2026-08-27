<?php

namespace App\Models;

use App\Models\Concerns\RepathsLandingPages;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Brand extends Model
{
    use RepathsLandingPages, Sluggable;

    protected $fillable = ['name', 'slug', 'logo_path', 'description', 'sort_order', 'is_featured'];

    protected function casts(): array
    {
        return ['is_featured' => 'boolean'];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/brands';
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /** Renaming a brand moves every landing page composed from it. See the trait. */
    public static function landingPageKeyColumn(): string
    {
        return 'brand_id';
    }
}
