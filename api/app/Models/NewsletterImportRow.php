<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One line an import could not take, and why. Without these the summary says
 *  "22 invalid" and nobody can find out which 22. */
class NewsletterImportRow extends Model
{
    protected $fillable = ['newsletter_import_id', 'line_number', 'email', 'outcome', 'reason'];
}
