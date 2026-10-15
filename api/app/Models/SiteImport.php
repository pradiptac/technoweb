<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One import of a website with no API. See the 2026-10-17 migration for what
 * each column carries and `docs/site-import.md` for the whole flow.
 */
class SiteImport extends Model
{
    protected $table = 'site_imports';

    /** What can be asked for: pages are always imported; these follow them. */
    public const SECTIONS = ['pages', 'menus', 'redirects'];

    protected $fillable = [
        'uploaded_by', 'source', 'site_url', 'site', 'zip_path', 'status', 'sections', 'settings', 'decisions',
        'progress', 'analysis', 'counts', 'problems', 'error', 'expires_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'sections' => 'array',
            'settings' => 'array',
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

    /**
     * A hash identifying a site across runs: `static:` and its host (and path
     * when the start address has one) for a URL, the ZIP's own name for an
     * upload. The import map is keyed on it.
     */
    public static function siteKey(string $source, string $url): string
    {
        if ($source === 'zip') {
            return sha1('static:zip:'.strtolower(trim($url)));
        }

        $parts = parse_url(strtolower(trim($url)));
        $host = preg_replace('/^www\./', '', (string) ($parts['host'] ?? ''));

        return sha1('static:'.$host.(isset($parts['port']) ? ':'.$parts['port'] : ''));
    }

    public function wants(string $section): bool
    {
        return $section === 'pages' || in_array($section, $this->sections ?? [], true);
    }

    /** @return mixed a review decision, or its default */
    public function decision(string $key, mixed $default = null): mixed
    {
        return ($this->decisions ?? [])[$key] ?? $default;
    }

    /**
     * An import still being worked on by the queue. One at a time: two share
     * one queue and one review screen.
     *
     * @param  Builder<static>  $query
     */
    public function scopeInFlight(Builder $query): void
    {
        $query->whereIn('status', ['pending', 'scanning', 'analysing', 'running']);
    }
}
