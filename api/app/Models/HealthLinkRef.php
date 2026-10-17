<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A record that links to a HealthLink; a pivot row with no id of its own. */
class HealthLinkRef extends Model
{
    protected $table = 'health_link_refs';

    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = 'health_link_id';

    protected $guarded = [];
}
