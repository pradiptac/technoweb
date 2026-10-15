<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A Google font copied to this server (0.179.0). Its id in a setting is `g-<slug>`. */
class GoogleFont extends Model
{
    protected $fillable = ['slug', 'family', 'category', 'faces', 'bytes'];

    protected function casts(): array
    {
        return ['faces' => 'array', 'bytes' => 'integer'];
    }

    public function id(): string
    {
        return 'g-'.$this->slug;
    }
}
