<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One committed catalogue import: who, which file, the mapping applied, the
 * counts, and every refused line with its reason.
 *
 * `pending → running → completed` inside one request, or `failed` when the
 * file could not be read at all. A dry run writes no row — it is a report,
 * and a ledger of reports would be a ledger of nothing happening.
 *
 * `problems` is a list of `{line, sku, outcome, reason}`, capped at
 * `CatalogueImport::MAX_PROBLEMS` — a spreadsheet of five hundred bad rows is
 * a wrong mapping, and the first fifty say so as well as the five-hundredth.
 */
class StoreProductImport extends Model
{
    protected $fillable = ['uploaded_by', 'filename', 'file', 'mapping', 'status', 'counts', 'problems'];

    protected function casts(): array
    {
        return [
            'mapping' => 'array',
            'counts' => 'array',
            'problems' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
