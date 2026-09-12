<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A certificate the company holds — ISO 9001, an MSME registration, a
 * vendor accreditation with a certificate behind it.
 *
 * No slug and no `Sluggable`: it is listed on `/certifications` and has no
 * page of its own, the `Popup` reasoning. An engineer's own certifications
 * are `TeamMemberCertification`, a different thing.
 */
class Certification extends Model
{
    protected $fillable = [
        'name', 'issuer', 'certificate_number', 'image_path', 'file_path',
        'issued_on', 'valid_until', 'description', 'status', 'sort_order',
    ];

    // Mirrors the column defaults — a record created and serialised in one
    // breath has never been read back. See `Popup::$attributes`.
    protected $attributes = [
        'status' => 'draft',
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'issued_on' => 'date',
            'valid_until' => 'date',
            'sort_order' => 'integer',
        ];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /**
     * Published *and* still valid.
     *
     * The public endpoint asks for this and the console never does: a lapsed
     * ISO badge on a live page is a claim that is no longer true — the rule a
     * closed vacancy already follows — while an editor has to be able to see
     * the lapsed row to renew it.
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->published()
            ->where(fn (Builder $q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', today()));
    }

    public function isExpired(): bool
    {
        return $this->valid_until !== null && $this->valid_until->isBefore(today());
    }
}
