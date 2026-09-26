<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One import from a WordPress site. See the 2026-09-27 migration for what
 * each column carries and `docs/wordpress-import.md` for the whole flow.
 */
class WordPressImport extends Model
{
    protected $table = 'wordpress_imports';

    public const SECTIONS = ['content', 'catalogue', 'customers', 'custom'];

    protected $fillable = [
        'uploaded_by', 'site_url', 'site', 'status', 'sections', 'decisions', 'progress',
        'analysis', 'counts', 'problems', 'error', 'expires_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'sections' => 'array',
            'decisions' => 'array',
            'progress' => 'array',
            'analysis' => 'array',
            'counts' => 'array',
            'problems' => 'array',
            'expires_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** A hash of a site's origin: scheme, host and port, lower-cased, no trailing slash. */
    public static function siteKey(string $url): string
    {
        $parts = parse_url(strtolower(trim($url)));
        $origin = ($parts['host'] ?? '').(isset($parts['port']) ? ':'.$parts['port'] : '').rtrim($parts['path'] ?? '', '/');

        return sha1($origin);
    }

    public function wants(string $section): bool
    {
        return in_array($section, $this->sections ?? [], true);
    }

    /** @return mixed a review decision, or its default */
    public function decision(string $key, mixed $default = null): mixed
    {
        return ($this->decisions ?? [])[$key] ?? $default;
    }

    /**
     * An import still being worked on by the queue. One at a time: two share
     * one queue and one review screen, and a commit racing a scan of the same
     * site would write the map twice.
     *
     * @param  Builder<static>  $query
     */
    public function scopeInFlight(Builder $query): void
    {
        $query->whereIn('status', ['pending', 'scanning', 'analysing', 'running']);
    }
}
