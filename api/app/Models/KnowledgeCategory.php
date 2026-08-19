<?php

namespace App\Models;

use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KnowledgeCategory extends Model
{
    use Sluggable;

    protected $fillable = ['name', 'slug', 'description', 'sort_order'];

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/knowledge-base';
    }

    public function articles(): HasMany
    {
        return $this->hasMany(KnowledgeArticle::class);
    }
}
