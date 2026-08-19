<?php

namespace App\Models;

use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TicketCategory extends Model
{
    use Sluggable;

    protected $fillable = ['name', 'slug', 'description', 'default_sla_hours', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/support/categories';
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }
}
